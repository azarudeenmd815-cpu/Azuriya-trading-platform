import { expect, it } from "vitest";
import { aggregateCandles } from "./chart-adapter";
it("aggregates only observed ticks into ordered bid candles", () => {
  const bars = aggregateCandles(
    [
      {
        symbol: "EURUSD",
        bid: "1.10",
        ask: "1.11",
        sequence: 1,
        timestamp: "2026-01-01T00:00:00Z",
      },
      {
        symbol: "EURUSD",
        bid: "1.12",
        ask: "1.13",
        sequence: 2,
        timestamp: "2026-01-01T00:00:02Z",
      },
      {
        symbol: "EURUSD",
        bid: "1.09",
        ask: "1.10",
        sequence: 3,
        timestamp: "2026-01-01T00:00:04Z",
      },
      {
        symbol: "EURUSD",
        bid: "1.11",
        ask: "1.12",
        sequence: 4,
        timestamp: "2026-01-01T00:00:06Z",
      },
    ],
    5,
  );
  expect(bars).toHaveLength(2);
  expect(bars[0]).toMatchObject({
    open: 1.1,
    high: 1.12,
    low: 1.09,
    close: 1.09,
  });
  expect(bars[1]).toMatchObject({
    open: 1.11,
    high: 1.11,
    low: 1.11,
    close: 1.11,
  });
  expect(aggregateCandles([], 60)).toEqual([]);
});
