package storage_test

import (
	"context"
	"net/url"
	"os"
	"testing"
	"time"

	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/candles"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"azuriya/backend/internal/storage"
	"azuriya/backend/internal/workspaces"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresPhase2WorkspacesAndCandlePersistence(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to a dedicated PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	schema := "azuriya_phase2_test_" + domain.NewID()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := admin.Exec(context.Background(), "DROP SCHEMA "+pgx.Identifier{schema}.Sanitize()+" CASCADE"); err != nil {
			t.Error(err)
		}
	}()
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()
	values.Set("search_path", schema)
	parsed.RawQuery = values.Encode()
	store, err := storage.Open(ctx, parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	a := auth.New(store, false)
	user, err := a.Register(ctx, "phase2@example.test", "phase2-storage-test-password", "Phase2 integration")
	if err != nil {
		t.Fatal(err)
	}
	e := engine.New(domain.EmptyState(), store.Save)
	if err = e.Bootstrap(ctx, user.TenantID, user.ID, "BROKER_DEMO"); err != nil {
		t.Fatal(err)
	}
	id := domain.Identity{TenantID: user.TenantID, UserID: user.ID}
	workspaceRepo := storage.NewWorkspaceRepository(store.Pool)
	service := workspaces.New(workspaceRepo, e.Snapshot)
	items, err := service.List(ctx, id)
	if err != nil || len(items) != 1 {
		t.Fatal("SQL default workspace missing", err)
	}
	w := items[0]
	name := "Persisted London desk"
	layout := "GRID_4"
	w, err = service.Update(ctx, id, w.ID, workspaces.Patch{Name: &name, Layout: &layout, Revision: &w.Revision})
	if err != nil {
		t.Fatal(err)
	}
	reopened := workspaces.New(storage.NewWorkspaceRepository(store.Pool), e.Snapshot)
	restored, err := reopened.Get(ctx, id, w.ID)
	if err != nil || restored.Name != name || restored.Layout != "GRID_4" || restored.Revision != 2 {
		t.Fatal("workspace did not survive service restart", err)
	}
	for _, foreign := range []domain.Identity{{TenantID: "foreign", UserID: id.UserID}, {TenantID: id.TenantID, UserID: "foreign-owner"}} {
		if _, err = reopened.Get(ctx, foreign, w.ID); err == nil {
			t.Fatal("SQL foreign workspace disclosed")
		}
		events, err := workspaceRepo.Events(ctx, foreign, 100)
		if err != nil || len(events) != 0 {
			t.Fatal("SQL foreign workspace audit disclosed", err)
		}
	}
	for _, statement := range []string{"UPDATE workspace_events SET event_type='ALTERED'", "DELETE FROM workspace_events", "TRUNCATE workspace_events"} {
		if _, err = store.Pool.Exec(ctx, statement); err == nil {
			t.Fatalf("workspace history mutation accepted: %s", statement)
		}
	}
	items, err = service.Delete(ctx, id, w.ID)
	if err != nil || len(items) != 1 || items[0].ID == w.ID {
		t.Fatal("SQL last deletion failed to preserve usable workspace", err)
	}
	events, err := service.Events(ctx, id, 100)
	if err != nil || len(events) != 4 {
		t.Fatalf("atomic workspace audit count: %d %v", len(events), err)
	}
	state := e.Snapshot()
	key := domain.MarketKey(id.TenantID, "EURUSD")
	instrument, quote := state.Instruments[key], state.Quotes[key]
	candleRepo := storage.NewCandleRepository(store.Pool)
	candleService := candles.New(candleRepo, 42)
	query := candles.Query{Interval: "1m", Limit: 500}
	history, err := candleService.History(ctx, id.TenantID, instrument, quote, query)
	if err != nil || len(history) != candles.SeedHistoryBars+1 {
		t.Fatalf("SQL historical candles: %d %v", len(history), err)
	}
	if !history[len(history)-1].Close.Equal(quote.Bid) {
		t.Fatal("SQL seeded history does not join current BID")
	}
	for _, interval := range candles.Supported {
		bars, err := candleRepo.History(ctx, id.TenantID, instrument.Symbol, candles.Query{Interval: interval.Name, Limit: 500})
		if err != nil || len(bars) != candles.SeedHistoryBars+1 {
			t.Fatalf("missing persisted interval %s: %d %v", interval.Name, len(bars), err)
		}
	}
	quote.Sequence++
	quote.Timestamp = quote.Timestamp.Add(time.Second)
	quote.Bid = quote.Bid.Add(domain.D("0.00002"))
	quote.Ask = quote.Ask.Add(domain.D("0.00002"))
	updates, err := candleService.OnQuote(ctx, quote)
	if err != nil || len(updates) == 0 {
		t.Fatal("SQL incremental candle commit failed", err)
	}
	candleRestart := candles.New(storage.NewCandleRepository(store.Pool), 999)
	restoredBars, err := candleRestart.History(ctx, id.TenantID, instrument, quote, query)
	if err != nil || !restoredBars[len(restoredBars)-1].Close.Equal(quote.Bid) {
		t.Fatal("candle restart lost current BID", err)
	}
	if replay, err := candleRestart.OnQuote(ctx, quote); err != nil || len(replay) != 0 {
		t.Fatal("persisted watermark failed to suppress duplicate quote", err)
	}
	window := candles.Query{Interval: "1m", Limit: 500, From: history[10].OpenTime, To: history[15].OpenTime}
	bars, err := candleRepo.History(ctx, id.TenantID, instrument.Symbol, window)
	if err != nil || len(bars) != 5 {
		t.Fatal("SQL candle time boundaries incorrect", err)
	}
	foreign, err := candleRepo.History(ctx, "foreign-tenant", instrument.Symbol, query)
	if err != nil || len(foreign) != 0 {
		t.Fatal("SQL candle history escaped tenant scope", err)
	}
	// A rejected candle transaction must not advance the durable watermark.
	series, exists, err := candleRepo.LoadSeries(ctx, id.TenantID, instrument.Symbol)
	if err != nil || !exists {
		t.Fatal(err)
	}
	invalidSeries := series.Clone()
	invalidSeries.LastQuote.Sequence++
	bad := series.Current["1m"]
	bad.OpenTime = bad.OpenTime.Add(2 * time.Minute)
	bad.CloseTime = bad.CloseTime.Add(2 * time.Minute)
	bad.High = domain.D("-1")
	if err = candleRepo.Save(ctx, invalidSeries, []candles.Candle{bad}); err == nil {
		t.Fatal("invalid candle transaction committed")
	}
	unchanged, _, err := candleRepo.LoadSeries(ctx, id.TenantID, instrument.Symbol)
	if err != nil || unchanged.LastQuote.Sequence != series.LastQuote.Sequence {
		t.Fatal("failed candle transaction advanced watermark", err)
	}
}
