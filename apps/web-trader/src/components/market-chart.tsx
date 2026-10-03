"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CANDLE_INTERVALS,
  type Candle,
  type ChartPane,
  type Instrument,
} from "@azuriya/api-types";
import {
  createTradingViewAdapter,
  type ChartAdapter,
  type OHLC,
} from "@/lib/chart-adapter";
import { useTerminal } from "@/lib/store";
import { api, message } from "@/lib/api";
import { formatDecimal, money, spreadPoints } from "@/lib/decimal-display";
import { mergeCandles } from "@/lib/candle-data";
import { useChartTrading } from "@/lib/use-chart-trading";
import { Icon } from "./icons";
const INTERVAL_SECONDS: Record<string, number> = {
  "1s": 1,
  "5s": 5,
  "15s": 15,
  "30s": 30,
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1D": 86400,
};
export function MarketChart({
  pane,
  instruments,
  accountId,
  active,
}: {
  pane: ChartPane;
  instruments: Instrument[];
  accountId: string;
  active: boolean;
}) {
  const instrument = instruments.find((item) => item.symbol === pane.symbol);
  const quote = useTerminal((state) => state.quotes[pane.symbol]);
  const connection = useTerminal((state) => state.connection);
  const showAsk = useTerminal((state) => state.config.order_ticket.show_ask);
  const updateChart = useTerminal((state) => state.updateChart);
  const selectChart = useTerminal((state) => state.selectChart);
  const history = useQuery({
    queryKey: ["candles", pane.symbol, pane.interval],
    queryFn: () =>
      api<Candle[]>(
        `/instruments/${pane.symbol}/candles?interval=${pane.interval}&limit=350`,
      ),
    staleTime: 60_000,
  });
  const trading = useChartTrading(accountId, pane.symbol);
  const callbacks = useRef(trading);
  callbacks.current = trading;
  const [ohlc, setOHLC] = useState<OHLC>();
  const container = useRef<HTMLDivElement>(null),
    adapter = useRef<ChartAdapter>(undefined);
  const digits = instrument?.digits ?? 5;
  const candleKey = `${pane.symbol}:${pane.interval}`;
  // A new adapter must receive canonical overlays even when the trade objects,
  // current quote and cached history did not change during a layout switch.
  const adapterKey = `${candleKey}:${pane.id}:${digits}:${instrument?.tick_size}`;
  useEffect(() => {
    if (!container.current) return;
    setOHLC(undefined);
    const chart = createTradingViewAdapter(
      container.current,
      INTERVAL_SECONDS[pane.interval],
      digits,
      setOHLC,
      instrument?.tick_size || "0.00001",
      (drag) => callbacks.current.setDrag(drag),
      (drag) => void callbacks.current.drop(drag),
    );
    adapter.current = chart;
    const buffered = new Map<string, Candle>();
    let frame = 0;
    const unsubscribe = useTerminal.subscribe((state, previous) => {
      const candle = state.candles[candleKey];
      if (candle && candle !== previous.candles[candleKey]) {
        buffered.set(candle.open_time, candle);
        if (!frame)
          frame = requestAnimationFrame(() => {
            frame = 0;
            [...buffered.values()]
              .sort((a, b) => a.open_time.localeCompare(b.open_time))
              .forEach((item) => chart.updateCandle(item));
            buffered.clear();
          });
      }
    });
    const command = (event: Event) => {
      if (useTerminal.getState().config.selected_chart === pane.id) {
        const action = (event as CustomEvent<string>).detail;
        if (action === "fit") chart.fit();
        else chart.reset();
      }
    };
    window.addEventListener("azuriya:chart-action", command);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      window.removeEventListener("azuriya:chart-action", command);
      chart.destroy();
      adapter.current = undefined;
    };
  }, [
    pane.symbol,
    pane.interval,
    pane.id,
    digits,
    instrument?.tick_size,
    candleKey,
  ]);
  useEffect(() => {
    if (history.data) {
      const latest = useTerminal.getState().candles[candleKey];
      adapter.current?.setCandles(
        mergeCandles(history.data, latest ? [latest] : []),
      );
    }
  }, [history.data, candleKey, adapterKey]);
  useEffect(() => {
    if (quote) adapter.current?.setQuote(quote, showAsk);
  }, [quote, showAsk, adapterKey]);
  useEffect(() => {
    adapter.current?.setTradeLines(trading.lines);
  }, [trading.lines, adapterKey]);
  return (
    <section
      className={`chart-panel chart-pane ${active ? "active-pane" : ""} ${connection !== "LIVE" ? "stale-chart" : ""}`}
      data-pane-id={pane.id}
      onPointerDown={() => {
        if (!active) selectChart(pane.id);
      }}
      onFocusCapture={() => {
        if (!active) selectChart(pane.id);
      }}
    >
      <div className="chart-toolbar">
        <div className="instrument-picker">
          <span className="pane-number">
            {pane.id.replace(/\D/g, "") || "1"}
          </span>
          <div>
            <select
              aria-label={`Chart instrument ${pane.id}`}
              value={pane.symbol}
              onChange={(event) =>
                updateChart(pane.id, { symbol: event.target.value })
              }
            >
              {instruments.map((item) => (
                <option key={item.symbol}>{item.symbol}</option>
              ))}
            </select>
            <span>{instrument?.display_name || "Market chart"}</span>
          </div>
        </div>
        <div className="chart-tools">
          <select
            aria-label={`Chart interval ${pane.id}`}
            value={pane.interval}
            onChange={(event) =>
              updateChart(pane.id, {
                interval: event.target.value as ChartPane["interval"],
              })
            }
          >
            {CANDLE_INTERVALS.map((interval) => (
              <option key={interval}>{interval}</option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label={`Zoom in ${pane.id}`}
            title="Zoom in"
            onClick={() => adapter.current?.zoom(1)}
          >
            <Icon name="plus" size={13} />
          </button>
          <button
            className="icon-button"
            aria-label={`Zoom out ${pane.id}`}
            title="Zoom out"
            onClick={() => adapter.current?.zoom(-1)}
          >
            <Icon name="minus" size={13} />
          </button>
          <button
            className="icon-button"
            aria-label={`Reset chart ${pane.id}`}
            title="Reset chart"
            onClick={() => adapter.current?.reset()}
          >
            <Icon name="reset" size={14} />
          </button>
          <button
            className="icon-button"
            aria-label={`Fit chart ${pane.id}`}
            title="Fit all history"
            onClick={() => adapter.current?.fit()}
          >
            <Icon name="expand" size={14} />
          </button>
        </div>
      </div>
      <div className="chart-legend">
        <span className="legend-symbol">{pane.symbol}</span>
        <span className="legend-separator">·</span>
        <span>BID</span>
        <div className="ohlc">
          {(["open", "high", "low", "close"] as const).map((key) => (
            <span key={key}>
              <i>{key[0].toUpperCase()}</i>
              {formatDecimal(ohlc?.[key], digits, false)}
            </span>
          ))}
        </div>
        {connection !== "LIVE" && (
          <span className="stale-label">STALE · {connection}</span>
        )}
      </div>
      <div className="chart-canvas" ref={container} />
      {(history.isPending || history.isError || !history.data?.length) && (
        <div className="chart-wait">
          <Icon name="chart" size={25} />
          <strong>
            {history.isPending
              ? "Loading simulated history…"
              : history.isError
                ? "Chart history unavailable"
                : "No candles in this interval"}
          </strong>
          {history.isError && (
            <>
              <span>{message(history.error)}</span>
              <button
                className="table-button"
                onClick={() => void history.refetch()}
              >
                Retry chart
              </button>
            </>
          )}
        </div>
      )}
      {trading.drag && (
        <div className="chart-drag-preview">
          <strong>
            PREVIEW · {trading.drag.line.kind} {trading.drag.price}
          </strong>
          {trading.preview ? (
            <span>
              Loss {money(trading.preview.potential_loss)} · Profit{" "}
              {money(trading.preview.potential_profit)} · R:R{" "}
              {formatDecimal(trading.preview.risk_reward)}
            </span>
          ) : (
            <span>{trading.previewError || "Calculating server preview…"}</span>
          )}
          <small>Release submits for server validation. Esc cancels.</small>
        </div>
      )}
      {trading.busy && (
        <div className="chart-saving">Validating modification…</div>
      )}
      <div className="chart-bottom">
        <span>
          <span className="small-dot" />
          SIMULATED · {history.data?.length || 0} HISTORY BARS
        </span>
        <span>
          {quote ? `${spreadPoints(quote.bid, quote.ask, digits)} pts` : "—"}
        </span>
        <button
          title="Autoscale price"
          onClick={() => adapter.current?.autoscale()}
        >
          Auto
        </button>
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
          title="TradingView Lightweight Charts™. Copyright (с) 2025 TradingView, Inc."
        >
          TradingView
        </a>
      </div>
    </section>
  );
}
