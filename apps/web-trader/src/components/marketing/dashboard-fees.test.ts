import { describe, expect, it } from "vitest";
import {
  demoAggregateCommission,
  demoAggregateVolume,
  demoCommission,
  demoTotalCommission,
} from "./dashboard-fees";

describe("illustrative dashboard fees", () => {
  it("adds the extra markup to the base fee", () => {
    expect(demoTotalCommission("5.00")).toBe("$7.00");
    expect(demoTotalCommission("0.50")).toBe("$2.50");
  });

  it("formats decimal cents without losing them when multiplying volume", () => {
    expect(demoCommission("628", "1.50")).toBe("$942.00");
    expect(demoCommission("14,292", "5.00")).toBe("$71,460.00");
  });

  it("keeps volumes beyond the safe integer range exact", () => {
    expect(demoCommission("9007199254740993", "1.50")).toBe(
      "$13,510,798,882,111,489.50",
    );
  });

  it("aggregates differing group rates without applying one group rate to all accounts", () => {
    expect(
      demoAggregateCommission([
        { lots: "8,920", markup: "5.00" },
        { lots: "3,284", markup: "5.00" },
        { lots: "1,460", markup: "5.00" },
        { lots: "628", markup: "1.50" },
      ]),
    ).toBe("$69,262.00");
    expect(demoAggregateVolume(["8,920", "3,284", "1,460", "628"])).toBe(
      "14,292",
    );
  });
});
