import { beforeEach, expect, it } from "vitest";
import { useTerminal } from "./store";
beforeEach(() => useTerminal.getState().reset());
it("ignores replayed quotes and keeps independent symbol histories", () => {
  const ingest = useTerminal.getState().ingest;
  ingest({
    symbol: "EURUSD",
    bid: "1.1",
    ask: "1.2",
    sequence: 2,
    timestamp: "2026-01-01T00:00:00Z",
  });
  ingest({
    symbol: "EURUSD",
    bid: "9.1",
    ask: "9.2",
    sequence: 1,
    timestamp: "2026-01-01T00:00:00Z",
  });
  ingest({
    symbol: "GBPUSD",
    bid: "1.3",
    ask: "1.4",
    sequence: 1,
    timestamp: "2026-01-01T00:00:00Z",
  });
  expect(useTerminal.getState().quotes.EURUSD.bid).toBe("1.1");
  expect(useTerminal.getState().history.EURUSD).toHaveLength(1);
  expect(useTerminal.getState().history.GBPUSD).toHaveLength(1);
});
