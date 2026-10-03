import { expect, it } from "vitest";
import { EventDeduplicator, quoteEventForAccount } from "./realtime-events";
it("ignores exact replays while allowing sequence gaps and candles in distinct intervals", () => {
  const tracker = new EventDeduplicator();
  const event = {
    type: "candle.updated",
    sequence: 10,
    timestamp: "",
    payload: { symbol: "EURUSD", interval: "1m", open_time: "2026-01-01" },
  };
  expect(tracker.accept(event)).toBe(true);
  expect(tracker.accept(event)).toBe(false);
  expect(
    tracker.accept({ ...event, payload: { ...event.payload, interval: "5m" } }),
  ).toBe(true);
  expect(tracker.accept({ ...event, sequence: 99 })).toBe(true);
});
it("keeps account-priced quotes isolated and accepts matching deltas", () => {
  const event = {
    type: "quote.updated",
    sequence: 10,
    timestamp: "",
    payload: { symbol: "EURUSD" },
  };
  expect(quoteEventForAccount(event, "raw")).toBe(false);
  expect(
    quoteEventForAccount({ ...event, account_id: "standard" }, "raw"),
  ).toBe(false);
  expect(quoteEventForAccount({ ...event, account_id: "raw" }, "raw")).toBe(
    true,
  );
  expect(quoteEventForAccount(event, "")).toBe(true);
  const tracker = new EventDeduplicator();
  expect(tracker.accept({ ...event, account_id: "raw" })).toBe(true);
  expect(tracker.accept({ ...event, account_id: "standard" })).toBe(true);
});
