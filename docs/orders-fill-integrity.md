# Native order fill integrity

W04 Cycle 2 strengthens the existing `brokerage_orders` aggregate with [migration 042](../migrations/042_native_order_fill_invariants.sql). It uses the canonical order statuses and `numeric(28,8)` quantities introduced in migration 040.

## Acceptance criteria

Every newly inserted or updated order must satisfy these rules:

- `filled` means `filled_quantity = quantity`, and an order whose filled quantity equals its positive quantity must be `filled`.
- `partially_filled` means `0 < filled_quantity < quantity`.
- `pending`, `rejected`, `expired`, and `cancelled` require `filled_quantity = 0`.
- An update cannot reduce `filled_quantity`.

Together with the existing immutable order identity and terminal-transition guards, these rules prevent a valid filled order from losing executed quantity or returning to a pending state. Valid sequential partial fills and their immutable history records continue to use `BrokerageOrdersService.recordFill`. Invalid writes fail with PostgreSQL SQLSTATE `23514` and roll back with their surrounding transaction.

## Migration and historical rows

Migration 042 adds `brokerage_order_status_quantity_consistency` as a `CHECK ... NOT VALID` constraint. This preserves existing rows without scanning or rewriting historical data during the upgrade. PostgreSQL enforces this constraint on every new row and every subsequent update, including updates to unrelated columns. A legacy inconsistent row therefore remains readable, but cannot be updated unless its resulting state satisfies the constraint and the existing lifecycle protections.

The monotonicity trigger applies to subsequent updates of `filled_quantity`; it does not audit past changes. The migration performs no automatic repair, backfill, or history rewrite.

An operator using the approved administrative database context can audit historical status/quantity discrepancies with:

```sql
SELECT id, organization_id, brand_id, environment_id, product_instance_id,
       account_id, status, quantity, filled_quantity
FROM brokerage_orders
WHERE NOT (
  (status IN ('pending', 'rejected', 'expired', 'cancelled') AND filled_quantity = 0)
  OR (status = 'partially_filled' AND filled_quantity > 0 AND filled_quantity < quantity)
  OR (status = 'filled' AND filled_quantity = quantity)
)
ORDER BY organization_id, brand_id, environment_id, product_instance_id, id;
```

The query remains subject to the caller's database privileges and RLS context. An empty result from a tenant context proves only that tenant's visible rows. The controller must coordinate reconciliation of any discrepancies against authoritative execution evidence before validating historical rows. Do not disable lifecycle protections or alter immutable fills/history to make validation pass.

After controller reconciliation, an authorized migration operator can validate the constraint:

```sql
ALTER TABLE brokerage_orders
  VALIDATE CONSTRAINT brokerage_order_status_quantity_consistency;
```

This validation is an integration operation; migration 042 does not execute it automatically.

## Integration scope and limits

The change adds no API routes, request or response fields, event types, service signatures, or status values. It does not introduce position, hedging, or netting models and does not change W07 execution or W05 financial behavior. Existing tenant scope, RLS, order/fill history immutability, and order-row locking conventions remain in force.

The constraint proves consistency between an order's stored status and aggregate filled quantity. It does not prove that `filled_quantity` equals the sum of `brokerage_order_fills.quantity`, that each fill has a matching lifecycle event, or that execution and financial effects are atomic. Those guarantees require the canonical transaction and execution integrations; this migration does not replace them.

## Verification

`tests/orders.test.ts` exercises the service and restricted database role: inconsistent statuses and decreasing quantities fail without changing orders or history; a later invariant violation rolls back a fill and its history in the same transaction; partial and full progress remain exact at the minimum decimal step and maximum `numeric(28,8)` boundary. `tests/order-fill-migration.test.ts` upgrades actual migrations through 041 with legacy inconsistent orders and verifies that 042 preserves their complete rows, fills, and history while rejecting invalid new inserts and subsequent updates.

Cycle 2 validation passed 78/78 targeted tests across orders, the upgrade, accounts, database, and pretrade risk, then 466/466 tests across 34 files with no skips. Typecheck, server typecheck, lint, and direct application of all 28 migration files also passed.

The standard `npm test` and `npm run build` commands failed at esbuild startup with Windows sandbox `spawn EPERM`. Tests ran using an ignored temporary configuration under `artifacts/w04-validation` with native config loading, in-process TypeScript transpilation, and a thread worker. It changes no source or assertions. The controller must still run the normal test and build commands externally; this result does not claim a successful Vite build or network PostgreSQL concurrency verification.

Commands executed for the successful test runs:

```text
node node_modules/vitest/vitest.mjs run --config artifacts/w04-validation/w04-vitest.config.mjs --configLoader native tests/orders.test.ts tests/order-fill-migration.test.ts tests/database.test.ts tests/brokerage-accounts.test.ts tests/pretrade-risk.test.ts --reporter=default --reporter=json --outputFile.json=artifacts/w04-validation/targeted-results-final.json
node node_modules/vitest/vitest.mjs run --config artifacts/w04-validation/w04-vitest.config.mjs --configLoader native --reporter=default --reporter=json --outputFile.json=artifacts/w04-validation/full-results.json
```
