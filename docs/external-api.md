# External Developer API

Cycles 1 and 2 expose a read-only, tenant-scoped API for approved CRM integrations.

## Credential lifecycle

Tenant administrators with the existing `api.write` permission create credentials at:

`POST /api/v1/instances/:instanceId/external-credentials`

The JSON body is `{ "name": "CRM", "scopes": ["accounts:read", "orders:read"], "expires_at": "2027-01-01T00:00:00Z" }`. Supported scopes are `accounts:read`, `orders:read`, and `positions:read`; each scope is independent and access is deny-by-default. The response contains the `azk_` Bearer secret exactly once; it is generated from 256 random bits, stored only as a SHA-256 digest, and must be stored by the CRM immediately. It is never returned by list or revoke operations.

Issuers must also hold `brokerage.accounts.read` to grant `accounts:read` or `positions:read`, and `brokerage.orders.read` to grant `orders:read`. Reads require the credential owner to retain the corresponding active staff permission in that workspace. Orders and positions scopes do not require the credential to include `accounts:read`.

Metadata is listed with `GET /api/v1/instances/:instanceId/external-credentials` and a bounded `limit`/`offset`. A credential is revoked with `DELETE /api/v1/instances/:instanceId/external-credentials/:id`. Both operations are tenant-scoped through the existing organization, brand, environment, and product-instance authorization and RBAC checks.

Credential creation and revocation write `api_key.created` and `api_key.revoked` audit events. Audit metadata does not contain the secret or its digest. Expired and revoked credentials fail authentication immediately.

## Account API

Use the credential only in an HTTP header:

`Authorization: Bearer azk_<secret>`

The external namespace is:

* `GET /api/external/v1/accounts?limit=25&offset=0`
* `GET /api/external/v1/accounts/:accountId`

Responses use the repository envelope `{ "data": ... }`. List responses include `pagination: { total, limit, offset }`. `limit` is bounded to 100 and ordering is deterministic. Account monetary values, when added by the canonical account service, remain exact decimal strings; Cycle 1 does not fabricate balances or equity metrics because those values are not authoritative on the current account model.

Account responses contain only the account identifier, account number, type, currency, leverage, status, synchronization state/timestamp, timestamps, and the authorized product-instance identifier. Client profile data, provider snapshots, and credentials are not exposed.

## Orders API

Credentials with `orders:read` may call:

* `GET /api/external/v1/accounts/:accountId/orders?status=pending&limit=20&offset=0`
* `GET /api/external/v1/accounts/:accountId/orders/:orderId`

Order collections are bounded to 100 items, ordered by `created_at` descending and `id` ascending, and return `{ "data": [...], "pagination": { "total", "limit", "offset" } }`. The optional `status` filter accepts the canonical pending, partially_filled, filled, rejected, expired, or cancelled values. Order fields are explicitly mapped from the native order store: identifier, account identifier, instrument, type, side, status, quantity, filled quantity, limit/stop prices, and timestamps. Numeric values remain exact decimal strings. Average fill price is omitted because the native order model does not expose an authoritative aggregate field.

## Positions API

Credentials with `positions:read` may call:

* `GET /api/external/v1/accounts/:accountId/positions?status=open&limit=20&offset=0`
* `GET /api/external/v1/accounts/:accountId/positions/:positionId`

The current canonical repository persists provider-sanitized open-position observations in the account's tenant-scoped `trading_observations` snapshot. The API maps those observations without recalculating P&L, margin, or balances. Position collections are ordered by `opened_at` descending, including all validated fractional-second precision, and then a locale-independent identifier tie-breaker. Position identifiers, instrument, side, volume, entry/current prices, stop-loss, take-profit, P&L, open timestamp, and the snapshot's `observed_at` freshness timestamp are returned when present. Timestamps must be ISO-8601 UTC or offset values with at most nine fractional-second digits. `status=open` is supported; `status=closed` returns an empty page because no durable closed-position store exists yet. Snapshots are bounded by the connector to 100 positions and may be stale; `observed_at` lets CRM clients assess that staleness. Hedged positions remain separate observation records. Malformed snapshot entries are omitted at the external API boundary; malformed optional decimal or freshness fields are omitted while valid decimal strings and timestamps are preserved exactly.

## Errors and isolation

Missing, malformed, unknown, expired, or revoked credentials return `401`. A valid credential without `accounts:read` returns `403`. An inaccessible account returns `404`. Validation failures use the standard structured error envelope and never echo secrets. Client-supplied tenant filters are not accepted; the credential's four stored tenant identifiers are the sole account scope.

Typical error envelopes are:

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "A valid external API credential is required.", "details": [], "request_id": "req_..." } }
```

```json
{ "error": { "code": "SCOPE_REQUIRED", "message": "The credential does not grant the required scope.", "details": [], "request_id": "req_..." } }
```

The API does not return internal tenant identifiers in authentication errors and does not fall back to session cookies on external routes.

Historical/closed positions, order fills as a dedicated resource, WebSocket authentication, outbound webhooks, and all trading mutations remain future work. W01 needs a canonical position read contract from the owning trading/financial workers before those position semantics can be expanded.
