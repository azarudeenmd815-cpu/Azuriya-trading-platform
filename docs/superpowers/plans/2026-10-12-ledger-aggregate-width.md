# W05 Cycle 5 — Preserve ledger aggregate precision

## Acceptance criteria

- A valid `numeric(38,8)` ledger entry remains valid at the schema boundary.
- Account replay does not impose a narrower `numeric(38,8)` typmod on the sum of multiple valid entries.
- Reconciliation reports exact signed differences even when the aggregate or difference has more than 30 integer digits.
- Existing eight-place normalization, posted-entry filtering, entry counts, watermarks, tenant predicates, idempotency, immutability, and read-only behavior remain unchanged.
- No migration, route, shared contract, or other worker implementation changes are introduced.

## Root cause and implementation

`SUM(numeric)` and subtraction in PostgreSQL already retain arbitrary precision, but the ledger snapshot query cast both results to `numeric(38,8)`. Two individually valid maximum-width entries could therefore raise `22003` during replay, and a valid aggregate versus an opposite-sign projection could overflow during reconciliation. The query now leaves those intermediate values unconstrained and converts them to text only after arithmetic. The existing `normalize` function continues to emit the canonical eight fractional places.

## Regression coverage

`tests/ledger.test.ts` inserts two valid maximum-width entries and an opposite-sign projection, then verifies the exact wide balance and signed mismatch without mutating persisted records. The test was observed failing with PostgreSQL/PGlite `22003 numeric field overflow` before the query change.

## Validation

- RED fallback: the new test failed under the original query with PostgreSQL/PGlite `22003 numeric field overflow`.
- Focused compiled fallback: 83/83 tests passed across ledger and valuation suites.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npx tsc -p tsconfig.server.json --outDir artifacts/w05-cycle5/server --sourceMap false`: PASS.
- Normal focused Vitest and `npm run build`: BLOCKED by Windows `spawn EPERM` while Vite starts esbuild.
- Full compiled fallback: 571/572 tests passed across 36 suites; one unrelated existing W04 order-trigger test failed (`orders.test.ts`, expected a rejected direct fill insert but received `{ rows: [] }`). All W05 ledger and valuation tests passed.
