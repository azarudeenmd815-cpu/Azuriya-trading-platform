import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
  LineStyle,
} from "lightweight-charts";
import type { Quote, Candle } from "@azuriya/api-types";
import {
  ChartTradeLayer,
  type TradeLine,
  type TradeDrag,
} from "./chart-trade-layer";
export interface OHLC {
  open: string;
  high: string;
  low: string;
  close: string;
}
export interface ChartAdapter {
  setCandles(candles: Candle[]): void;
  updateCandle(candle: Candle): void;
  setQuote(quote: Quote, showAsk: boolean): void;
  setTradeLines(lines: TradeLine[]): void;
  fit(): void;
  reset(): void;
  zoom(direction: 1 | -1): void;
  autoscale(): void;
  destroy(): void;
}
/** Chart rendering is the only boundary allowed to convert decimal prices to floats. */
export function aggregateCandles(
  quotes: Quote[],
  interval: number,
): CandlestickData[] {
  const bars = new Map<number, CandlestickData>();
  for (const quote of quotes) {
    const price = Number(quote.bid);
    const timestamp =
      Math.floor(Date.parse(quote.timestamp) / 1000 / interval) * interval;
    if (!Number.isFinite(price) || !Number.isFinite(timestamp)) continue;
    const previous = bars.get(timestamp);
    bars.set(
      timestamp,
      previous
        ? {
            ...previous,
            high: Math.max(previous.high, price),
            low: Math.min(previous.low, price),
            close: price,
          }
        : {
            time: timestamp as UTCTimestamp,
            open: price,
            high: price,
            low: price,
            close: price,
          },
    );
  }
  return [...bars.values()].sort(
    (a, b) => (a.time as number) - (b.time as number),
  );
}
export function createTradingViewAdapter(
  container: HTMLElement,
  interval: number,
  digits: number,
  onCrosshair: (value: OHLC | undefined) => void,
  tickSize = "0.00001",
  onPreview: (drag?: TradeDrag) => void = () => undefined,
  onDrop: (drag: TradeDrag) => void = () => undefined,
): ChartAdapter {
  const chart: IChartApi = createChart(container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "#141414" },
      textColor: "#b8b8b8",
      fontSize: 11,
      fontFamily: '"Azuriya Gotham Numerals", Arial, sans-serif',
      attributionLogo: true,
    },
    grid: { vertLines: { color: "#242424" }, horzLines: { color: "#242424" } },
    rightPriceScale: {
      borderColor: "#333333",
      minimumWidth: 76,
      scaleMargins: { top: 0.12, bottom: 0.12 },
    },
    timeScale: {
      borderColor: "#333333",
      timeVisible: true,
      secondsVisible: interval < 60,
      rightOffset: 12,
      barSpacing: 9,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: "#a3a3a3", labelBackgroundColor: "#333333" },
      horzLine: { color: "#a3a3a3", labelBackgroundColor: "#333333" },
    },
    handleScroll: true,
    handleScale: true,
  });
  const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
    upColor: "#36d69d",
    downColor: "#fd606c",
    wickUpColor: "#36d69d",
    wickDownColor: "#fd606c",
    borderVisible: false,
    priceLineVisible: false,
    priceFormat: { type: "price", precision: digits, minMove: 10 ** -digits },
  });
  const trades = new ChartTradeLayer(
    chart,
    series,
    container,
    digits,
    tickSize,
    onPreview,
    onDrop,
  );
  let bidLine: IPriceLine | undefined, askLine: IPriceLine | undefined;
  const render = (candle: Candle): CandlestickData => ({
    time: Math.floor(Date.parse(candle.open_time) / 1000) as UTCTimestamp,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  });
  let lastTime = 0,
    lastSequence = 0,
    count = 0;
  let latest: CandlestickData | undefined;
  let inspecting = false;
  const display = (bar: CandlestickData | undefined): OHLC | undefined =>
    bar
      ? {
          open: bar.open.toFixed(digits),
          high: bar.high.toFixed(digits),
          low: bar.low.toFixed(digits),
          close: bar.close.toFixed(digits),
        }
      : undefined;
  chart.subscribeCrosshairMove((event) => {
    const bar = event.seriesData.get(series) as CandlestickData | undefined;
    inspecting = !!bar && "open" in bar;
    onCrosshair(display(inspecting ? bar : latest));
  });
  let initialized = false;
  return {
    setCandles(candles) {
      const bars = candles.map(render);
      series.setData(bars);
      count = bars.length;
      latest = bars[bars.length - 1];
      lastTime = latest ? (latest.time as number) : 0;
      lastSequence = candles.at(-1)?.sequence || 0;
      if (!inspecting) onCrosshair(display(latest));
      if (!initialized && bars.length) {
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, bars.length - 110),
          to: bars.length + 8,
        });
        initialized = true;
      }
      trades.schedule();
    },
    updateCandle(candle) {
      const bar = render(candle),
        time = bar.time as number;
      if (
        time < lastTime ||
        (time === lastTime && candle.sequence <= lastSequence)
      )
        return;
      if (time > lastTime) count++;
      series.update(bar);
      latest = bar;
      lastTime = time;
      lastSequence = candle.sequence;
      if (!inspecting) onCrosshair(display(latest));
      trades.schedule();
    },
    setQuote(quote, showAsk) {
      const bidOptions = {
        price: Number(quote.bid),
        color: "#36d69d",
        title: "BID",
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
      };
      if (bidLine) bidLine.applyOptions(bidOptions);
      else bidLine = series.createPriceLine(bidOptions);
      if (showAsk) {
        const options = {
          ...bidOptions,
          price: Number(quote.ask),
          color: "#fd606c",
          title: "ASK",
        };
        if (askLine) askLine.applyOptions(options);
        else askLine = series.createPriceLine(options);
      } else if (askLine) {
        series.removePriceLine(askLine);
        askLine = undefined;
      }
      trades.schedule();
    },
    setTradeLines(lines) {
      trades.setLines(lines);
    },
    fit() {
      chart.timeScale().fitContent();
      trades.schedule();
    },
    reset() {
      chart.priceScale("right").applyOptions({ autoScale: true });
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, count - 110),
        to: count + 8,
      });
      trades.schedule();
    },
    autoscale() {
      chart.priceScale("right").applyOptions({ autoScale: true });
      trades.schedule();
    },
    zoom(direction) {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (range) {
        const width = (range.to - range.from) * (direction > 0 ? 0.75 : 1.25);
        chart
          .timeScale()
          .setVisibleLogicalRange({ from: range.to - width, to: range.to });
      }
      trades.schedule();
    },
    destroy() {
      trades.destroy();
      chart.remove();
    },
  };
}
