# Domain model and invariants

All prices, quantities, balances, P&L, and margin values use exact decimal arithmetic and JSON strings. Decimal rounding policies belong to the server. Binary floating point is reserved for rendering charts.

## Identity and ownership

`Tenant` is the trading isolation boundary. `User` contains identity and a password hash that is never returned by the API. `TenantMembership` associates a user and tenant with `TRADER`, `SUPPORT`, `ADMIN`, or `OWNER`. The authenticated session establishes the active user and tenant. Every account-specific operation additionally verifies account ownership; a role label alone does not expose another trader's account.

## Accounts and instruments

`TradingAccount` belongs to a tenant and user. Implemented modes are `PROP_SIMULATED` and `BROKER_DEMO`. `BROKER_LIVE_INTERNALIZED` remains disabled. Account states are `ACTIVE`, `READ_ONLY`, `SUSPENDED`, and `CLOSED`; trading permission is enforced in domain logic. Positions use `HEDGING`. `NETTING` is reserved and rejected for trading.

The account tracks balance, equity, used/free margin, margin level, currency, and leverage. Seeded accounts use USD and 1:100 leverage. All account figures are calculated by the server. An account with no used margin represents margin level using the API's documented zero value; the UI may display a dash to communicate the absence of exposure.

`Instrument` is tenant scoped and defines symbol, currency pair, asset class, price digits/tick size, contract size, quantity limits/step, default leverage, and trading status. `CLOSE_ONLY` allows reducing existing exposure; `DISABLED` prevents execution. Supported seed symbols are EURUSD, GBPUSD, USDJPY, XAUUSD, US100, and BTCUSD.

`Quote` carries symbol, bid, ask, timestamp, and sequence. Bid and ask must be positive, ask cannot be below bid, prices must satisfy instrument precision, and ticks cannot move backwards in sequence/time. Execution rejects stale or otherwise invalid quotes. Client quotes derive from validated reference quotes through the pricing profile.

## Trading lifecycle

`Order` records the client order ID, tenant/account, symbol, side, type, time in force, original/remaining quantity, optional entry/protection prices, timestamps, and lifecycle state. Phase 1 types are `MARKET`, `LIMIT`, and `STOP`; sides are `BUY` and `SELL`. Market orders fill immediately under the simulation policy; pending orders wait for their executable-side trigger. Pending orders may be cancelled. Important validations and rejections create audit events.

`Fill` is a discrete simulated execution with order/account, side, quantity, executable price, reference bid/ask, execution reason, latency, and timestamp. Closing a position also creates a fill. Fill history never implies an external counterparty or settlement.

`Position` is an independent hedging lot: two market orders do not silently merge into a net position. It holds open/remaining quantity, open price, current close-side price, realized/unrealized P&L, optional SL/TP, timestamps, and status. Partial close realizes P&L only for the closed quantity and retains the same position for the remainder. Full close marks the position closed.

Protection prices must be valid for the side and executable market. Long positions close against bid; short positions close against ask. SL/TP execution is server-side and does not depend on an open browser.

## Ledger, events, and replay safety

`AccountTransaction` is append-only. Implemented balance entries include initial funding and realized P&L. `COMMISSION`, `SWAP`, and `ADJUSTMENT` are defined for future policies; scheduled commission/swap accrual is not implemented. Balance is traceable to ledger entries, not to a client calculation.

`DomainEvent` / audit records carry tenant, aggregate type/ID, sequence, event type, payload, and timestamp. An execution's order, fill, position, account, ledger, and audit mutations commit together before notification. Failed persistence must not publish a successful execution.

PostgreSQL retains full audit history. For bounded runtime overhead, engine snapshots hold only the latest 1,000 events across the engine; dropping a record from this recent-event cache never removes it from durable audit history. The account events API supports paginated SQL history. Explicit memory mode has only the recent event window and loses all state on restart.

Idempotency applies to order placement and position-close commands. A retry with the same key and same command returns its prior result without another fill or ledger entry. Reusing a key for different command data returns a conflict. Replay records persist with trading state. Authentication and account ownership checks remain mandatory on retries.

## Valuation

For quantity in lots, base units are `contract_size × quantity`. USD-quoted unrealized P&L is `(close_price - open_price) × units` for BUY and `(open_price - close_price) × units` for SELL. USDJPY produces JPY P&L and converts through the currency-conversion service using the available USDJPY quote. General cross-currency routing and non-USD account currencies are out of scope.

`equity = balance + unrealized_pnl`; `margin_free = equity - margin_used`; when margin is nonzero, `margin_level = equity / margin_used × 100`. Effective leverage is the smaller of account leverage and instrument default leverage. For USD-quoted instruments, required margin is `contract_size × quantity × price / effective_leverage`. For USDJPY in a USD account, it is `contract_size × quantity / effective_leverage`: one standard lot at 1:100 requires exactly USD 1,000, without a round-trip currency conversion.

The margin package centralizes required-margin logic and the portfolio service aggregates positions. Required margin rounds upward to 12 decimal places so fractional rounding cannot understate risk. JPY-to-USD P&L conversion rounds to 12 decimal places, using USDJPY ask for gains and bid for losses. Displayed margin level rounds to 8 decimal places. Risk thresholds compare unrounded equity and margin directly, never displayed percentages or chart numbers.

Accounts expose advisory `margin_status`: `NORMAL`, `MARGIN_CALL` below 100%, and `STOP_OUT_REQUIRED` below 50%. These statuses and `MARGIN_WARNING` events provide extension points; automatic liquidation is disabled in Phase 1.

## Phase 2 commands and projections

`TradeRequest` retains legacy flat order fields and adds LOTS/RISK_PERCENT/RISK_AMOUNT sizing plus PRICE/DISTANCE protection inputs. All financial values remain JSON decimal strings. `OrderPreview` is nonbinding and exposes resolved quantity, entry, budget, potential loss/profit, risk/reward, margin, free margin, distances, resolved SL/TP, warnings, and the quote sequence. It does not create an order or reserve funds. Submission recomputes within the serialized trading transition.

Percentage closes use `CloseRequest.percentage`, exclusive with `quantity`. The server finds the nearest legal close quantity, preferring the smaller close on a tie, and prevents a remaining quantity below the instrument minimum. Preview reports the requested, actual, remaining, percentage, adjustment, and warnings; rounding may require full close. The execution recomputes this decision.

Pending order modification preserves order ID/creation time, replaces nullable SL/TP as a pair, changes safe quantity/entry fields, resets time priority, and retains durable command idempotency. Breakeven requests also use durable idempotency. Rejected protection, pending modifications, and breakeven requests remain auditable without applying the invalid change.

`Candle` is a tenant/symbol/interval/open-time projection with exact OHLC, close time, integer tick volume, completion flag, quote watermark, and simulated source metadata. `Workspace` is an owner-scoped configuration with a revision; it is independent from the trading engine state. Workspace audit is append-only and carries the authenticated actor. See [workspaces](workspaces.md).
