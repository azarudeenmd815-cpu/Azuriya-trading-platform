package storage_test

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func brokerStore(t *testing.T) (*storage.Postgres, context.Context) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a dedicated PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	t.Cleanup(cancel)
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := "azuriya_broker_test_" + domain.NewID()
	if _, err = pool.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		pool.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if !strings.HasPrefix(schema, "azuriya_broker_test_") {
			t.Fatal("unsafe schema cleanup")
		}
		if _, err := pool.Exec(context.Background(), "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE"); err != nil {
			t.Error(err)
		}
		pool.Close()
	})
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	params := parsed.Query()
	params.Set("search_path", schema)
	parsed.RawQuery = params.Encode()
	store, err := storage.Open(ctx, parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = store.Migrate(ctx); err != nil {
		t.Fatal("migration replay", err)
	}
	return store, ctx
}

func TestBrokerPersistenceCommitsMirrorsActorAuditAndRolloverAtomically(t *testing.T) {
	// A partial SQL commit would publish new policy while the snapshot or ledger
	// retained old values. An uncertain independent mirror is never authoritative.
	store, ctx := brokerStore(t)
	user, err := auth.New(store, false).Register(ctx, "broker-durable@example.test", "safe-broker-storage-password", "Broker durable")
	if err != nil {
		t.Fatal(err)
	}
	state := domain.Seed(user.TenantID, user.ID)
	now := time.Now().UTC()
	group := domain.TradingGroup{ID: "durable-group", TenantID: user.TenantID, Name: "Durable", Status: "ACTIVE", Revision: 1, CreatedAt: now, UpdatedAt: now}
	state.Broker.Groups[group.ID] = group
	state.Broker.Settings[user.TenantID] = domain.BrokerSettings{TenantID: user.TenantID, BrokerName: "Durable", BaseCurrency: "USD", DefaultTradingGroupID: group.ID, Timezone: "UTC", TradingEnabled: true, Revision: 1, CreatedAt: now, UpdatedAt: now}
	profile := domain.BrokerProfile{ID: "durable-pricing", TenantID: user.TenantID, Kind: "PRICING", Name: "Transparent", Status: "ACTIVE", Revision: 1, Pricing: &domain.PricingPolicy{Unit: "PRICE", AskMarkup: domain.D("0.00002")}, CreatedAt: now, UpdatedAt: now}
	state.Broker.Profiles[profile.ID] = profile
	state.Broker.ClientStatuses[user.TenantID+":"+user.ID] = "ACTIVE"
	var account domain.Account
	for key, a := range state.Accounts {
		a.TradingGroupID = group.ID
		a.Leverage = domain.D("125")
		cap := domain.D("75")
		a.MaxLeverageOverride = &cap
		state.Accounts[key] = a
		account = a
	}
	state.Positions["rollover-position"] = domain.Position{ID: "rollover-position", TenantID: user.TenantID, AccountID: account.ID, Symbol: "EURUSD", Status: "CLOSED"}
	state.Broker.RolloverKeys["rollover-position:2026-10-01"] = domain.RolloverCheckpoint{PositionID: "rollover-position", LocalDate: "2026-10-01", SwapPlanID: "legacy", RolloverAt: now, Amount: domain.D("-2.5")}
	state.Sequence = 1
	state.Events = append(state.Events, domain.Event{ID: domain.NewID(), TenantID: user.TenantID, AccountID: account.ID, UserID: user.ID, ActorUserID: user.ID, ActorRole: "OWNER", AggregateType: "broker_admin", AggregateID: profile.ID, Sequence: 1, Type: "BROKER_PROFILE_CREATED", Payload: json.RawMessage(`{"action":"created","reason":"deterministic fixture"}`), OccurredAt: now})
	if err = store.Save(ctx, state); err != nil {
		t.Fatal(err)
	}
	restored, err := store.Load(ctx)
	if err != nil || restored.Broker.Profiles[profile.ID].Name != "Transparent" || len(restored.Broker.RolloverKeys) != 1 {
		t.Fatal("broker reload failed", err)
	}
	var leverage, override, groupID string
	if err = store.Pool.QueryRow(ctx, "SELECT leverage::text,max_leverage_override::text,trading_group_id FROM trading_accounts WHERE id=$1", account.ID).Scan(&leverage, &override, &groupID); err != nil || leverage != "125" || override != "75" || groupID != group.ID {
		t.Fatal("account scalar mirrors diverged", err, leverage, override, groupID)
	}
	history, err := store.AdminHistory(ctx, user.TenantID, 0, 100)
	if err != nil || len(history) != 1 || history[0].ActorUserID != user.ID || history[0].ActorRole != "OWNER" || history[0].UserID != user.ID {
		t.Fatal("durable actor audit missing", err)
	}
	if history, err = store.AdminHistory(ctx, "foreign", 0, 100); err != nil || len(history) != 0 {
		t.Fatal("foreign admin audit disclosed", err)
	}
	failed := state.Clone()
	p := failed.Broker.Profiles[profile.ID]
	p.Name = "Must roll back"
	failed.Broker.Profiles[p.ID] = p
	a := failed.Accounts[account.ID]
	a.UserID = "missing-user"
	a.ID = "invalid-new-account"
	failed.Accounts[a.ID] = a
	if err = store.Save(ctx, failed); err == nil {
		t.Fatal("foreign key failure was committed")
	}
	var name string
	if err = store.Pool.QueryRow(ctx, "SELECT name FROM broker_profiles WHERE id=$1", profile.ID).Scan(&name); err != nil || name != "Transparent" {
		t.Fatal("broker mirror escaped rollback", err)
	}
	restored, err = store.Load(ctx)
	if err != nil || restored.Broker.Profiles[profile.ID].Name != "Transparent" {
		t.Fatal("snapshot escaped rollback", err)
	}
	for _, table := range []string{"audit_events", "broker_rollover_checkpoints"} {
		for _, statement := range []string{"UPDATE " + table + " SET payload='{}'::jsonb", "DELETE FROM " + table, "TRUNCATE " + table} {
			if _, err = store.Pool.Exec(ctx, statement); err == nil {
				t.Fatalf("immutable history changed: %s", statement)
			}
		}
	}
}

func TestBrokerMigrationPreservesExistingTradingTablesAndAddsTenantMirrors(t *testing.T) {
	// Missing broker tables would lose queryable configuration on restart; the
	// existing ledger must survive the forward migration unchanged.
	store, ctx := brokerStore(t)
	for _, name := range []string{"engine_state", "account_transactions", "audit_events", "broker_settings", "broker_profiles", "trading_groups", "symbol_groups", "broker_client_statuses", "broker_rollover_checkpoints"} {
		var exists bool
		if err := store.Pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", name).Scan(&exists); err != nil || !exists {
			t.Fatalf("missing %s: %v", name, err)
		}
	}
	user, err := auth.New(store, false).Register(ctx, "broker-directory@example.test", "safe-broker-storage-password", "Broker storage")
	if err != nil {
		t.Fatal(err)
	}
	members, err := store.TenantMembers(ctx, user.TenantID)
	if err != nil || len(members) != 1 || members[0].PasswordHash != "" {
		t.Fatal("SQL directory credential/scope boundary", err)
	}
	if members, err = store.TenantMembers(ctx, "foreign"); err != nil || len(members) != 0 {
		t.Fatal("SQL foreign members disclosed", err)
	}
}
