# Verification record

The implementation was exercised on Windows with a portable Go toolchain and PostgreSQL 16.10 bound to `127.0.0.1:55432`. Binaries and database data are outside the repository under the user's local cache. Actual local connection strings and generated credentials are ignored configuration, not committed source.

## Completed integration checks

- Final combined Go verification: `go test -json ./...` passed **63 tests and subtests across 8 tested packages**, with `TEST_DATABASE_URL` set so the real PostgreSQL integration ran. `go vet ./...` and the API executable build both passed. All Go source was formatted with `gofmt`.

- `go test ./internal/httpapi`: passed. HTTP tests exercise registration/session cookies, authentication/logout revocation, cross-tenant isolation, same-tenant account-owner isolation (including a different user with ADMIN role), eight concurrent identical order requests, conflicting replay rejection, partial-close replay, decimal-string responses, malformed/numeric/exponent/oversized input rejection, Origin checks, failed-persistence rollback, audit cursor pagination/input bounds, and WebSocket tenant filtering.
- `TEST_DATABASE_URL=... go test -v ./internal/storage`: passed against actual PostgreSQL in a separate `azuriya_test` database. The test applies both migrations twice, rejects a second writer, verifies snapshot/materialized/audit/ledger consistency, forces an atomic rollback with a foreign-key violation, rejects UPDATE/DELETE/TRUNCATE against immutable audit/ledger/fill history, reopens persistence, replays an order without duplicate fills, and persists a complete close/realized-P&L ledger entry. It also writes more than 1,000 events, verifies bounded snapshots preserve complete SQL history, and checks tenant/account-scoped cursor pagination including older events outside the snapshot window.
- Go formatting was applied to the integration test sources. Prettier formatting passed for README, documentation, and Compose YAML.
- The final Chromium browser smoke passed against the restarted persisted application (4.8 seconds for the test, 6.0 seconds overall, no browser page errors). It exercised workspace registration, realtime connection, BUY market execution, protection editing/clearing, partial/full close, pending limit cancellation, fill history, audit activity, logout/login, and desktop/mobile layouts. It also verified offline-to-online reconnect and canonical resynchronization with the remaining `0.06` position preserved. There was no mobile horizontal overflow. SL/TP and pending trigger crossings are deterministic engine tests; this browser smoke does not wait for arbitrary random-walk prices to cross distant triggers.
- Frontend validation passed: 6 unit tests, TypeScript checking, Next.js production build, and formatting check. Separate visual capture observed 35 simulated quote ticks and produced desktop/mobile screenshots in ignored local output.
- Both PowerShell helper scripts passed PowerShell parser validation. The backend launcher uses Go on PATH, or the installed per-user portable Go toolchain when available.

## Environment limits

Docker is unavailable on the implementation host, so Compose containers and the Dockerfile were not executed here. PostgreSQL migrations and storage behavior were verified with the portable PostgreSQL server. Redis runtime behavior was not exercised on this host; the persisted application run explicitly leaves `REDIS_URL` unset. The clean local-development configuration still uses Compose PostgreSQL and Redis as documented in README.

The PostgreSQL test requires `TEST_DATABASE_URL`; without it, the storage integration test explicitly skips. Unit/HTTP tests do not require a database. Browser tests run against the real backend and create a separate simulated workspace.
