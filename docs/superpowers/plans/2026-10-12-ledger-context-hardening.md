# W05 Cycle 6 — Require an explicit tenant context marker

## Acceptance criteria

- Ledger balance, reconciliation, and posting operations accept only an explicit `core: false` brokerage tenant context.
- An omitted or undefined core marker fails closed with the existing `TENANT_CONTEXT_REQUIRED` error before financial data access.
- Existing core, product, UUID, request, permission, tenant, currency, RLS, idempotency, and exact-decimal behavior remains unchanged.
- No migration, route, shared contract, or other worker implementation changes are introduced.

## Root cause and implementation

The integrated brokerage account service treats `core` as an explicit authentication boundary (`scope.core !== false` is invalid), while `BrokerageLedgerService` previously rejected only truthy core values. A malformed context with `core: undefined` therefore reached the database and returned a balance. Ledger scope validation now requires `core === false`.

## Regression coverage

`tests/ledger.test.ts` now invokes `balance` with an otherwise valid context whose core marker is undefined. The test failed before the fix because the operation resolved a financial snapshot; it passes after the fix with `TENANT_CONTEXT_REQUIRED`.

## Validation

- RED focused fallback: 82/83 tests passed; the new context test resolved instead of rejecting.
- GREEN focused compiled fallback: 83/83 tests passed across ledger and valuation suites.
- Typecheck, lint, server emission, and diff checks are run in the Cycle 6 handoff.
