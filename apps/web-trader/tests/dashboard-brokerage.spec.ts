import { expect, test, type Page } from "@playwright/test";

async function openBrokerage(page: Page) {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Brokerage", exact: true })
    .click();
  return page.getByRole("region", { name: "Brokerage controls preview" });
}

test("routing zone, technical controls and exact commission profile appear in the draft review", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") requests.push(request.url());
  });
  const brokerage = await openBrokerage(page);
  const route = brokerage.getByRole("article", {
    name: "External A-book route",
  });
  await expect(route).toContainText("Luramic");
  await brokerage
    .getByRole("combobox", { name: "Brokerage routing zone" })
    .selectOption("Amsterdam AMS");
  await expect(route).toContainText("NL · Amsterdam AMS");
  await expect(route.locator(".db-provider-0")).toContainText("GBE Prime");
  await brokerage
    .getByRole("combobox", { name: /^Aggregation strategy/ })
    .selectOption("Weighted market depth");
  await expect(route.locator(".db-engine-node")).toContainText(
    "Weighted market depth",
  );
  await brokerage
    .getByRole("combobox", { name: /^Provider timeout/ })
    .selectOption("2,000 ms");

  await brokerage.getByRole("tab", { name: /Symbols & pricing/ }).click();
  await brokerage
    .getByRole("combobox", { name: /^Lot commission profile/ })
    .selectOption("$2.00 base + $5.00 extra");
  await brokerage
    .getByRole("combobox", { name: /^Minimum order volume/ })
    .selectOption("0.10 lot");
  await brokerage.getByRole("tab", { name: /Server & accounts/ }).click();
  await brokerage
    .getByRole("combobox", { name: /^Position accounting/ })
    .selectOption("Netting accounts");
  await brokerage
    .getByRole("combobox", { name: /^Group leverage/ })
    .selectOption("1:50");
  await brokerage.getByRole("tab", { name: /Monitoring/ }).click();
  await brokerage
    .getByRole("combobox", { name: /^Reconciliation schedule/ })
    .selectOption("Every 4 hours");
  await brokerage.getByRole("button", { name: "Review configuration" }).click();

  const review = brokerage.getByRole("region", {
    name: "Brokerage configuration review",
  });
  for (const text of [
    "Amsterdam AMS",
    "GBE Prime / FxGrow / CMS Prime",
    "Weighted market depth",
    "2,000 ms",
    "$2.00 base + $5.00 extra",
    "0.10 lot",
    "Netting accounts",
    "1:50",
    "Every 4 hours",
    "Required ownership, order validation, margin and risk checks remain enforced.",
  ]) {
    await expect(review).toContainText(text);
  }
  await expect(review.locator("dl > div")).toHaveCount(30);
  await expect(brokerage.getByRole("checkbox")).toHaveCount(0);
  await expect(brokerage).toContainText("Preview only · no server changes");
  expect(requests).toEqual([]);
});

test("depth symbol and execution trace filter update the actual visible data", async ({
  page,
}) => {
  const brokerage = await openBrokerage(page);
  await expect(
    brokerage.getByRole("img", {
      name: "EURUSD illustrative four-level bid and ask market depth",
    }),
  ).toBeVisible();
  await brokerage
    .getByRole("combobox", { name: "Market depth symbol" })
    .selectOption("XAUUSD");
  const depth = brokerage.getByRole("img", {
    name: "XAUUSD illustrative four-level bid and ask market depth",
  });
  await expect(depth).toContainText("2,643.120");
  await expect(depth).not.toContainText("1.07825");
  const table = brokerage.getByRole("table");
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await brokerage
    .getByRole("combobox", { name: "Execution trace filter" })
    .selectOption("Risk review");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("EX-10480");
  await expect(table).toContainText("Awaiting validation");
  await brokerage
    .getByRole("combobox", { name: "Execution trace filter" })
    .selectOption("Routed");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table).not.toContainText("EX-10480");
});

test("technical categories support keyboard use and the mobile layout honors reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const brokerage = await openBrokerage(page);
  const execution = brokerage.getByRole("tab", { name: /Execution/ });
  await execution.focus();
  await page.keyboard.press("ArrowRight");
  const pricing = brokerage.getByRole("tab", { name: /Symbols & pricing/ });
  await expect(pricing).toBeFocused();
  await expect(pricing).toHaveAttribute("aria-selected", "true");
  await expect(
    brokerage.getByRole("combobox", { name: /^Lot commission profile/ }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    brokerage.getByRole("tab", { name: /Server & accounts/ }),
  ).toBeFocused();
  await expect(
    brokerage.getByRole("combobox", { name: /^Stop-out threshold/ }),
  ).toBeVisible();
  await expect(brokerage.locator(".db-tracks-mobile")).toBeVisible();
  await expect(brokerage.locator(".db-tracks-desktop")).not.toBeVisible();
  for (const packet of await brokerage
    .locator(".db-tracks-mobile [data-flow-track]")
    .all()) {
    await expect(packet).toHaveCSS("animation-name", "none");
    await expect(packet).toHaveCSS("display", "none");
  }
  const layout = await brokerage.evaluate((element) => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    targets: Array.from(element.querySelectorAll("select, button")).map(
      (control) => control.getBoundingClientRect().height,
    ),
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.targets.every((height) => height >= 44)).toBe(true);
});
