import { describe, expect, it } from "vitest";
import { journalFixtures, journalTrades } from "./dashboard-trading-journal";

function cents(decimal: string) {
  return BigInt(decimal.replace(".", ""));
}

function priceUnits(decimal: string) {
  const [integer, fraction = ""] = decimal.split(".");
  return BigInt(integer) * 100000n + BigInt(fraction.padEnd(5, "0"));
}

describe("illustrative trading-journal fixtures", () => {
  it("reconciles every team and period summary to its closed-trade rows and chart", () => {
    for (const [team, periods] of Object.entries(journalFixtures)) {
      for (const fixture of Object.values(periods)) {
        const trades = journalTrades.filter((trade) =>
          (fixture.tradeIds as readonly string[]).includes(trade.id),
        );
        expect(trades.length).toBe(fixture.tradeIds.length);
        expect(new Set(fixture.tradeIds).size).toBe(fixture.tradeIds.length);
        expect(
          trades.every((trade) => team === "All teams" || trade.team === team),
        ).toBe(true);
        const amounts = trades.map((trade) => cents(trade.realizedPnl));
        const sum = amounts.reduce((total, value) => total + value, 0n);
        expect(cents(fixture.netPnl)).toBe(sum);
        expect(fixture.wins).toBe(amounts.filter((value) => value > 0n).length);
        expect(fixture.losses).toBe(
          amounts.filter((value) => value < 0n).length,
        );
        expect(fixture.wins + fixture.losses).toBe(trades.length);
        expect(cents(fixture.best)).toBe(
          amounts.reduce((best, value) => (value > best ? value : best)),
        );
        expect(cents(fixture.worst)).toBe(
          amounts.reduce((worst, value) => (value < worst ? value : worst)),
        );
        expect(fixture.chart.cumulative.length).toBe(trades.length + 1);
        let cumulative = 0n;
        expect(cents(fixture.chart.cumulative[0])).toBe(0n);
        amounts.forEach((amount, index) => {
          cumulative += amount;
          expect(cents(fixture.chart.cumulative[index + 1])).toBe(cumulative);
        });
      }
    }
  });

  it("keeps illustrative USD profit consistent with entry, exit, side, volume and contract size", () => {
    for (const trade of journalTrades) {
      const contractUnits = trade.symbol === "XAUUSD" ? 100n : 100000n;
      const priceDifference =
        priceUnits(trade.exitPrice) - priceUnits(trade.entryPrice);
      const direction = trade.side === "Buy" ? 1n : -1n;
      const expected =
        (priceDifference * cents(trade.lot) * contractUnits * direction) /
        100000n;
      expect(cents(trade.realizedPnl)).toBe(expected);
    }
  });
});
