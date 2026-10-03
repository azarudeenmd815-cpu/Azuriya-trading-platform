import { describe, expect, it } from "vitest";
import { createProfile, validatePolicy, profileCommand } from "./profile-schema";
describe("typed broker policy drafts", () => {
  it("preserves exact financial strings and excludes unrelated policy payloads", () => {
    const profile = createProfile("PRICING");
    profile.pricing!.ask_markup = "0.00000000000000000001";
    const command = profileCommand(profile, "Review pricing", true);
    expect(command.pricing?.ask_markup).toBe("0.00000000000000000001");
    expect(command).not.toHaveProperty("commission");
    expect(command).not.toHaveProperty("id");
    expect(command.reason).toBe("Review pricing");
  });
  it("rejects numeric and exponent financial input without converting a draft", () => {
    expect(validatePolicy("PRICING", { unit: "PRICE", bid_markup: "1e-5", ask_markup: 0.1, minimum_spread: "0", maximum_spread: "0" })).toHaveProperty("bid_markup");
    expect(validatePolicy("PRICING", { unit: "PRICE", bid_markup: "0", ask_markup: 0.1, minimum_spread: "0", maximum_spread: "0" })).toHaveProperty("ask_markup");
  });
  it("retains signed swap rates and validates rollover fields", () => {
    const profile = createProfile("SWAP");
    profile.swap!.long_rate = "-4.125000";
    expect(validatePolicy("SWAP", profile.swap!)).toEqual({});
    expect(profileCommand(profile, "Financing", true).swap?.long_rate).toBe("-4.125000");
    profile.swap!.rollover_time = "25:01";
    expect(validatePolicy("SWAP", profile.swap!)).toHaveProperty("rollover_time");
  });
  it("retains revision for edits and checks typed symbol overrides", () => {
    const profile = createProfile("COMMISSION");
    profile.revision = 9;
    expect(profileCommand(profile, "Update", false).revision).toBe(9);
    expect(validatePolicy("COMMISSION", { mode: "NONE", amount: "1", currency: "USD" })).toHaveProperty("amount");
  });
});
