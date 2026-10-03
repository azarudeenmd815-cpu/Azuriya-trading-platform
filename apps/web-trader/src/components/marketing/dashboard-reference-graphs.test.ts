import { describe, expect, it } from "vitest";
import { communityVolumeSamples } from "./dashboard-reference-graphs";

describe("illustrative community-volume graph fixtures", () => {
  it("reconciles six current intervals with the displayed team and period total", () => {
    for (const periods of Object.values(communityVolumeSamples)) {
      for (const sample of Object.values(periods)) {
        expect(sample.current.length).toBe(6);
        expect(sample.comparison.length).toBe(6);
        expect(
          sample.current.reduce(
            (sum: bigint, lots: string) => sum + BigInt(lots),
            0n,
          ),
        ).toBe(BigInt(sample.total.replaceAll(",", "")));
        for (const [index, lots] of sample.current.entries()) {
          expect(BigInt(lots)).toBeGreaterThan(0n);
          expect(BigInt(sample.comparison[index])).toBeGreaterThanOrEqual(
            BigInt(lots),
          );
          expect(BigInt(sample.comparison[index])).toBeLessThanOrEqual(
            BigInt(sample.maximum),
          );
        }
      }
    }
  });

  it("reconciles aggregate current and comparison intervals to all four teams", () => {
    for (const period of ["1W", "1M", "3M"] as const) {
      const aggregate = communityVolumeSamples["All teams"][period];
      for (let index = 0; index < 6; index++) {
        for (const series of ["current", "comparison"] as const) {
          const total = [
            "Gold Elite",
            "FX Intraday",
            "Scalping Pro",
            "Algo Team",
          ].reduce(
            (sum, team) =>
              sum +
              BigInt(
                communityVolumeSamples[
                  team as keyof typeof communityVolumeSamples
                ][period][series][index],
              ),
            0n,
          );
          expect(total).toBe(BigInt(aggregate[series][index]));
        }
      }
    }
  });
});
