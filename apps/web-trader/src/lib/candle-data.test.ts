import { expect, it } from "vitest";
import type { Candle } from "@azuriya/api-types";
import { mergeCandles } from "./candle-data";
const candle = (time: string, sequence: number, close = "1.08450"): Candle => ({
  symbol: "EURUSD",
  interval: "1m",
  open_time: time,
  close_time: time,
  open: close,
  high: close,
  low: close,
  close,
  tick_volume: sequence,
  sequence,
  complete: false,
  simulated: true,
});
it("merges REST history and realtime bars without duplicates or replay regression", () => {
  const history = [
    candle("2026-09-01T00:01:00Z", 4),
    candle("2026-09-01T00:00:00Z", 2),
  ];
  const merged = mergeCandles(history, [
    candle("2026-09-01T00:01:00Z", 3, "9"),
    candle("2026-09-01T00:01:00Z", 5, "1.08455"),
  ]);
  expect(merged).toHaveLength(2);
  expect(merged[0].sequence).toBe(2);
  expect(merged[1].close).toBe("1.08455");
});
it("orders and deduplicates equal instants across PostgreSQL and stream time zones", () => {
  const merged = mergeCandles(
    [
      candle("2026-09-30T05:30:00+05:30", 1),
      candle("2026-09-30T05:31:00+05:30", 2),
    ],
    [candle("2026-09-30T00:01:00Z", 3), candle("2026-09-30T00:02:00Z", 4)],
  );
  expect(merged).toHaveLength(3);
  expect(merged.map((c) => c.sequence)).toEqual([1, 3, 4]);
});
