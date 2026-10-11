# Cycle 3 Valuation Snapshot Hardening

**Goal:** Make the existing pure unrealized P&L and equity calculator fail closed on malformed snapshot data while preserving exact-decimal and deterministic behavior.

**Bounded scope:** No database, migration, route, provider, position, market-data, conversion, margin-reservation, or ledger schema changes. The calculator continues to consume caller-authorized snapshots only.

## Acceptance criteria

- Every supplied instrument, quote, and position snapshot is shape-validated before a complete account result is returned, including unused collection members.
- Invalid side, quantity, currency, valuation kind, quote price, quote freshness, and timestamp metadata produce explicit invalid/incomplete outcomes.
- Quote event and receipt ordering compares the full supported fractional timestamp precision without JavaScript floating-point arithmetic.
- Position replay order uses locale-independent code-unit ordering and duplicate IDs remain rejected.
- Equity composition accepts only structurally valid account valuations with nonnegative safe-integer counts and exact monetary strings representable at eight decimal places; outputs are normalized to eight places.
- Existing bid/ask formulas, closed-position exclusion, currency boundaries, read-only semantics, and Cycle 1 ledger ownership remain unchanged.

## Validation

- Focused Vitest and complete suite commands are attempted and their actual sandbox result recorded.
- `npm run typecheck`, `npm run lint`, server emit, direct calculator smoke checks, and `git diff --check` are run before handoff.

## Discovery and integration handoff

- Starting branch: `codex/ledger-margin`; integrated baseline: `574b5464ed93ab9f5f7d55d9ca2242903def1220`. The worktree started clean. Migration `050_ledger_reconciliation.sql` already exists and remains unchanged.
- Reuses the integrated `PositionSnapshot`, `InstrumentSnapshot`, `QuoteSnapshot`, `valuePosition`, `valueAccount`, and `composeEquity` contracts in `src/server/brokerage/valuation.ts`. Cycle 1 cash remains supplied by `BrokerageLedgerService.balance`; this change adds no database wiring or competing cash calculation.
- `valuePosition(position, instrument, quote)` validates active exposure and returns explicit invalid, incomplete, unsupported, excluded, or valued outcomes. `valueAccount({ accountId, accountCurrency, positions, instruments, quotes })` validates all supplied collection members and rejects foreign or duplicate positions before producing position financial results. `composeEquity({ accountId, accountCurrency, cashBalance, valuation })` validates the complete valuation's structure before adding cash and unrealized P&L.
- Adds internal reason values `INSTRUMENT_INVALID` and `VALUATION_INVALID`; public routes and shared schemas are unchanged. Malformed metadata takes precedence over unsupported or stale/unverified outcomes. The existing instrument contract requires a positive multiplier even for an unsupported instrument snapshot; none is fabricated when it is absent.
- Arithmetic remains BigInt coefficient/scale decimal arithmetic. Account aggregation sums unrounded amounts and rounds once, half away from zero, to eight places. Longs use bid; shorts use ask. Excluded closed/zero positions remain compatible with complete equity. No conversion, freshness threshold, fee, or realized-P&L component is invented.
- Quote timestamp comparison preserves up to nine fractional UTC digits. Account output order uses code-unit position ID order rather than locale collation. Equity copies timestamp arrays rather than sharing mutable arrays with its input.
- Structural validation does not authenticate snapshots or establish their provenance. In particular, an aggregate cannot be verified by summing already-rounded position outputs. Callers must supply authorized, trusted snapshots and the authoritative cash balance. Persisted integration still requires W04 authoritative open-position retrieval, W06 instrument/freshness contracts, and W01 conversion coordination where currencies differ.

## Final validation results

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npx tsc -p tsconfig.server.json --outDir artifacts/w05-cycle3-run/server --sourceMap false`: PASS.
- `npm test -- tests/valuation.test.ts`: FAIL before collection; Vite configuration loading attempts esbuild and receives Windows `spawn EPERM`.
- `npm test`: FAIL before collection for the same startup error.
- `npm run build`: FAIL after its successful typecheck; Vite configuration loading receives the same esbuild `spawn EPERM`.
- Focused fallback: `npx tsc -p artifacts/w05-cycle3-run/tsconfig.json`, followed by `npx vitest run --config artifacts/w05-cycle3-run/vitest.mjs --configLoader native --pool threads --maxWorkers 1 --no-file-parallelism`: PASS, 70/70 tests in one suite. The ignored diagnostic config runs emitted JavaScript with `esbuild: false`; it does not alter repository test configuration or assertions.
- Full emitted fallback: `npx vitest run --config artifacts/w05-cycle3-run/vitest-full.mjs --configLoader native --pool threads --maxWorkers 1 --no-file-parallelism`: FAIL, 12 suites passed and 21 suites failed to load; all 245 collected tests passed. Failed suites, including ledger, orders, and tenant-security suites, report `vite:define` / esbuild `spawn EPERM` while loading emitted `src/server/domain/service.js`. Full regression and ledger/RLS validation are therefore not established by this run.
- Direct Node smoke against the compiled module: PASS for exact long/account P&L, equity, malformed unused instrument rejection, and foreign-account rejection.
- No temporary `temp-c3` directory remains. Diagnostic compiler output and fallback configs are confined to ignored `artifacts/w05-cycle3-run/`.
- Controller must rerun normal tests and production build outside the esbuild sandbox limitation before integration approval.
