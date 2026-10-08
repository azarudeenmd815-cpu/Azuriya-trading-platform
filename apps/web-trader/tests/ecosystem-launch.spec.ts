import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const ecosystemCount = JSON.parse(
  readFileSync(
    new URL("../src/lib/ecosystem-catalog.json", import.meta.url),
    "utf8",
  ),
).length;

test("ecosystem directory searches, filters, expands categories and handles no matches", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/integrations");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your connected world.",
  );
  await expect(page.locator(".ec-hero-count strong")).toHaveText(
    String(ecosystemCount),
  );
  const search = page.getByRole("searchbox", {
    name: "Search platforms and tools",
  });
  await search.fill("metatrader");
  await expect(page.locator(".ec-card")).toHaveCount(2);
  await expect(page.locator(".ec-result-count")).toContainText("2 results");
  await search.fill("no-such-platform-azuriya");
  await expect(
    page.getByRole("heading", { name: "No matches yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset search" }).click();
  await page
    .getByRole("navigation", { name: "Platform categories" })
    .getByRole("button", { name: /Automation tools/ })
    .click();
  await expect(
    page.getByRole("link", { name: "Explore Zapier (opens in a new tab)" }),
  ).toBeVisible();
  await page.goto("/integrations?category=data-analytics");
  await expect(
    page
      .getByRole("navigation", { name: "Platform categories" })
      .getByRole("button", { name: /Data & analytics/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ec-card")).toHaveCount(48);
  await page.getByRole("button", { name: "View more results" }).click();
  await expect(page.locator(".ec-card")).toHaveCount(96);
  expect(errors).toEqual([]);
});

test("pricing cards tally the platform and CRM reference beside the zero subscription and revenue share", async ({
  page,
}) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "$0 per month.",
  );
  await expect(page.locator(".lp-plan")).toHaveCount(3);
  const references = [
    ["€1,490", "€2,000", "€3,490"],
    ["€2,990", "€3,490", "€6,480"],
    ["Custom", "Custom", "Custom quote"],
  ];
  let index = 0;
  for (const plan of await page.locator(".lp-plan").all()) {
    await expect(plan.locator(".lp-price strong")).toHaveText("$0");
    await expect(plan.locator(".lp-share strong")).toHaveText("35%");
    const reference = plan.locator(".lp-price-reference");
    await expect(reference.locator("dt")).toHaveText([
      "Trading platform",
      "CRM & client portal",
      "Combined / month",
    ]);
    await expect(reference.locator("dd")).toHaveText(references[index]);
    if (index < 2) {
      await expect(reference.locator(".lp-reference-total s")).toHaveText(
        references[index][2],
      );
    }
    for (const group of [
      "Trading platform",
      "CRM & client portal",
      "Scope & support",
    ]) {
      await expect(
        plan
          .locator(".lp-feature-group")
          .filter({
            has: page.getByRole("heading", { name: group, exact: true }),
          })
          .locator("dl > div"),
      ).not.toHaveCount(0);
    }
    await expect(plan.locator(".lp-feature-group dt")).toContainText([
      "Real trading accounts",
      "Funding & payment workflows",
      "Platform APIs & connectors",
      "CRM & client portal",
      "VoIP, SMS & email connections",
      "Operational workflows",
      "CRM seats & team access",
      "Roles & agent permissions",
      "IB & referral workflows",
      "API & data access",
    ]);
    index += 1;
  }
  await expect(page.locator(".lp-allocation progress")).toHaveAttribute(
    "value",
    "97",
  );
  await expect(page.locator(".lp-allocation-copy")).toContainText(
    "3 slots remaining",
  );
  await expect(page.locator(".lp-reference-note")).toContainText(
    "comparison prices, not previous Azuriya charges",
  );
  await page.locator(".lp-terms summary").click();
  await page.getByRole("link", { name: "Read the launch-offer terms" }).click();
  await expect(page).toHaveURL(/\/legal\/terms#launch-offer$/);
  await expect(page.locator("#launch-offer")).toContainText(
    "35% share of eligible business revenue",
  );
});

test("new sections and directory fit phones, tablets and desktops in both themes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["dark", "light"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("azuriya.marketing-theme", value),
      theme,
    );
    for (const width of [320, 390, 768, 1024, 1512]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        "/",
        "/integrations?category=automation",
        "/pricing",
      ]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        if (route === "/") {
          for (const selector of [
            "#azuriya-core",
            "#ecosystem",
            "#automation",
            "#launch-pricing",
            ".az-globe-cta",
          ]) {
            const section = page.locator(selector);
            await section.scrollIntoViewIfNeeded();
            const bounds = await section.boundingBox();
            expect(bounds).not.toBeNull();
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
          }
          await expect(page.locator(".az-launch-globe")).toHaveAttribute(
            "data-globe-state",
            "static",
          );
          await expect(page.locator(".az-launch-globe iframe")).toHaveCount(0);
        }
      }
    }
  }
});
