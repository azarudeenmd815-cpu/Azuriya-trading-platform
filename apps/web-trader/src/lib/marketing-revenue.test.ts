import { describe, expect, it } from "vitest";
import { calculateRevenueExample, formatExampleUsd } from "./marketing-revenue";

describe("illustrative community revenue", () => {
  it("uses markup, rather than the total trader commission, as example revenue", () => {
    expect(calculateRevenueExample("1.00", "10000")).toEqual({
      baseCommission: "2.00",
      markup: "1.00",
      traderCommission: "3.00",
      monthlyRevenue: "10000.00",
      monthlyLots: "10000",
    });
  });

  it("adds the maximum $5 extra markup above the $2 base commission", () => {
    expect(calculateRevenueExample("5.00", "10000")).toEqual({
      baseCommission: "2.00",
      markup: "5.00",
      traderCommission: "7.00",
      monthlyRevenue: "50000.00",
      monthlyLots: "10000",
    });
  });

  it.each([
    ["0.50", "1000", "2.50", "500.00"],
    ["1.50", "12345", "3.50", "18517.50"],
    ["2.00", "50000", "4.00", "100000.00"],
    ["3.00", "12345", "5.00", "37035.00"],
    ["4.00", "1000", "6.00", "4000.00"],
    ["5.00", "50000", "7.00", "250000.00"],
  ])(
    "calculates %s markup on %s lots exactly",
    (markup, lots, total, revenue) => {
      const example = calculateRevenueExample(markup, lots);
      expect(example.traderCommission).toBe(total);
      expect(example.monthlyRevenue).toBe(revenue);
    },
  );

  it.each([
    "-1.00",
    "0.00",
    "0.10",
    "1e2",
    "1",
    "2.50",
    "3.0",
    "5",
    "05.00",
    "5.01",
    "5.50",
    "6.00",
    "NaN",
    "",
  ])("rejects unsupported markup %j", (markup) =>
    expect(() => calculateRevenueExample(markup, "10000")).toThrow(),
  );

  it.each(["0", "999", "50001", "1000.5", "-1000", "1e4", "10000x", ""])(
    "rejects unsupported monthly volume %j",
    (lots) => expect(() => calculateRevenueExample("1.00", lots)).toThrow(),
  );

  it("formats decimal strings without losing significant digits", () => {
    expect(formatExampleUsd("0.50")).toBe("$0.50");
    expect(formatExampleUsd("18517.50")).toBe("$18,517.50");
    expect(formatExampleUsd("9007199254740993.01")).toBe(
      "$9,007,199,254,740,993.01",
    );
    expect(() => formatExampleUsd("NaN")).toThrow();
  });
});
