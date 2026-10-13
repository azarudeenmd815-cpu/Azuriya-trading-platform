# W05 Cycle 9 — Reject malformed ledger currencies

## Acceptance criteria

- `BrokerageLedgerService` rejects array, symbol, and other non-string currency values with the structured `LEDGER_CURRENCY_INVALID` application error.
- Existing uppercase three-letter currency validation and account-denomination checks remain unchanged.
- Regression coverage exercises runtime coercion and symbol conversion cases.
- Tenant authentication, account ownership, RLS predicates, idempotency, immutable posting, exact-decimal arithmetic, and ledger aggregation remain unchanged.
- No migration, route, shared contract, or other worker implementation changes are introduced.

## Root cause and implementation

The currency validator used `RegExp.test` directly on untrusted runtime input. JavaScript coerced an array such as `['USD']` to the valid string `USD`, while a `Symbol` caused a raw conversion `TypeError`. The validator now checks that the value is a string before applying the existing uppercase three-letter rule.

## Validation

- TDD RED focused fallback: 85/86 passed; the new malformed-currency regression reached account mismatch instead of `LEDGER_CURRENCY_INVALID`.
- GREEN focused compiled ledger and valuation fallback: 86/86 expected after the fix.
- Typecheck, lint, server emission, and diff checks are recorded in the Cycle 9 handoff.
- Normal Vitest/build commands may remain unavailable in the Windows sandbox when Vite/esbuild reports spawn `EPERM`.
