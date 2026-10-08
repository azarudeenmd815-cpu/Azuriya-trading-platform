import { describe, expect, it } from "vitest";
import {
  addDecimalAmounts,
  formatOfferMoney,
  launchOffer,
  leverateReference,
  revenueShareExample,
} from "./launch-offer";

describe("published launch offer", () => {
  it("keeps the recurring fee and revenue share together", () => {
    expect(launchOffer.monthlyFee).toBe("0.00");
    expect(launchOffer.revenueSharePercent).toBe(35);
    expect(launchOffer.totalSlots - launchOffer.allocatedSlots).toBe(3);
  });

  it("tallies the referenced platform and CRM subscriptions exactly", () => {
    expect(addDecimalAmounts("1490.00", "2000.00")).toBe("3490.00");
    expect(addDecimalAmounts("2990.00", "3490.00")).toBe("6480.00");
    expect(leverateReference.map((plan) => plan.total)).toEqual([
      "3490.00",
      "6480.00",
    ]);
    expect(formatOfferMoney("6480.00", "€")).toBe("€6,480.00");
  });

  it("calculates the agreed share with integer cents and rejects invalid amounts", () => {
    expect(revenueShareExample("10000.00")).toEqual({
      revenue: "10000.00",
      azuriyaShare: "3500.00",
      businessShare: "6500.00",
    });
    expect(revenueShareExample("0.01").azuriyaShare).toBe("0.00");
    expect(() => addDecimalAmounts("-1.00", "2.00")).toThrow();
  });
});
