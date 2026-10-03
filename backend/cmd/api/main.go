package main

import (
	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/candles"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/httpapi"
	"azuriya/backend/internal/marketdata"
	"azuriya/backend/internal/realtime"
	"azuriya/backend/internal/storage"
	"azuriya/backend/internal/workspaces"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/redis/go-redis/v9"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"syscall"
	"time"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func integer(key string, fallback int64) (int64, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	return n, nil
}
func main() {
	if err := run(); err != nil {
		slog.Error("API stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var repo auth.Repository
	var pg *storage.Postgres
	state := domain.EmptyState()
	var persist func(context.Context, domain.State) error
	switch env("STORAGE_MODE", "postgres") {
	case "memory":
		slog.Warn("EPHEMERAL MEMORY MODE: accounts and sessions are lost on restart")
		repo = auth.NewMemoryRepository()
	case "postgres":
		url := os.Getenv("DATABASE_URL")
		if url == "" {
			return errors.New("DATABASE_URL is required (or explicitly set STORAGE_MODE=memory for ephemeral development)")
		}
		var err error
		pg, err = storage.Open(ctx, url)
		if err != nil {
			return fmt.Errorf("open postgres: %w", err)
		}
		defer pg.Close()
		if err = pg.Migrate(ctx); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
		slog.Info("PostgreSQL migrations applied")
		state, err = pg.Load(ctx)
		if err != nil {
			return fmt.Errorf("load engine: %w", err)
		}
		repo = pg
		persist = pg.Save
	default:
		return errors.New("STORAGE_MODE must be postgres or memory")
	}
	var cache *redis.Client
	if url := os.Getenv("REDIS_URL"); url != "" {
		options, err := redis.ParseURL(url)
		if err != nil {
			return err
		}
		cache = redis.NewClient(options)
		defer cache.Close()
		if err = cache.Ping(ctx).Err(); err != nil {
			return fmt.Errorf("configured Redis is unavailable: %w", err)
		}
	}
	origin := env("WEB_ORIGIN", "http://localhost:3000")
	adminOrigin := env("ADMIN_ORIGIN", "http://localhost:3001")
	secure := env("COOKIE_SECURE", "false") == "true"
	authService := auth.New(repo, secure)
	e := engine.New(state, persist)
	latency, latencyErr := integer("EXECUTION_LATENCY_MS", 0)
	if latencyErr != nil || latency < 0 || latency > 1000 {
		return errors.New("EXECUTION_LATENCY_MS must be between 0 and 1000")
	}
	profile := execution.Default()
	if latency > 0 {
		profile.ID = "simulated-fixed-latency-v1"
		profile.LatencyMode = "FIXED"
		profile.BaseLatencyMS = latency
	}
	if err := e.SetExecutionProfile(profile); err != nil {
		return err
	}
	hub := realtime.New(origin, adminOrigin)
	defer hub.Close()
	e.SetPublisher(hub.Publish)
	if env("SEED_DEMO", "false") == "true" {
		email := os.Getenv("DEMO_EMAIL")
		password := os.Getenv("DEMO_PASSWORD")
		if email == "" || len(password) < 12 {
			return errors.New("SEED_DEMO requires DEMO_EMAIL and DEMO_PASSWORD of at least 12 characters")
		}
		u, err := repo.UserByEmail(ctx, email)
		if errors.Is(err, auth.ErrCredentials) {
			u, err = authService.Register(ctx, email, password, "Azuriya Demo")
		}
		if err != nil {
			return fmt.Errorf("seed user: %w", err)
		}
		if err = e.Bootstrap(ctx, u.TenantID, u.ID, "BROKER_DEMO"); err != nil {
			return fmt.Errorf("seed account: %w", err)
		}
		slog.Info("Local demo user available", "email", email)
	}
	seed, err := integer("FEED_SEED", 42)
	if err != nil {
		return err
	}
	interval, err := integer("FEED_INTERVAL_MS", 1000)
	if err != nil || interval < 100 || interval > 30000 {
		return errors.New("FEED_INTERVAL_MS must be between 100 and 30000")
	}
	spread, err := integer("FEED_SPREAD_TICKS", 0)
	if err != nil || spread < 0 || spread > 1000 {
		return errors.New("FEED_SPREAD_TICKS must be 0..1000")
	}
	simulator := marketdata.NewSimulator(seed)
	simulator.SpreadTicks = spread
	var candleRepo candles.Repository = candles.NewMemoryRepository()
	var workspaceRepo workspaces.Repository = workspaces.NewMemoryRepository()
	if pg != nil {
		candleRepo = storage.NewCandleRepository(pg.Pool)
		workspaceRepo = storage.NewWorkspaceRepository(pg.Pool)
	}
	candleService := candles.New(candleRepo, seed)
	workspaceService := workspaces.New(workspaceRepo, e.Snapshot)
	projectQuote := func(quote domain.Quote) {
		updates, err := candleService.OnQuote(ctx, quote)
		if err != nil {
			slog.Error("candle projection failed; trading quote remains committed", "error", err, "symbol", quote.Symbol)
			return
		}
		for _, candle := range updates {
			hub.Broadcast(quote.TenantID, "", realtime.Envelope{Type: "candle.updated", Timestamp: quote.Timestamp, Sequence: candle.Sequence, Payload: candle})
		}
	}
	tick := func() error { return updateMarket(ctx, e, simulator, cache, projectQuote) }
	if err = tick(); err != nil {
		return fmt.Errorf("initial feed refresh: %w", err)
	}
	feedDone := make(chan struct{})
	go func() {
		defer close(feedDone)
		ticker := time.NewTicker(time.Duration(interval) * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := tick(); err != nil && !errors.Is(err, context.Canceled) {
					slog.Error("market update rejected", "error", err)
				}
			}
		}
	}()
	defer func() { stop(); <-feedDone }()
	health := func(ctx context.Context) error {
		check, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		if pg != nil {
			if err := pg.Healthy(check); err != nil {
				return err
			}
		}
		if cache != nil {
			return cache.Ping(check).Err()
		}
		return nil
	}
	config := httpapi.Config{WebOrigin: origin, AllowedOrigins: []string{adminOrigin}, SecureCookies: secure, Health: health}
	config.Candles = candleService
	config.Workspaces = workspaceService
	if pg != nil {
		config.AuditHistory = pg.Events
		config.AdminHistory = pg.AdminHistory
	}
	handler := httpapi.New(e, authService, hub, config)
	server := &http.Server{Addr: ":" + env("PORT", "8080"), Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	failure := make(chan error, 1)
	go func() {
		slog.Info("Azuriya API listening", "address", server.Addr, "execution", "SIMULATED", "storage", env("STORAGE_MODE", "postgres"))
		failure <- server.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	case err := <-failure:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
func updateMarket(ctx context.Context, e *engine.Engine, provider marketdata.MarketDataProvider, cache *redis.Client, projectQuote func(domain.Quote)) error {
	state := e.Snapshot()
	keys := make([]string, 0, len(state.Instruments))
	for key := range state.Instruments {
		keys = append(keys, key)
	}
	// Refresh conversion quotes first so persisted JPY positions can recover after downtime.
	sort.Slice(keys, func(i, j int) bool {
		a, b := state.Instruments[keys[i]], state.Instruments[keys[j]]
		aAlias := a.PriceSourceSymbol != "" && a.PriceSourceSymbol != a.Symbol
		bAlias := b.PriceSourceSymbol != "" && b.PriceSourceSymbol != b.Symbol
		if aAlias != bAlias {
			return !aAlias
		}
		if (a.Symbol == "USDJPY") != (b.Symbol == "USDJPY") {
			return a.Symbol == "USDJPY"
		}
		return keys[i] < keys[j]
	})
	for _, key := range keys {
		i := state.Instruments[key]
		var q domain.Quote
		var err error
		if i.PriceSourceSymbol != "" && i.PriceSourceSymbol != i.Symbol {
			committed := e.Snapshot()
			source, ok := committed.Quotes[domain.MarketKey(i.TenantID, i.PriceSourceSymbol)]
			if !ok {
				return domain.Err("QUOTE_UNAVAILABLE", "Native simulated price source is unavailable")
			}
			q, err = simulatedAliasQuote(i, source, state.Quotes[key].Sequence+1)
		} else {
			q, err = provider.Next(ctx, i, state.Quotes[key])
		}
		if err != nil {
			return err
		}
		if err = e.Tick(ctx, i.TenantID, q); err != nil {
			return fmt.Errorf("%s: %w", key, err)
		}
		if projectQuote != nil {
			projectQuote(q)
		}
		if cache != nil {
			data, err := json.Marshal(q)
			if err != nil {
				return err
			}
			if err = cache.Set(ctx, "quote:"+key, data, 60*time.Second).Err(); err != nil {
				slog.Warn("quote cache unavailable; authoritative state committed", "error", err)
			}
		}
	}
	return e.ProcessRollover(ctx, time.Now().UTC())
}

func simulatedAliasQuote(instrument domain.Instrument, source domain.Quote, sequence uint64) (domain.Quote, error) {
	if source.TenantID != instrument.TenantID || !instrument.TickSize.IsPositive() {
		return domain.Quote{}, domain.Err("INVALID_QUOTE", "Simulated alias requires tenant-scoped source and positive tick size")
	}
	quote := source
	quote.Symbol = instrument.Symbol
	quote.Sequence = sequence
	quote.Timestamp = time.Now().UTC()
	quote.Simulated = true
	quote.Bid = source.Bid.Div(instrument.TickSize).Floor().Mul(instrument.TickSize)
	quote.Ask = source.Ask.Div(instrument.TickSize).Ceil().Mul(instrument.TickSize)
	if !quote.Bid.IsPositive() || quote.Ask.LessThan(quote.Bid) {
		return domain.Quote{}, domain.Err("INVALID_QUOTE", "Simulated alias produced an invalid executable quote")
	}
	return quote, nil
}
