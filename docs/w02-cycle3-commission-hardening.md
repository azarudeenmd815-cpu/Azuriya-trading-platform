# W02 Cycle 3: bounded commission inputs

Baseline: `574b5464ed93ab9f5f7d55d9ca2242903def1220` on `codex/trading-admin`.

The integrated commission parser passed arbitrarily long decimal strings to BigInt before checking the financial limit. The version schema also accepted integers beyond the PostgreSQL `integer` column's range. Zod's existing integer check already rejects unsafe JavaScript integers; this cycle adds the database upper bound.

Acceptance criteria:

1. Reject strings longer than the longest valid amount (`100000.000000`, 13 characters) before regex scanning, splitting or BigInt conversion. Reject integer parts longer than six digits before BigInt conversion.
2. Preserve exact string amounts from zero through 100000, six fractional places, normalized trailing zeros, and existing structured errors. Both opening and closing amounts follow the same rules.
3. Accept only integer `expected_version` values from 0 through 2147483647. Keep 0 for initial configuration and retain the existing optimistic concurrency checks.
4. Rejected service input leaves configuration and audit history unchanged. Tests verify boundary acceptance, invalid forms, and that oversized inputs never invoke BigInt.
5. Preserve all integrated migrations, route registrations, ownership/RLS/RBAC contracts, and other workers' domains. No migration, external service, provider action, or commission charging is introduced.

Validation: run `npm test -- --run tests/trading-group-commissions.test.ts tests/trading-groups.test.ts`, `npm run typecheck`, `npm run lint`, and `npm run build`. Report environment startup failures separately from executed tests. W01 can integrate these W02-owned source, test, and documentation edits without a router or shared-contract change.

For legacy Windows output capture, use `npm test -- --reporter=tap`; Vitest's default reporter emits Unicode status glyphs. The W02 validation-error regression below also verifies that application diagnostics themselves remain ASCII-safe.

Recovery verification on the final source and tests:

- `npm run typecheck`, `npm run lint`, `npx tsc -p tsconfig.server.json`, and `git diff --check` passed.
- `npm test -- --run tests/trading-group-commissions.test.ts tests/trading-groups.test.ts` failed before collecting tests because esbuild child-process creation returned Windows `spawn EPERM`. No Vitest tests executed.
- `npm run build` passed its typecheck stage but failed loading the Vite configuration with the same `spawn EPERM`. The backend was compiled separately with the command above.
- A PowerShell stdin script executed through `node --input-type=module`, importing the freshly compiled backend, passed 9/9 smoke checks: exact boundaries and normalization, version bounds, structured amount errors, oversized rejection before BigInt, integrated migrations and restricted-role creation, no-op preservation, material update and stale conflict, rejected-input state/audit preservation, and four-part scope isolation. The database was isolated in-memory PGlite and closed afterward. These checks do not replace the Vitest suite or production PostgreSQL multi-session concurrency tests.
- The focused compiled-module encoding check passed 3/3 cases: invalid numeric amount, out-of-range version, and non-ASCII currency input all produce ASCII-only validation messages.
- The new database-backed rejection test creates its own configured group and verifies that invalid versions and oversized opening/closing amounts leave the existing row and audit count unchanged.
- The trusted persistence timeout was repaired in `tests/database.test.ts` by moving cold disk-backed PGlite creation, the first migration, commit, close/reopen, and repeat migration into a dedicated `beforeAll` hook with the existing 60-second hook budget. The test body now performs only persistence, tenant-visibility, and non-bypass-RLS role assertions; cleanup remains in `afterAll`. No database runtime code was changed.

Full regression and HTTP security suites remain unexecuted because the common Vitest startup is blocked. Controller validation must run the focused suites and full build before this cycle can be marked complete.

The reported `charmap` codec failure is from the external Windows capture layer, not a W02 source file: all W02 source, test, and documentation files are ASCII-only. The controller should capture stdout/stderr as UTF-8 or invoke Vitest with the TAP reporter.

This cycle does not change the policy for an already-persisted configuration at the maximum database version; a material increment at that theoretical limit still cannot fit the existing column.
