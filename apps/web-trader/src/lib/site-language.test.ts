import { describe, expect, it } from "vitest";
import {
  isSiteLanguage,
  siteLanguageFromHints,
  siteLanguages,
} from "./site-language";

describe("visitor language suggestions", () => {
  it("offers ten language choices including Portuguese", () => {
    expect(siteLanguages).toHaveLength(10);
    expect(siteLanguages.map(({ code }) => code)).toContain("pt");
  });

  it("uses country as the first suggestion when a supported country is known", () => {
    expect(siteLanguageFromHints("BR", "en-US,en;q=0.9")).toEqual({
      locale: "pt",
      source: "country",
    });
    expect(siteLanguageFromHints("BD", "en-US,en;q=0.9").locale).toBe("bn");
  });

  it("falls back to the best supported browser language, then English", () => {
    expect(siteLanguageFromHints("US", "en-US,pt-BR;q=0.9")).toEqual({
      locale: "en",
      source: "browser",
    });
    expect(siteLanguageFromHints("ZZ", "pt-BR,pt;q=0.9")).toEqual({
      locale: "pt",
      source: "browser",
    });
    expect(siteLanguageFromHints(null, "it-IT,it;q=0.9")).toEqual({
      locale: "en",
      source: "default",
    });
  });

  it("validates locale values before applying them", () => {
    expect(isSiteLanguage("pt")).toBe(true);
    expect(isSiteLanguage("pt-BR")).toBe(false);
    expect(isSiteLanguage("xx")).toBe(false);
  });
});
