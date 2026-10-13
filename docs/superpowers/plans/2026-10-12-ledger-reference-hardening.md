# W05 Cycle 8 — Reject malformed ledger references

## Acceptance criteria

- `BrokerageLedgerService.postEntry` rejects non-string `reference` values with the structured `LEDGER_REFERENCE_INVALID` application error.
- Existing empty-reference and maximum-length validation remains unchanged.
- Tenant authentication, account ownership, RLS predicates, idempotency, immutable posting, exact-decimal arithmetic, and all ledger aggregation behavior remain unchanged.
- Regression coverage exercises runtime `null` and numeric references.
- No migration, route, shared contract, or other worker implementation changes are introduced.

## Root cause and implementation

The TypeScript `reference?: string` declaration did not protect the runtime posting boundary. A payload containing `reference: null` or a number reached `validReference`, which called `.trim()` and raised a raw `TypeError`. The validator now checks the runtime type before string operations and returns the existing structured `LEDGER_REFERENCE_INVALID` error.

## Validation

- TDD RED focused fallback: 84/85 passed; the new malformed-reference test reproduced the raw `TypeError`.
- GREEN focused compiled ledger and valuation fallback: 85/85 expected after the fix.
- Typecheck, lint, server emission, and diff checks are recorded in the Cycle 8 handoff.
- Normal Vitest/build commands may remain unavailable in the Windows sandbox when Vite/esbuild reports spawn `EPERM`.
