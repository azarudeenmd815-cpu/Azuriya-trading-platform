# W04 Cycle 5: native order and fill input validation

The HTTP routes parse order and fill inputs with Zod, but the canonical order
service is also used by execution and integration code. Its decimal guard now
requires a string before applying the existing exact decimal pattern, so
JavaScript coercion cannot turn numeric or boolean values into valid prices or
quantities.

Acceptance criteria:

- Direct service calls with non-string quantity, fill quantity, or fill price
  fail with `422 INVALID_INPUT` before opening a transaction.
- Invalid direct calls create no order, fill, history, audit, or outbox record;
  an existing order remains pending with zero filled quantity.
- Existing positive decimal strings, exact-decimal boundaries, lifecycle
  transitions, tenant checks, and immutable history remain unchanged.
- No schema, migration, API route, shared contract, or event changes are
  required; route validation remains backward compatible.

`tests/orders.test.ts` covers numeric, boolean, and null direct-service inputs
and verifies durable side-effect counts and the unchanged order/fill state.
