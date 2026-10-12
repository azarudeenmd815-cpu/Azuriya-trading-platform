# W04 Cycle 6: canonical service contract validation

The brokerage order routes already parse request bodies with Zod, but execution
and integration callers can invoke `BrokerageOrdersService` directly. The
canonical `create()` and `recordFill()` operations now run the existing
`orderCreateSchema` and `fillSchema` at their own boundary before opening a
database transaction.

Acceptance criteria:

- Missing fields, unsupported order types or sides, unexpected fields, empty
  instruments, and malformed fill shapes fail with `422 INVALID_INPUT`.
- Rejected direct calls create no order, fill, history, audit, or outbox rows.
- Existing valid decimal strings and lifecycle behavior are unchanged.
- Route request/response shapes, tenant checks, migrations, shared contracts,
  and event names remain unchanged.

`tests/orders.test.ts` covers malformed direct create and fill shapes and
verifies durable side-effect counts and unchanged order state. The service
continues to use string-based decimal validation and exact PostgreSQL numeric
arithmetic.
