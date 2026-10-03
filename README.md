# AZURIYA TRADING PLATFORM — Phase 2

A native, multi-tenant trading core and desktop-first web terminal. **All execution is simulated.** `PROP_SIMULATED` and `BROKER_DEMO` are supported; live internalized brokerage and external trading-platform integrations are disabled/out of scope.

The backend is a Go modular monolith with exact decimal finance, cookie authentication, account ownership enforcement, PostgreSQL durability, append-only ledger/audit history, and realtime WebSocket updates. The Next.js terminal provides persistent 1/2/4-chart workspaces, twelve historical candle intervals, risk-based order entry, chart protection editing, percentage closes, pending-order modification, command search, and an editable watchlist. Phase 1 account and trading behavior is retained.

## Phase 2 workspace

Use the layout toolbar to select one chart, two columns, two rows, or four charts. Each pane has independent symbol and interval settings; optional symbol and interval synchronization is explicit. Markets, the ticket, and the bottom activity panel can collapse and resize. Workspace preferences autosave to your authenticated account; the workspace menu supports create, rename, duplicate, reset, and delete. See [workspace behavior](docs/workspaces.md).

Candles represent **BID**. ASK is a separate optional line; executions still use the server's executable side. The initial 300 completed candles plus current candle are deterministic simulated backfill anchored to the current bid, stored in PostgreSQL and extended with committed quote updates. This is synthetic development history, not licensed historical market data.

The ticket supports LOTS, Risk %, and Risk $ with PRICE or absolute PRICE DISTANCE protection. Server previews show resolved quantity, loss/profit, risk/reward, margin, and remaining free margin. Submission recalculates against current server state. Position dialogs support 10/25/50/75/100% closes, protection, and validated breakeven; chart SL/TP and pending-entry handles support dragging or arrow keys followed by Enter.

Safe shortcuts: `/` market search, `M` markets, `O` ticket, `P` positions, `H` history, `Esc` dismiss, and `Ctrl/Cmd+K` commands. No shortcut submits a new trade. Connection loss marks quotes stale and disables order entry; reconnect obtains canonical state before returning to LIVE.

Startup applies forward migration `003_workspaces_candles.sql` without wiping Phase 1 accounts, orders, ledger, or audit data.

## Local development

Prerequisites: Go 1.24+, Node.js 22+, pnpm, and Docker Compose v2. Docker supplies PostgreSQL 16 and Redis 7. Use the same hostname (`localhost`) for the API and browser so local cookie behavior is consistent.

From PowerShell at the repository root:

```powershell
./scripts/setup-dev.ps1
docker compose up -d --wait
pnpm install
./scripts/start-backend.ps1
```

In a second terminal:

```powershell
pnpm --filter @azuriya/web-trader dev
```

