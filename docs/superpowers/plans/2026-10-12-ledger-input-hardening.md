# W05 Cycle 7 — Reject malformed ledger posting payloads

## Acceptance criteria

- `BrokerageLedgerService.postEntry` rejects `null`, arrays, and primitive payloads with the structured `LEDGER_INPUT_INVALID` application error before dereferencing fields.
- Existing tenant scope validation, field validation, account ownership, RLS predicates, idempotency, immutable posting, and exact-decimal behavior remain unchanged.
- The malformed-input regression is covered by the ledger test suite.
- No migration, route, shared contract, or other worker implementation changes are introduced.

## Root cause and implementation

`postEntry` accessed `input.account_id` before validating the runtime shape of its TypeScript input. Although callers are typed, an untrusted runtime payload such as `null` or an array could therefore throw a raw `TypeError` or continue with undefined fields instead of returning a structured ledger error. A narrow object-shape guard now runs after tenant authentication and before any field dereference. Object-shaped values continue through the existing field validators.

## Regression coverage

`tests/ledger.test.ts` invokes `postEntry` with `null` and an array and expects status `422` with code `LEDGER_INPUT_INVALID`. The focused fallback was run red before the production guard (14 ledger tests with one failure), then rerun green after the guard.

## Validation

- Focused compiled ledger and valuation fallback: 84/84 expected after the fix.
- Typecheck, lint, server emission, and diff checks are recorded in the Cycle 7 handoff.
- Normal Vitest/build commands may remain unavailable in the Windows sandbox when Vite/esbuild reports spawn `EPERM`.
