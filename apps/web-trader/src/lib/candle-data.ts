import type { Candle } from "@azuriya/api-types";
/** Reconnect/history merge keeps one canonical newest version of each candle. */
export function mergeCandles(history: Candle[], updates: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of [...history, ...updates]) {
    const timestamp = Date.parse(candle.open_time);
    const previous = byTime.get(timestamp);
    if (!previous || candle.sequence >= previous.sequence)
      byTime.set(timestamp, candle);
  }
  return [...byTime.values()].sort(
    (a, b) => Date.parse(a.open_time) - Date.parse(b.open_time),
  );
}