Open [the landing page and interactive community demo](http://localhost:3000), or [the simulated trading terminal](http://localhost:3000/terminal). The landing page uses Instrument Sans and Phosphor icons; its community data and revenue calculator are illustrative. The local development login email is `demo@azuriya.local`; `scripts/setup-dev.ps1` generates its password in the ignored root `.env` as `DEMO_PASSWORD`. The same file holds a generated local PostgreSQL password. These are local-development credentials only. The setup script preserves an existing `.env`.

The backend automatically runs idempotent migrations and seeds the development tenant only when `SEED_DEMO=true`. The demo is **Azuriya Demo**, with a USD 100,000 `BROKER_DEMO` account, 1:100 leverage, hedging positions, and EURUSD, GBPUSD, USDJPY, XAUUSD, US100, BTCUSD. Registration creates a separate tenant and `PROP_SIMULATED` account. Passwords must contain 12–128 characters. Existing users are preserved; changing `DEMO_PASSWORD` later does not reset an existing database user's password.

For Bash, copy `.env.example` to `.env`, replace both password placeholders (including the password in `DATABASE_URL`), and create `apps/web-trader/.env.local` containing `NEXT_PUBLIC_API_URL=http://localhost:8080`. Then:

```bash
docker compose up -d --wait
pnpm install
set -a
. ./.env
set +a
cd backend
go run ./cmd/api
```

Run `pnpm --filter @azuriya/web-trader dev` in another terminal at the root. Backend listens on port 8080; frontend on 3000. Database/Redis ports bind to loopback only. `docker compose down` stops dependencies while retaining named database volumes. Keep `.env` out of source control.

For an explicitly ephemeral run, set `STORAGE_MODE=memory`. This disables persistence and is intended for isolated development/testing. PostgreSQL connection failures never silently switch the backend to memory.

## Visitor pages

The landing page is served at `/`. The dedicated [MT5 deposits page](http://localhost:3000/mt5-deposits) explains broker-enabled native payments with a local desktop/mobile walkthrough and supplied reference screens. These visitor pages do not process payments. The existing simulated terminal is at `/terminal`.

## Exercise the trading flow

1. Log in and select the demo account. Confirm the visible simulation label and connected realtime status.
2. Select EURUSD, choose BUY / MARKET, enter `0.10` lots, and submit. BUY executes at the current ask; the fill appears in History and its hedging position appears in Positions.
3. Watch bid/ask, position unrealized P&L, equity, and free margin update. Close the position; realized P&L moves into balance and the ledger.
4. Place a BUY LIMIT a few ticks below the current ask or a BUY STOP a few ticks above it. The server triggers when the simulated executable quote crosses the configured price. SELL uses bid for its entry triggers.
5. Add valid SL/TP in the ticket or edit an open position's protection. The engine closes the position when the executable close side crosses the protection price, even if the browser is disconnected.
6. Review fills and the authenticated `/api/v1/accounts/:id/events` and `/transactions` endpoints to inspect the committed audit/ledger history.

The simulated feed is a seeded random walk; a pending order at an arbitrary price is not guaranteed to trigger within a fixed time. Deterministic tests drive exact quote crossings for limit, stop, SL, and TP verification.

## Verification

```powershell
cd backend
go test ./...
go build ./cmd/api
cd ..
pnpm --filter @azuriya/web-trader test
pnpm --filter @azuriya/web-trader build
```

Run Go formatting with `gofmt -w` on changed Go source and frontend formatting using the workspace's configured formatting command. Integration tests exercise HTTP sessions, protected account resources, tenant isolation, and request replay; engine tests use exact injected prices for financial behavior. See [verification notes](docs/verification.md) for the actual checks run in this implementation session.

The PostgreSQL integration test is opt-in and uses a separate test database. Create it once with `docker compose exec postgres createdb -U azuriya azuriya_test`, then set `TEST_DATABASE_URL` to the same local connection string with database name `azuriya_test`. Run `go test -v ./internal/storage` from `backend`. The test creates/removes only its uniquely named schema and verifies migrations, durable replay after reopening, rollback, append-only history, and rejection of a second engine writer. Without `TEST_DATABASE_URL`, this test explicitly reports a skip.

For a browser smoke run, start the backend, install Chromium once with `pnpm --filter @azuriya/web-trader exec playwright install chromium`, then run `pnpm test:browser`. Playwright starts or reuses the local frontend and registers an isolated test workspace; no demo password is required. The smoke test covers order entry, protection editing, partial/full close, pending-order cancellation, history, activity, logout/login, and a mobile viewport. Docker image creation is available with `docker build -t azuriya-api ./backend`; Compose intentionally starts infrastructure only, matching the separate backend/frontend development flow.

Feed configuration: `FEED_SEED` sets the repeatable random-walk seed, `FEED_INTERVAL_MS` accepts 100–30000 ms, and `FEED_SPREAD_TICKS=0` preserves seeded instrument spreads (a positive integer sets the spread in each instrument's ticks). `EXECUTION_LATENCY_MS` accepts 0–1000 ms and applies one fixed policy to all users. There is no trader-specific slippage policy.

## Repository map

```text
AGENTS.md                     concise engineering invariants
docker-compose.yml            local PostgreSQL and Redis
.env.example                  non-secret configuration template
apps/web-trader/               Next.js trading terminal
packages/api-types/            versioned client contracts
packages/ui/                   shared presentation tokens/primitives
backend/
  cmd/api/                    application wiring and simulator loop
  internal/
    auth/ tenancy/            sessions and tenant/account authorization
    domain/ accounts/         canonical types and account invariants
    instruments/ marketdata/ pricing/
    orders/ execution/ positions/
    portfolio/ margin/ risk/   authoritative decimal account math
    engine/                   atomic trading orchestration
    audit/ storage/           append-only history and persistence
    httpapi/ realtime/        REST v1 and scoped WebSockets
  migrations/                 PostgreSQL schema
docs/                         architecture, domain, API, execution, verification
scripts/                      local setup/start helpers
```

## Design and scope

- [Architecture](docs/architecture.md): package boundaries, event delivery, persistence, and deployment model.
- [Domain model](docs/domain-model.md): tenant isolation, exact arithmetic, account/position/ledger invariants.
- [Execution model](docs/execution-model.md): bid/ask trigger behavior, simulation policy, and auditability.
- [API reference](docs/api.md): versioned requests, responses, errors, and realtime reconnection.

Phase 1 uses a single engine writer and transactional full-state persistence. This deliberately favors clear atomic behavior over scale; it is not an institutional production deployment. USD accounts and supported USDJPY conversion are implemented; general currency routing is deferred. Netting, external LP routing, live settlement, automated stop-out, commissions/swaps, payments, KYC, mobile/desktop apps, bots, and third-party trading-platform adapters are not implemented. The chart uses simulated data, not a licensed historical price feed.
