# HTTP and realtime API v1

The base path is `/api/v1`. JSON field names use `snake_case`. Prices, quantities, money, P&L, and margin are **decimal strings**, not JSON numbers. All account resources require an authenticated session and tenant/account ownership. Collections are returned as arrays; individual resources are returned as objects.

## Authentication

| Method/path           | Request                                                | Result                                                                    |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `POST /auth/register` | `{ "email": "...", "password": "...", "name": "..." }` | Authenticated user; creates a tenant membership and simulated USD account |
| `POST /auth/login`    | `{ "email": "...", "password": "..." }`                | Authenticated user and session cookie                                     |
| `POST /auth/logout`   | No body                                                | Invalidates session and clears cookie                                     |
| `GET /me`             | —                                                      | `{ "id", "email", "tenant_id", "role" }`                                  |

Sessions use a HttpOnly, SameSite=Strict cookie named `azuriya_session`, with a 12-hour lifetime and server-side revocation. Browser requests must include credentials. State-changing browser requests must originate from the configured `WEB_ORIGIN`; production deployments must set `COOKIE_SECURE=true` and use HTTPS. Passwords contain 12–128 characters and use Argon2id hashes. Password hashes and session-token digests are never API fields. Sensitive authentication/trading endpoints are rate limited.

## Account and reference data

| Method/path                                | Result                                         |
| ------------------------------------------ | ---------------------------------------------- |
| `GET /accounts`                            | Owned trading accounts                         |
| `GET /accounts/:accountId`                 | Canonical account balances/equity/margin       |
| `GET /instruments`                         | Tenant instrument specifications               |
| `GET /instruments/:symbol`                 | One tenant instrument                          |
| `GET /quotes`                              | Current tenant client quotes                   |
| `POST /accounts/:accountId/margin-preview` | Server estimate `{ "required_margin": "..." }` |

Margin preview accepts `{ "symbol": "EURUSD", "side": "BUY", "quantity": "0.10" }`. It is an estimate against current state; the actual order always revalidates risk at execution.

## Orders

`POST /accounts/:accountId/orders` accepts:

```json
{
  "client_order_id": "unique-client-command-id",
  "symbol": "EURUSD",
  "side": "BUY",
  "type": "MARKET",
  "time_in_force": "IOC",
  "quantity": "0.10",
  "stop_loss": "1.07000",
  "take_profit": "1.10000"
}
```

Send `Idempotency-Key: unique-client-command-id`. Reuse that key when retrying the same command after a network failure. Different request data with the same key is a conflict. Do not generate a fresh key merely because the first response was lost.

`LIMIT` orders require `limit_price`; `STOP` orders require `stop_price`. Pending orders use `GTC`; immediate market orders use `IOC`. All price/quantity inputs remain strings. SL/TP fields are optional. Use the latest quote and instrument precision/quantity bounds when constructing requests; validation is authoritative on the server.

| Method/path                                        | Result                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /accounts/:accountId/orders`                  | Account order history, including pending/completed/rejected orders |
| `POST /accounts/:accountId/orders/:orderId/cancel` | Cancelled pending order                                            |

## Positions and history

| Method/path                                             | Request/result                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /accounts/:accountId/positions`                    | Positions, including closed positions when retained in history                     |
| `POST /accounts/:accountId/positions/:positionId/close` | `{ "client_order_id": "unique-close-id", "quantity": "0.05" }` -> updated position |
| `PATCH /accounts/:accountId/positions/:positionId`      | `{ "stop_loss": "1.07000", "take_profit": "1.10000" }` -> updated position         |
| `GET /accounts/:accountId/fills`                        | Opening/closing execution fills                                                    |
| `GET /accounts/:accountId/transactions`                 | Immutable account ledger                                                           |
| `GET /accounts/:accountId/events`                       | Paginated account domain/audit history                                             |

For a close, omit quantity to close the remaining position, or supply an exact quantity for a partial close. Include `Idempotency-Key` and retain it for retries. Closing must not exceed remaining quantity. Protection updates replace the pair: send both SL/TP values to retain both, and use `null` to clear a value. Protection is performed server-side; SL/TP continues to run when a client disconnects.

Audit history accepts `?limit=500` (default 500, maximum 1,000) and `?before=<sequence>` (exclusive upper bound). With no cursor, the server returns the newest page; each page is ordered by ascending sequence. To fetch older history, pass the first event's sequence as the next `before` cursor. Empty results mean no older account events are available. PostgreSQL serves the full immutable history, including events older than the engine's recent 1,000-event snapshot window. Explicit memory mode can serve only that recent window.

## Errors

Failures use a structured object:

```json
{
  "code": "INSUFFICIENT_MARGIN",
  "message": "Insufficient free margin for this order",
  "details": {}
}
```

Use `code` for application handling and `message` for the trader-facing explanation. Authentication, authorization, malformed request, unsupported account mode, stale/corrupt quote, invalid quantity/protection, insufficient margin, rate-limit, and idempotency conflict failures are explicit. HTTP status is also meaningful; a failed request must not be treated as an accepted order.

