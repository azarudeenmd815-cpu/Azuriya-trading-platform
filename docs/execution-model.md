# Native simulated execution

**Phase 1 execution is simulated. There is no external LP, external broker, exchange execution, or real-money settlement.** Both `PROP_SIMULATED` and `BROKER_DEMO` use the native simulation engine. `BROKER_LIVE_INTERNALIZED` is defined but disabled.

## Executable prices and triggers

The engine uses the current validated client quote at execution time, after applying an explicit pricing profile to the reference quote.

| Instruction       | Trigger                           | Execution side |
| ----------------- | --------------------------------- | -------------- |
| BUY market        | Immediately after validation/risk | ASK            |
| SELL market       | Immediately after validation/risk | BID            |
| BUY limit         | ASK <= limit price                | ASK            |
| SELL limit        | BID >= limit price                | BID            |
| BUY stop          | ASK >= stop price                 | ASK            |
| SELL stop         | BID <= stop price                 | BID            |
| Long stop loss    | BID <= stop loss                  | BID            |
| Long take profit  | BID >= take profit                | BID            |
| Short stop loss   | ASK >= stop loss                  | ASK            |
| Short take profit | ASK <= take profit                | ASK            |

Stops can execute beyond their trigger during a simulated gap. Limits fill at the qualifying executable price, which may improve on the requested limit. Phase 1 assumes sufficient simulated liquidity for an accepted quantity; it does not emulate an order book or external venue partial fills. Quantity-based partial position closes are supported.

Pending orders are checked on accepted market ticks, in deterministic order, and re-run risk validation at trigger time. They do not reserve margin before triggering. If free margin is no longer sufficient, the order is rejected with an auditable reason. Concurrent commands cannot overspend the same free margin because transitions are serialized.

## Policy and audit

The execution profile describes simulated latency and slippage. Tests run without latency; local development may configure a small fixed latency. Policies are deterministic or explicitly configured and recorded with fills/events. No trader-specific adverse slippage or profitability-based price manipulation is permitted.

Fill records retain reference and client bid/ask, executable price, quote sequence, execution reason, `execution_profile_id`, `pricing_profile_id`, `latency_mode`, `slippage_mode`, and simulated latency. Audit events capture order receipt/validation/acceptance/trigger/fill or rejection, position changes, and account valuation updates. Audit and ledger history are append-only and persist atomically with the trading state. Replayed request keys return the original outcome without duplicating economic effects.

Initial market and immediately executable limit-order stop losses must lie beyond the current close-side price, outside the spread. Take profit must lie beyond the actual entry. Pending-order protection is validated against requested entry; if a later gap crosses attached protection, the engine opens and closes at the same execution snapshot, with both fills and the realized result recorded.

## P&L and margin

A long position is marked to bid; a short position is marked to ask. Closing realizes P&L into the account ledger and balance. Partial closing realizes only the closed quantity. Account equity and margin are recalculated by the server after fills, closes, and accepted quotes.

Margin is centralized in the margin service. Effective leverage is the smaller of account and instrument leverage. USD-quoted required margin is `contract_size × quantity × price / leverage`; USDJPY margin in USD is `contract_size × quantity / leverage`. Required margin rounds upward to 12 decimal places. JPY P&L converts to USD at the executable conversion side and rounds to 12 places. Advisory margin-call/stop-out thresholds use unrounded equity comparisons. USD is the supported account currency; arbitrary cross-currency portfolios are not.

## Intentional limits

There is no real liquidity, routing, external settlement, broker connectivity, payment processing, deposit/withdrawal flow, or live account execution. There is no netting mode, automated stop-out, commission/swap accrual, or external historical market-data feed. Charts load persisted synthetic BID history and incremental candles generated from committed simulated quotes. Simulation is never described as live external execution.

## Phase 2 sizing and management

Risk % uses current equity; Risk $ uses the requested USD budget. Both require a valid SL. The backend converts estimated stop loss to account currency, rounds quantity down to the instrument step, and checks the converted total loss against the budget (including fractional JPY conversion). Below-minimum quantity and insufficient margin reject the command. The server re-evaluates at submission, so a displayed preview does not reserve quantity, quote, or margin. Price gaps and changing FX conversion rates can produce losses exceeding the estimate.

DISTANCE is an absolute price distance, not pips or percent. The backend resolves SL/TP on the correct side of the estimated entry and validates tick alignment and executable-side restrictions. Existing position protection previews use the original position entry for estimated P&L while validating against the current close-side market. A negative potential_loss means estimated profit locked by a stop beyond entry.

Breakeven requests set SL to the position entry and retain TP only if valid at the current executable market and trading status. Invalid breakeven is explicitly rejected and audited; the server never forces a level. Percentage-close previews show actual lot rounding and remaining quantity before confirmation.

Pending-order PATCH preserves identity, changes priority using UpdatedAt, validates ownership/status/step/protection/risk, and can immediately fill a newly marketable limit in the same durable transition. Both SL and TP are replacement fields: null removes a level. Retrying the same command key is safe; changing its payload produces an idempotency conflict.

Charts consistently represent BID candles with an optional ASK line. BUY entry executes at ASK; SELL entry at BID. BUY positions close/mark at BID; SELL positions at ASK. Chart drag coordinates and lines are temporary display state and never become executable prices without server validation.
