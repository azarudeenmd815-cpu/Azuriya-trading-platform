"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Instrument,
  EffectiveConfiguration,
  Order,
  OrderPreview,
  OrderType,
  Side,
  TradeRequest,
  TradingAccount,
} from "@azuriya/api-types";
import { message, post } from "@/lib/api";
import {
  formatDecimal,
  isPositiveDecimal,
  spreadPoints,
} from "@/lib/decimal-display";
import { useTerminal } from "@/lib/store";
import { notify } from "@/lib/notifications";
import { Icon } from "./icons";
import { TradePreview } from "./trade-preview";
import "./trading-v2.css";

export function OrderTicket({
  account,
  instrument,
  terms,
}: {
  account?: TradingAccount;
  instrument?: Instrument;
  terms?: EffectiveConfiguration;
}) {
  const symbol = useTerminal((s) => s.symbol),
    quote = useTerminal((s) => s.quotes[symbol]),
    connection = useTerminal((s) => s.connection);
  const prefs = useTerminal((s) => s.config.order_ticket);
  const setPrefs = (patch: Partial<typeof prefs>) =>
    useTerminal.getState().updateConfig({
      order_ticket: {
        ...useTerminal.getState().config.order_ticket,
        ...patch,
      },
    });
  const [side, setSide] = useState<Side>("BUY"),
    [type, setType] = useState<OrderType>("MARKET");
  const [entry, setEntry] = useState(""),
    [sl, setSL] = useState(""),
    [tp, setTP] = useState(""),
    [protectedTrade, setProtected] = useState(false);
  const request = useRef<{ signature: string; key: string } | undefined>(
      undefined,
    ),
    client = useQueryClient();
  const riskMode = prefs.quantity_mode === "RISK",
    hasProtection = riskMode || protectedTrade;
  const body: TradeRequest = {
    client_order_id: "preview",
    symbol,
    side,
    type,
    time_in_force: type === "MARKET" ? "IOC" : "GTC",
    quantity_mode: riskMode
      ? prefs.risk_mode === "PERCENT"
        ? "RISK_PERCENT"
        : "RISK_AMOUNT"
      : "LOTS",
    ...(!riskMode
      ? { quantity: prefs.quantity }
      : prefs.risk_mode === "PERCENT"
        ? { risk_percent: prefs.risk_value }
        : { risk_amount: prefs.risk_value }),
    ...(type === "LIMIT"
      ? { limit_price: entry }
      : type === "STOP"
        ? { stop_price: entry }
        : {}),
    ...(hasProtection && sl
      ? { stop_loss: sl, stop_loss_mode: prefs.protection_mode }
      : {}),
    ...(hasProtection && tp
      ? { take_profit: tp, take_profit_mode: prefs.protection_mode }
      : {}),
  };
  const valid =
    isPositiveDecimal(riskMode ? prefs.risk_value : prefs.quantity) &&
    (type === "MARKET" || isPositiveDecimal(entry)) &&
    (!riskMode || isPositiveDecimal(sl)) &&
    (!hasProtection ||
      ((!sl || isPositiveDecimal(sl)) && (!tp || isPositiveDecimal(tp))));
  const signature = JSON.stringify(body),
    [settled, setSettled] = useState(signature);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(signature), 250);
    return () => clearTimeout(timer);
  }, [signature]);
  const preview = useQuery({
    queryKey: ["order-preview", account?.id, settled],
    queryFn: () =>
      post<OrderPreview>(
        `/accounts/${account!.id}/orders/preview`,
        JSON.parse(settled),
      ),
    enabled:
      !!account && valid && signature === settled && connection === "LIVE",
    retry: false,
    staleTime: 3000,
    refetchInterval: 5000,
  });
  const submit = useMutation({
    mutationFn: (input: TradeRequest) => {
      const fingerprint = JSON.stringify([account?.id, input]);
      if (request.current?.signature !== fingerprint)
        request.current = { signature: fingerprint, key: crypto.randomUUID() };
      return post<Order>(
        `/accounts/${account!.id}/orders`,
        { ...input, client_order_id: request.current.key },
        request.current.key,
      );
    },
    onSuccess: (order) => {
      request.current = undefined;
      void client.invalidateQueries({ queryKey: ["account"] });
      void client.invalidateQueries({ queryKey: ["accounts"] });
      notify(
        order.status === "FILLED"
          ? `${order.side} ${order.symbol} filled`
          : `${order.type} order accepted`,
        "success",
        `order:${order.id}`,
      );
    },
    onError: (error) => notify(message(error), "error"),
  });
  const canSubmit =
    valid &&
    account?.status === "ACTIVE" &&
    instrument?.trading_status === "OPEN" &&
    terms?.session_status !== "CLOSED" &&
    terms?.session_status !== "CLOSE_ONLY" &&
    connection === "LIVE" &&
    preview.data?.can_submit &&
    signature === settled &&
    !preview.isError &&
    !submit.isPending;
  return (
    <aside className="order-ticket">
      <div className="panel-title">
        <span>Order ticket</span>
        <Icon name="plus" size={16} />
      </div>
      <div className="ticket-market">
        <div>
          <strong>{symbol}</strong>
          <span>{instrument?.display_name}</span>
        </div>
        <span
          className={`market-open ${(terms?.session_status || instrument?.trading_status) !== "OPEN" ? "muted" : ""}`}
        >
          <span className="small-dot" />
          {terms?.session_status === "OPEN"
            ? instrument?.trading_status
            : terms?.session_status || instrument?.trading_status || "LOADING"}
        </span>
      </div>
      {terms && (
        <div className="ticket-broker-terms">
          <span>
            Effective leverage <strong>1:{terms.effective_leverage}</strong>
          </span>
          <span>
            Commission{" "}
            <strong>
              {terms.commission.mode === "NONE"
                ? "None"
                : `${terms.commission.amount} ${terms.commission.currency} / lot · ${terms.commission.mode === "PER_LOT_PER_SIDE" ? "per side" : "round turn at open"}`}
            </strong>
          </span>
          <span>
            Swap{" "}
            <strong>
              {terms.swap.enabled
                ? `${terms.swap.long_rate} / ${terms.swap.short_rate} ${terms.swap.currency} per lot`
                : "Disabled"}
            </strong>
          </span>
        </div>
      )}
      <div className="trade-sides">
        {(["SELL", "BUY"] as Side[]).map((value) => (
          <button
            key={value}
            aria-pressed={side === value}
            className={`${value.toLowerCase()} ${side === value ? "selected" : ""}`}
            onClick={() => {
              setSide(value);
              submit.reset();
            }}
          >
            <span>{value}</span>
            <strong>
              {formatDecimal(
                value === "BUY" ? quote?.ask : quote?.bid,
                instrument?.digits ?? 5,
                false,
              )}
            </strong>
          </button>
        ))}
      </div>
      <div className="ticket-spread">
        <span />
        Spread{" "}
        {quote
          ? spreadPoints(quote.bid, quote.ask, instrument?.digits ?? 5)
          : "—"}{" "}
        points
        <span />
      </div>
      <div className="order-type-tabs" role="group" aria-label="Order type">
        {(["MARKET", "LIMIT", "STOP"] as OrderType[]).map((value) => (
          <button
            key={value}
            onClick={() => {
              setType(value);
              submit.reset();
            }}
            className={type === value ? "active" : ""}
          >
            {value.charAt(0) + value.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <form
        className="ticket-form-v2"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) submit.mutate(body);
        }}
      >
        <div className="sizing-tabs" role="group" aria-label="Position sizing">
          <button
            type="button"
            className={!riskMode ? "active" : ""}
            onClick={() => setPrefs({ quantity_mode: "LOTS" })}
          >
            Lots
          </button>
          <button
            type="button"
            className={riskMode ? "active" : ""}
            onClick={() => setPrefs({ quantity_mode: "RISK" })}
          >
            Risk
          </button>
        </div>
        {!riskMode ? (
          <>
            <label className="ticket-label">
              Quantity <span>Lots</span>
              <input
                aria-label="Order quantity"
                inputMode="decimal"
                value={prefs.quantity}
                onChange={(e) => setPrefs({ quantity: e.target.value })}
                required
              />
            </label>
            <div className="quantity-presets">
              {["0.01", "0.10", "0.50", "1.00"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={prefs.quantity === value ? "active" : ""}
                  onClick={() => setPrefs({ quantity: value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div
              className="input-mode-tabs"
              role="group"
              aria-label="Risk units"
            >
              <button
                type="button"
                className={prefs.risk_mode === "PERCENT" ? "active" : ""}
                onClick={() => setPrefs({ risk_mode: "PERCENT" })}
              >
                Risk %
              </button>
              <button
                type="button"
                className={prefs.risk_mode === "AMOUNT" ? "active" : ""}
                onClick={() => setPrefs({ risk_mode: "AMOUNT" })}
              >
                Risk $
              </button>
            </div>
            <label className="ticket-label">
              Risk budget{" "}
              <span>
                {prefs.risk_mode === "PERCENT" ? "% of current equity" : "USD"}
              </span>
              <input
                aria-label="Risk value"
                inputMode="decimal"
                value={prefs.risk_value}
                onChange={(e) => setPrefs({ risk_value: e.target.value })}
                required
              />
            </label>
          </>
        )}
        {type !== "MARKET" && (
          <label className="ticket-label">
            {type === "LIMIT" ? "Limit price" : "Stop entry price"}
            <input
              aria-label="Entry price"
              inputMode="decimal"
              placeholder={side === "BUY" ? quote?.ask : quote?.bid}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              required
            />
          </label>
        )}
        <div className="protection-toggle">
          <span>
            <Icon name="shield" size={15} />
            Protect position
          </span>
          <label className="switch">
            <input
              aria-label="Enable stop loss and take profit"
              type="checkbox"
              checked={hasProtection}
              disabled={riskMode}
              onChange={(e) => setProtected(e.target.checked)}
            />
            <span />
          </label>
        </div>
        {hasProtection && (
          <>
            <div
              className="input-mode-tabs"
              role="group"
              aria-label="Protection input mode"
            >
              {(["PRICE", "DISTANCE"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={prefs.protection_mode === mode ? "active" : ""}
                  onClick={() => setPrefs({ protection_mode: mode })}
                >
                  {mode === "PRICE" ? "Price" : "Price distance"}
                </button>
              ))}
            </div>
            <div className="protection-fields">
              <label>
                Stop loss{riskMode ? " *" : ""}
                <input
                  aria-label="Stop loss"
                  inputMode="decimal"
                  value={sl}
                  placeholder={
                    prefs.protection_mode === "PRICE"
                      ? "Stop price"
                      : "Absolute price distance"
                  }
                  onChange={(e) => setSL(e.target.value)}
                  required={riskMode}
                />
              </label>
              <label>
                Take profit
                <input
                  aria-label="Take profit"
                  inputMode="decimal"
                  value={tp}
                  placeholder={
                    prefs.protection_mode === "PRICE"
                      ? "Target price"
                      : "Absolute price distance"
                  }
                  onChange={(e) => setTP(e.target.value)}
                />
              </label>
            </div>
            {riskMode && !sl && (
              <p className="inline-warning">
                A valid stop loss is required for risk sizing.
              </p>
            )}
          </>
        )}
        <TradePreview
          preview={preview.data}
          pending={preview.isFetching || signature !== settled}
          error={preview.isError ? message(preview.error) : undefined}
        />
        {instrument?.trading_status !== "OPEN" && (
          <div className="error-box">
            {instrument?.trading_status === "CLOSE_ONLY"
              ? "This market only allows reducing existing positions."
              : "This market is unavailable for trading."}
          </div>
        )}
        {submit.isError && (
          <div className="error-box" role="alert">
            {message(submit.error)}
          </div>
        )}
        {submit.isSuccess && (
          <div role="status" className="success-box">
            <Icon name="check" size={15} />
            <span>
              {submit.data.status === "FILLED"
                ? `${submit.data.side} ${submit.data.symbol} filled successfully.`
                : `${submit.data.type.charAt(0) + submit.data.type.slice(1).toLowerCase()} order accepted.`}
              <small>Order {submit.data.id.slice(0, 8)}</small>
            </span>
          </div>
        )}
        <button
          className={`submit-order ${side.toLowerCase()}`}
          disabled={!canSubmit}
        >
          {submit.isPending
            ? "Submitting…"
            : `${side === "BUY" ? "Buy" : "Sell"} ${symbol}`}
          <Icon name="arrow" size={17} />
        </button>
        <p className="order-disclaimer">
          {connection !== "LIVE"
            ? "Quotes are stale. Trading is unavailable while the connection restores."
            : "Preview is non-binding. The server recalculates quantity, protection and margin when you submit. Stop losses do not guarantee the previewed loss across price gaps."}
        </p>
      </form>
      <div className="ticket-footer">
        <Icon name="shield" size={14} />
        SIMULATED FUNDS · NO EXTERNAL LP
      </div>
    </aside>
  );
}
