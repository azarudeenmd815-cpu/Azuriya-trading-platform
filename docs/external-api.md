# External Developer API

Cycle 1 exposes a read-only, tenant-scoped API for approved CRM integrations.

## Credential lifecycle

Tenant administrators with the existing `api.write` permission create credentials at:

`POST /api/v1/instances/:instanceId/external-credentials`

The JSON body is `{ "name": "CRM", "scopes": ["accounts:read"], "expires_at": "2027-01-01T00:00:00Z" }`. Only `accounts:read` is supported. The response contains the `azk_` Bearer secret exactly once; it is generated from 256 random bits, stored only as a SHA-256 digest, and must be stored by the CRM immediately. It is never returned by list or revoke operations.

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

Future cycles may add orders, positions, WebSocket authentication, and outbound webhooks. They are not implemented or authorized by Cycle 1 credentials.
