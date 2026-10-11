# W04 Cycle 4: pending trigger-price validation

The existing order decimal pattern permits zero. LIMIT and STOP creation also
passed trigger prices directly to PostgreSQL for callers using the service
without the route schema, allowing invalid prices or numeric rounding.

Acceptance criteria:

- Both order creation routes use the existing schema to reject zero trigger
  prices, including fractional zero, with the established validation response.
- The canonical creation service rejects missing, zero, negative, malformed (including whitespace),
  oversized, and over-precision trigger prices with `422 INVALID_INPUT` before
  opening its transaction.
- Rejection adds no order, history, creation audit, or creation outbox record.
- Valid decimal strings retain the existing maximum of 20 integer digits and
  8 fractional digits. The smallest positive price `0.00000001` and maximum
  price `99999999999999999999.99999999` round-trip exactly for LIMIT and STOP.
- Existing order creation, cancellation, fills, tenant checks, and history stay
  compatible. No migration, shared type, endpoint, or event contract changes.

`tests/orders.test.ts` covers schema and direct-service rejection, durable
side effects, and exact-decimal boundaries. The initial regression reproduced
zero-price persistence before the service guard was applied. The service uses
the same string-based trigger-price validator as the schema; it does not convert
prices to JavaScript numbers. Historical records and direct SQL writes are
outside this bounded validation change.