## WebSocket

Connect to `/api/v1/ws` using the authenticated cookie. The browser origin must be allowed. Envelopes have:

```json
{
  "type": "quote.updated",
  "timestamp": "2026-09-25T12:00:00Z",
  "sequence": 42,
  "payload": {
    "symbol": "EURUSD",
    "bid": "1.08450",
    "ask": "1.08462",
    "timestamp": "2026-09-25T12:00:00Z",
    "sequence": 42
  }
}
```

| Type               | Payload                                                   |
| ------------------ | --------------------------------------------------------- |
| `system.resync`    | Connection notification: refetch canonical REST snapshots |
| `quote.updated`    | Tenant client quote                                       |
| `order.updated`    | Owned account order                                       |
| `fill.created`     | Owned account fill                                        |
| `position.updated` | Owned account position                                    |
| `position.closed`  | Closed owned account position                             |
| `account.updated`  | Owned account balance/equity/margin state                 |

Quote sequences are per instrument; domain/audit sequences describe committed transitions. Do not assume all event types share a contiguous client-visible sequence, because tenant/owner filtering and different streams can create gaps.

On connect/reconnect, fetch accounts, quotes, orders, positions, fills, and transactions. WebSocket delivery is best effort; there is no resume cursor protocol in Phase 1. Set the UI state to `RECONNECTING` while retrying and `OFFLINE` when disconnected without an active retry. Only a connected socket may display `LIVE`; this label describes data connectivity, not real-money execution.

## Phase 2 endpoints

All endpoints below use the authenticated session and the `/api/v1` prefix. Monetary/price/quantity/percentage fields are decimal strings, including inputs. Tenant and owner identity come from the session.

| Method and path                                               | Contract                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/instruments/{symbol}/candles`                           | `interval` (default 1m), `from` inclusive and `to` exclusive on open time (RFC3339 or Unix seconds), `limit` 1..2000 (default 500). Ascending BID candles. |
| GET/POST `/workspaces`                                        | List/create owned workspaces; list creates an initial default when empty.                                                                                  |
| GET/PATCH/DELETE `/workspaces/{id}`                           | Read, patch, or delete; patch accepts revision for optimistic concurrency; delete returns remaining/replacement list.                                      |
| POST `/workspaces/{id}/duplicate`                             | Body `{ "name": "Copy name" }`.                                                                                                                            |
| POST `/workspaces/{id}/reset`                                 | Restore usable defaults.                                                                                                                                   |
| GET `/workspaces/events`                                      | Owner-scoped immutable audit, `limit` 1..500 (default 100).                                                                                                |
| POST `/accounts/{id}/orders/preview`                          | TradeRequest, nonbinding server OrderPreview.                                                                                                              |
| PATCH `/accounts/{id}/orders/{order}`                         | client_order_id, optional quantity/entry_price, replacement stop_loss/take_profit. Requires idempotency key.                                               |
| POST `/accounts/{id}/positions/{position}/close-preview`      | Either quantity or percentage; actual step-rounded close and remaining quantity.                                                                           |
| POST `/accounts/{id}/positions/{position}/protection-preview` | Nullable stop_loss/take_profit; existing-position P&L estimate and current-market validation.                                                              |
| POST `/accounts/{id}/positions/{position}/breakeven`          | client_order_id plus matching Idempotency-Key; returns validated updated position.                                                                         |

Existing order submission accepts the same new TradeRequest fields; legacy LOTS requests remain valid. Existing position-close accepts percentage instead of quantity. Workspace patches replace supplied nested preference objects as a whole and return the updated revision. WORKSPACE_NOT_FOUND maps to 404; WORKSPACE_CONFLICT to 409. Domain trading validation errors remain structured 422 responses; non-string financial JSON inputs return 400.

Example risk preview/submission body (add a unique client_order_id and matching Idempotency-Key for submission):

```json
{
  "symbol": "EURUSD",
  "side": "BUY",
  "type": "MARKET",
  "time_in_force": "IOC",
  "quantity_mode": "RISK_PERCENT",
  "risk_percent": "0.50",
  "stop_loss": "0.00200",
  "stop_loss_mode": "DISTANCE",
  "take_profit": "0.00500",
  "take_profit_mode": "DISTANCE"
}
```

`candle.updated` is a tenant-filtered envelope containing one current or newly completed Candle, never the whole history. Its sequence is the source quote sequence; identify bars by symbol, interval, and open_time as well. `ORDER_MODIFIED` maps to the existing owner-filtered `order.updated`. Breakeven/protection results use `position.updated`. Workspace audit is served over its separate REST stream.

On reconnect the UI remains RECONNECTING until active canonical account/instrument/candle queries and quotes succeed. Incoming deltas are buffered, deduplicated, then applied over the refreshed baseline. Quote and candle replays cannot move watermarks backwards. LIVE describes connectivity to the simulated server only. There is still no durable WebSocket replay cursor; HTTP remains the recovery authority.
