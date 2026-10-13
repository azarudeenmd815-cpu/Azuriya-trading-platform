# Native order list input validation

`BrokerageOrdersService.list()` validates its input with the canonical `orderListSchema` before opening a database transaction.

Acceptance criteria:

- Invalid status, account identifier, limit, offset, or unknown fields return `422 INVALID_INPUT`.
- Validation failures perform no database query or durable mutation.
- Valid callers retain the existing pagination shape and tenant and owner filters.
- Route callers continue to use the same request validation and response contract.
