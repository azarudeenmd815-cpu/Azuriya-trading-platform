# Phase 2 architecture

AZURIYA is a modular monolith with a Next.js trading terminal. The native core has no dependency on any external trading platform, liquidity provider, or broker. Every execution remains simulated.

```text
Deterministic simulator -> reference quote -> pricing profile -> client quote
                                         |                       |
                                         +------ order validation + pre-trade risk
                                                                 |
                                                      native simulated execution
                                                                 |
                                               fill -> hedging position -> P&L/margin
                                                                 |
                                                        account equity + audit
                                                                 |
                                          atomic PostgreSQL transaction -> realtime
                                                                 |
                                                versioned REST/WebSocket -> React
```

## Client and transport

`apps/web-trader` owns presentation, chart rendering, form input, and connection state. Shared API contracts live in `packages/api-types`; reusable presentation primitives live in `packages/ui`. Financial API values are decimal strings. Conversion to JavaScript numbers is permitted only at the chart rendering boundary. The server supplies account equity, margin, and execution results.

The versioned `/api/v1` HTTP layer authenticates sessions, validates bounded JSON requests, and delegates trading commands to the engine. WebSocket authentication uses the same session cookie. Account state and account events are filtered by authenticated tenant and owner. A browser-supplied tenant identifier never establishes access.

The terminal refetches canonical REST state after connection or reconnection. The socket is a notification stream, not a replacement for authoritative snapshots; the UI explicitly shows disconnected/reconnecting state. Domain events remain available through authenticated account history.

## Domain boundaries

| Package                   | Responsibility                                                           |
| ------------------------- | ------------------------------------------------------------------------ |
| `auth`, `tenancy`         | Passwords, sessions, memberships, authenticated scope and ownership      |
| `accounts`, `instruments` | Account lifecycle/configuration and tenant instrument specifications     |
| `marketdata`              | Provider interface, simulated reference ticks, sequence/quote validation |
| `pricing`                 | Profile-based executable bid/ask, separate from reference quotes         |
| `orders`, `risk`          | Request invariants, lifecycle, idempotency, available margin checks      |
| `execution`               | Native simulated fills, execution policy, reference snapshots            |
| `positions`               | Independent hedging positions and quantity-based closes                  |
| `portfolio`, `margin`     | Centralized decimal valuation, conversion, equity and margin formulas    |
| `audit`                   | Append-only, sequenced domain-event history                              |
| `engine`                  | Serialized orchestration of a complete trading transition                |
| `storage`                 | PostgreSQL persistence, transactions, migrations, optional Redis cache   |
| `realtime`, `httpapi`     | Scoped event delivery and versioned client interfaces                    |

Pure calculation packages do not import HTTP, React, PostgreSQL, or a third-party trading-platform SDK. Domain orchestration owns transaction boundaries. This separation allows later extraction without first distributing the system across many services.

## Transaction and delivery model

There is one authoritative engine writer. Each command or accepted tick operates on a copy of committed state under a mutex. PostgreSQL commits the new state snapshot together with append-only ledger and audit mirrors in a single transaction. The engine publishes changes only after persistence succeeds. A rolled-back transaction leaves authoritative state and published notifications unchanged. If the result of a commit becomes uncertain, the writer fails closed and readiness returns 503; restart reloads durable state before any further trading. Clients retain the same idempotency key when retrying after recovery. A PostgreSQL advisory lock rejects a second writer against the same database.

Durable state includes idempotency records, so restart does not erase replay protection. The in-memory engine and serialized snapshot retain only the most recent 1,000 domain events to bound snapshot overhead. Every committed event remains in the full append-only PostgreSQL audit table; the account events endpoint reads that table with a sequence cursor. SQL values are parameterized. Database triggers reject updates, deletes, and truncation of audit, ledger, and fill history. Administrative owners can still change database protections; application credentials and operational access must therefore be controlled.

This Phase 1 snapshot persistence is intentionally simple. It is suitable for a single-process development environment and modest datasets; full-state cloning and persistence are not a production-scale matching architecture. The repository and publisher boundaries provide seams for incremental persistence and a transactional outbox/durable event bus later. No Kafka, NATS, Kubernetes, or external settlement is introduced.

PostgreSQL is required by default. `STORAGE_MODE=memory` is an explicit ephemeral development/test option; it is never a fallback after database failure. Redis is non-authoritative and may be used for quote caching. If `REDIS_URL` is configured, startup and readiness require Redis. A runtime cache-write failure is logged after the authoritative transaction commits; PostgreSQL/domain state remains the source of truth. Leave `REDIS_URL` unset for an explicit no-cache development run.

## Market data and execution

The simulator emits seeded random-walk reference quotes for EURUSD, GBPUSD, USDJPY, XAUUSD, US100, and BTCUSD. Given a fixed seed and starting state, price steps are repeatable. Tests inject exact quotes directly. Instrument tick size, quantity step, trading status, quote validity, and free margin are checked server-side. Triggered pending orders pass risk validation again.

The pricing profile supplies client bid/ask from a reference quote and records the distinction in fills. Pricing is profile/instrument based. No rule depends on a trader's profitability. The execution profile defines simulated latency and slippage policy; there is no external LP execution.

## Operational scope

The default local topology is one backend, one Next.js process, PostgreSQL 16, and Redis 7. Bind infrastructure ports to localhost. For an Internet deployment, configure TLS, secure cookies, an exact allowed browser origin, secret storage, database backups, observability, and an operational security review. Those deployment controls do not turn simulated accounts into live brokerage accounts.

## Phase 2 candle and workspace boundaries

`internal/candles` owns interval alignment, exact-decimal BID aggregation, deterministic synthetic history, and the candle repository contract. `internal/workspaces` owns validated preferences, tenant/user/account ownership, revision conflicts, lifecycle rules, and its repository contract. Neither depends on HTTP or a chart vendor. PostgreSQL adapters live in `storage`; memory adapters support deterministic tests and explicit ephemeral mode.

Migration 003 adds `candles`, `candle_series`, `trading_workspaces`, and append-only `workspace_events`. Existing Phase 1 tables and records remain intact. Candle series watermarks reject replay regression; candle writes and their series checkpoint commit together. Completed bars cannot be overwritten through the repository. First history access seeds 300 completed bars and a forming bar for every supported interval, all from the same deterministic multiscale BID path anchored to the committed quote. The seed combines feed seed, tenant, and symbol. Instruments have distinct historical and realtime tick amplitudes.

The feed first commits the authoritative trading tick. It then projects that committed quote into candles, persists deltas, and publishes `candle.updated`. A candle projection error is logged; it does not roll back an already committed trade. Subsequent quotes resume from the last candle checkpoint. This is a synchronous development projection, not a durable tick outbox: ticks missed during a projection outage are not replayed, and unobserved intervals remain gaps. No fake tick volume is manufactured across downtime.

Workspace repository mutations serialize an owner's preference list and commit each change with an immutable workspace event. This uses a separate audit stream and never independently allocates an engine trading sequence.

Frontend chart interactions are behind `ChartAdapter` and its vendor-specific `ChartTradeLayer`. The terminal uses normalized quote/candle state, per-symbol selectors, bounded exact-event deduplication, and animation-frame batching of candle deltas. Reconnection buffers incoming deltas while canonical account/instrument/chart REST queries complete; only then does the UI return to LIVE. Overflowing the bounded buffer closes the socket and retries canonical resync. Workspace preferences use their own revision-based save flow.
