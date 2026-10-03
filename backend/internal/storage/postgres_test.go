package storage_test

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"azuriya/backend/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Run against a dedicated PostgreSQL database with TEST_DATABASE_URL. Each run
// creates and removes only its uniquely named test schema, never existing data.
func TestPostgresAtomicDurabilityReplayAndImmutableHistory(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a dedicated PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := "azuriya_test_" + domain.NewID()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if !strings.HasPrefix(schema, "azuriya_test_") {
			t.Fatal("unsafe test schema")
		}
		if _, cleanupErr := admin.Exec(context.Background(), "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE"); cleanupErr != nil {
			t.Errorf("cleanup: %v", cleanupErr)
		}
	}()
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	scopedDSN := parsed.String()
	store, err := storage.Open(ctx, scopedDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if store != nil {
			store.Close()
		}
	}()
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = store.Migrate(ctx); err != nil {
		t.Fatalf("migration is not repeatable: %v", err)
	}
	if second, secondErr := storage.Open(ctx, scopedDSN); secondErr == nil {
		second.Close()
		t.Fatal("two authoritative writers acquired the same database")
	}

	authService := auth.New(store, false)
	u, err := authService.Register(ctx, "durability@example.test", "isolated-storage-password", "Durability test")
	if err != nil {
		t.Fatal(err)
	}
	e := engine.New(domain.EmptyState(), store.Save)
	if err = e.Bootstrap(ctx, u.TenantID, u.ID, "BROKER_DEMO"); err != nil {
		t.Fatal(err)
	}
	var account domain.Account
	for _, a := range e.Snapshot().Accounts {
		account = a
	}
	id := domain.Identity{UserID: u.ID, TenantID: u.TenantID, Role: u.Role}
	request := domain.OrderRequest{ClientOrderID: "durable-order", Symbol: "EURUSD", Side: "BUY", Type: "MARKET", Quantity: domain.D("0.1")}
	order, err := e.Submit(ctx, id, account.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	state := e.Snapshot()
	if len(state.Fills) != 1 || len(state.Events) < 5 {
		t.Fatal("committed fill/audit missing")
	}
	var fillCount, auditCount, ledgerCount int
	if err = store.Pool.QueryRow(ctx, "SELECT count(*) FROM fills").Scan(&fillCount); err != nil {
		t.Fatal(err)
	}
	if err = store.Pool.QueryRow(ctx, "SELECT count(*) FROM audit_events").Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if err = store.Pool.QueryRow(ctx, "SELECT count(*) FROM account_transactions").Scan(&ledgerCount); err != nil {
		t.Fatal(err)
	}
	if fillCount != len(state.Fills) || auditCount != len(state.Events) || ledgerCount != len(state.Transactions) {
		t.Fatal("relational mirrors disagree with committed state")
	}
	for _, statement := range []string{
		"UPDATE audit_events SET event_type='ALTERED'",
		"DELETE FROM audit_events",
		"TRUNCATE audit_events",
		"UPDATE account_transactions SET amount=amount+1",
		"DELETE FROM account_transactions",
		"TRUNCATE account_transactions",
		"UPDATE fills SET payload='{}'::jsonb",
		"DELETE FROM fills",
		"TRUNCATE fills",
	} {
		if _, mutationErr := store.Pool.Exec(ctx, statement); mutationErr == nil {
			t.Fatalf("history mutation accepted: %s", statement)
		}
	}

	// A foreign-key violation late in Save must roll back earlier account updates.
	invalid := state.Clone()
	changed := invalid.Accounts[account.ID]
	changed.Balance = domain.D("999999")
	invalid.Accounts[account.ID] = changed
	badOrder := order
	badOrder.ID = domain.NewID()
	badOrder.ClientOrderID = "invalid-foreign-account"
	badOrder.AccountID = "nonexistent-account"
	invalid.Orders[badOrder.ID] = badOrder
	if err = store.Save(ctx, invalid); err == nil {
		t.Fatal("invalid transaction committed")
	}
	loaded, err := store.Load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !loaded.Accounts[account.ID].Balance.Equal(state.Accounts[account.ID].Balance) || len(loaded.Orders) != len(state.Orders) {
		t.Fatal("failed transaction changed authoritative snapshot")
	}
	var mirroredBalance string
	if err = store.Pool.QueryRow(ctx, "SELECT balance::text FROM trading_accounts WHERE id=$1", account.ID).Scan(&mirroredBalance); err != nil {
		t.Fatal(err)
	}
	if !domain.D(mirroredBalance).Equal(state.Accounts[account.ID].Balance) {
		t.Fatal("failed transaction changed relational account")
	}

	store.Close()
	store = nil
	reopened, err := storage.Open(ctx, scopedDSN)
	if err != nil {
		t.Fatal(err)
	}
	store = reopened
	loaded, err = store.Load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	restarted := engine.New(loaded, store.Save)
	replayed, err := restarted.Submit(ctx, id, account.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	if replayed.ID != order.ID || len(restarted.Snapshot().Fills) != 1 {
		t.Fatal("restart erased order idempotency")
	}
	beforeClose := restarted.Snapshot()
	position := beforeClose.Positions[order.PositionID]
	closed, err := restarted.Close(ctx, id, account.ID, position.ID, domain.CloseRequest{ClientOrderID: "durable-close"})
	if err != nil {
		t.Fatal(err)
	}
	if closed.Status != "CLOSED" {
		t.Fatal("position was not closed")
	}
	loaded, err = store.Load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Fills) != 2 || len(loaded.Transactions) != 2 {
		t.Fatal("close ledger/fill not persisted")
	}
	encoded, _ := json.Marshal(loaded.Accounts[account.ID])
	if !strings.Contains(string(encoded), `"balance":"`) {
		t.Fatal("persisted financial data lost decimal-string representation")
	}

	// Keep snapshots bounded while preserving every committed event in SQL.
	for index := 0; index < domain.RecentEventLimit+25; index++ {
		audit.Append(&loaded, u.TenantID, account.ID, "account", account.ID, "TEST_AUDIT_EVENT", map[string]int{"index": index}, time.Now().UTC())
	}
	expectedEventCount := len(loaded.Events)
	if err = store.Save(ctx, loaded); err != nil {
		t.Fatal(err)
	}
	bounded, err := store.Load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(bounded.Events) != domain.RecentEventLimit {
		t.Fatalf("snapshot event window is not bounded: %d", len(bounded.Events))
	}
	if err = store.Pool.QueryRow(ctx, "SELECT count(*) FROM audit_events").Scan(&auditCount); err != nil {
		t.Fatal(err)
	}
	if auditCount != expectedEventCount {
		t.Fatalf("snapshot trimming removed durable history: got %d want %d", auditCount, expectedEventCount)
	}
	page, err := store.Events(ctx, u.TenantID, account.ID, 0, 7)
	if err != nil || len(page) != 7 {
		t.Fatalf("newest audit page: %d %v", len(page), err)
	}
	if page[len(page)-1].Sequence != loaded.Sequence {
		t.Fatal("newest page omitted the newest event")
	}
	older, err := store.Events(ctx, u.TenantID, account.ID, page[0].Sequence, 7)
	if err != nil || len(older) != 7 {
		t.Fatalf("older audit page: %d %v", len(older), err)
	}
	if older[len(older)-1].Sequence >= page[0].Sequence {
		t.Fatal("exclusive cursor repeated events")
	}
	archived, err := store.Events(ctx, u.TenantID, account.ID, bounded.Events[0].Sequence, 500)
	if err != nil || len(archived) == 0 || archived[len(archived)-1].Sequence >= bounded.Events[0].Sequence {
		t.Fatalf("history outside the snapshot window is inaccessible: %d %v", len(archived), err)
	}
	for _, events := range [][]domain.Event{page, older} {
		for index := 1; index < len(events); index++ {
			if events[index-1].Sequence >= events[index].Sequence {
				t.Fatal("audit page is not in ascending sequence order")
			}
		}
	}
	for _, scope := range [][2]string{{"foreign-tenant", account.ID}, {u.TenantID, "foreign-account"}} {
		foreign, err := store.Events(ctx, scope[0], scope[1], 0, 7)
		if err != nil || len(foreign) != 0 {
			t.Fatalf("audit history escaped tenant/account scope: %d %v", len(foreign), err)
		}
	}
}
