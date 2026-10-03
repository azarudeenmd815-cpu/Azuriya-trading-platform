import { describe, expect, it } from "vitest";
import {
  compareDecimals,
  formatDecimal,
  isPositiveDecimal,
  spreadPoints,
} from "./decimal-display";
describe("exact decimal presentation", () => {
  it("preserves large financial values and rounds without binary floating point", () => {
    expect(formatDecimal("9007199254740993.125")).toBe(
      "9,007,199,254,740,993.13",
    );
    expect(formatDecimal("-0.004")).toBe("0.00");
    expect(formatDecimal("1.08452", 5, false)).toBe("1.08452");
    expect(formatDecimal("9.999", 2)).toBe("10.00");
  });
  it("rejects malformed/zero quantities before submit", () => {
    for (const value of ["0", "0.0", "1e3", "-1", "NaN", "", "0x10"])
      expect(isPositiveDecimal(value)).toBe(false);
    expect(isPositiveDecimal("0.01")).toBe(true);
  });
  it("compares differently scaled decimals exactly", () => {
    expect(compareDecimals("1.00001", "1")).toBe(1);
    expect(compareDecimals("1.0", "1.00")).toBe(0);
    expect(compareDecimals("-12.4", "-1.000")).toBe(-1);
  });
  it("displays spread in points exactly", () =>
    expect(spreadPoints("1.08452", "1.08465", 5)).toBe("13"));
});
