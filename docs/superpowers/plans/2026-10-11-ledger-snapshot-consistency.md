# W05 Cycle 4 — Consistent ledger reconciliation snapshots

Baseline: `1082b2044fd47acdabf24c3c259b07db6ed0e9ce`, branch `codex/ledger-margin`. Initial worktree clean. Integrated Cycle 3 hardened pure valuation; this cycle addresses a separate ledger read-consistency defect.

## Discovery

`BrokerageLedgerService.reconcile` reads account ownership, cash aggregation and the optional stored balance in separate statements. `Database.transaction` uses plain `BEGIN`; server PostgreSQL can commit another transaction between these READ COMMITTED statement snapshots. A transaction posting cash and updating the projection can therefore cause a false mismatch. Embedded PGlite serializes transactions, so the existing concurrent-postings test does not exercise this race.

Migration 050 defines immutable signed postings, `numeric(38,8)` amounts, four-part tenant RLS, account/currency keys, and a unique optional projection. Posted movements other than `unrealized_pnl` comprise cash. Reconciliation does not repair projections. These contracts are sufficient; no schema, transaction infrastructure, or other worker changes are required.

## Acceptance criteria

- `balance` and `reconcile` share one canonical aggregation path.
- Account ownership/denomination, posted cash, count/watermark, projection and exact signed difference come from one SELECT snapshot.
- Missing or foreign accounts return the established not-found error without financial output. All tenant dimensions and account currency constrain reads.
- Empty cash and absent projection preserve zero/count-zero/null-watermark and NOT_COMPARABLE semantics; both signed differences remain exact.
- Evaluation metadata describes the statement observation time; read calls never update postings or projections.
- Tests exercise actual SQL/RLS through the existing embedded PostgreSQL infrastructure and demonstrate the old split-read failure with controlled statement-boundary interleaving. Any unavailable multi-connection PostgreSQL validation is reported separately.
- Existing ledger and valuation tests, typecheck, lint and build are attempted with exact results recorded. No migration or public/shared API change.

## Implementation boundary

Only `src/server/brokerage/ledger.ts`, ledger-owned tests, and this handoff document may change. No position, quote, valuation, margin, posting, schema or shared database implementation changes.

## Implementation

- Added a private `snapshot` path used by both `balance` and `reconcile`. It performs account scope validation, posted cash aggregation, sequence watermark, optional projection lookup, and exact signed difference calculation in one parameterized SQL statement.
- The aggregation continues to exclude only posted `unrealized_pnl`; pending, void, and rejected rows remain excluded by `status='posted'`. Amounts retain the existing `numeric(38,8)` canonical ledger precision and are normalized to eight decimal places at the service boundary.
- The projection join is disabled for ordinary balance reads. Reconciliation uses the scoped account denomination and all four tenant dimensions for account, ledger, and projection aliases. Missing accounts and currency mismatches preserve existing `ACCOUNT_NOT_FOUND` and `ACCOUNT_CURRENCY_MISMATCH` errors.
- Added ledger tests for empty histories and missing projections, signed high-precision differences, cash-only watermark/read-only behavior, all tenant scope dimensions and currency boundaries, and the old split-read race at a controlled statement boundary.

## Validation

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npx tsc -p tsconfig.server.json --outDir artifacts/w05-cycle4-run/server --sourceMap false`: PASS.
- Normal focused test command `npm test -- tests/ledger.test.ts tests/valuation.test.ts`: FAIL before collection because Vite/esbuild startup receives Windows `spawn EPERM`.
- Normal full `npm test`: FAIL before collection for the same Vite/esbuild `spawn EPERM`.
- `npm run build`: FAIL at Vite startup with the same esbuild `spawn EPERM`; its typecheck phase passed.
- Compiled fallback using an ignored config with `esbuild: false` and removal of Vitest's identity `process.env.NODE_ENV` define: PASS, 81/81 tests across ledger and valuation suites.
- Full compiled fallback with the same diagnostic configuration: PASS, 533/533 tests across 35 suites.
- Baseline regression proof for `cannot mix old ledger and new projection`: baseline source failed 1/1 selected test with a false `MISMATCHED`; current source passed 1/1 selected test. Baseline/current emitted modules were confined to ignored artifacts.
- `git diff --check`: PASS. No PostgreSQL acceptance fixture (`artifacts/pg-acceptance`) is present in this worktree, so multi-connection PostgreSQL MVCC validation remains for the external validator.
