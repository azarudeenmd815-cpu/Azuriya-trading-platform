import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ecosystemCatalog,
  ecosystemCategories,
  ecosystemCategoryCounts,
  ecosystemCount,
  filterEcosystem,
} from "./ecosystem-catalog";

describe("sourced ecosystem catalog", () => {
  it("counts distinct products and gives every entry a real source and category", () => {
    expect(ecosystemCount).toBeGreaterThanOrEqual(500);
    expect(new Set(ecosystemCatalog.map((item) => item.id)).size).toBe(
      ecosystemCount,
    );
    expect(
      new Set(ecosystemCatalog.map((item) => item.name.toLowerCase())).size,
    ).toBe(ecosystemCount);
    const categories = new Set(ecosystemCategories.map((item) => item.id));
    for (const item of ecosystemCatalog) {
      expect(categories.has(item.category), item.name).toBe(true);
      expect(new URL(item.href).protocol, item.name).toBe("https:");
      expect(new URL(item.source).protocol, item.name).toBe("https:");
      expect(item.status, item.name).toBe("Integration on request");
      if (item.logo)
        expect(
          existsSync(resolve(process.cwd(), "public", item.logo.slice(1))),
          item.logo,
        ).toBe(true);
    }
    expect(
      Object.values(ecosystemCategoryCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(ecosystemCount);
  });

  it("finds products independent of case and combines category and search", () => {
    expect(filterEcosystem("metaTRADER").map((item) => item.name)).toEqual([
      "MetaTrader 4",
      "MetaTrader 5",
    ]);
    expect(filterEcosystem("Zapier", "automation")).toHaveLength(1);
    expect(filterEcosystem("Zapier", "trading-platforms")).toHaveLength(0);
    expect(filterEcosystem("not-an-existing-tool-azuriya")).toHaveLength(0);
  });
});
