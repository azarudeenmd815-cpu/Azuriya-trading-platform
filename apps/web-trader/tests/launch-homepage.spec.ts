import { expect, test } from "@playwright/test";

test("launch journeys explain costs and lead to working product pages", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Launch your own brokerage or prop firm.",
  );
  await expect(
    page.getByText("Built to power your trading business.", { exact: true }),
  ).toBeVisible();
  const firstSections = await page
    .locator("main > section")
    .evaluateAll((sections) =>
      sections.slice(0, 5).map((section) => ({
        id: section.id,
        label: section.getAttribute("aria-label"),
        hero: section.classList.contains("az-hero"),
      })),
    );
  expect(firstSections).toEqual([
    { id: "", label: null, hero: true },
    { id: "launch-pricing", label: null, hero: false },
    { id: "revenue", label: null, hero: false },
    { id: "products", label: "Brokerage and prop firm products", hero: false },
    { id: "", label: "Build yourself versus Azuriya", hero: false },
  ]);
  await expect(page.locator("#launch-offer")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Everything you need to launch." }),
  ).toHaveCount(0);
  await expect(page.locator("#launch-pricing .lp-plan")).toHaveCount(3);
  for (const plan of await page.locator("#launch-pricing .lp-plan").all()) {
    await expect(plan.locator(".lp-price strong")).toHaveText("$0");
    await expect(plan.locator(".lp-share strong")).toHaveText("35%");
  }
  await page.locator(".az-products-menu summary").click();
  await page
    .locator(".az-products-menu")
    .getByRole("link", { name: "Azuriya Brokerage" })
    .click();
  await expect(page).toHaveURL(/\/brokerage$/);
  await page.goto("/");
  const propLink = page
    .locator("#products")
    .getByRole("link", { name: "Launch a Prop Firm" });
  await propLink.click();
  await expect(page).toHaveURL(/\/prop-firm$/);
  await page.goto("/");
  const question = page.getByText("Are there monthly minimums or usage fees?", {
    exact: true,
  });
  await question.click();
  await expect(question.locator("..")).toContainText("written schedule");
  await page.locator("#launch-pricing .lp-terms summary").click();
  await expect(page.locator("#launch-pricing .lp-terms")).toContainText(
    "Third-party platform licences",
  );
  await expect(
    page.getByText("100+ integrations.", { exact: true }),
  ).toHaveCount(0);
});

test("launch homepage and navigation fit phone and tablet screens", async ({
  page,
}) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .locator("#mobile-navigation")
      .getByRole("link", { name: "Products" })
      .click();
    await expect(page).toHaveURL(/#products$/);
    await expect(
      page
        .locator("#products")
        .getByRole("heading", { name: "What do you want to launch?" }),
    ).toBeVisible();
    await expect(page.locator("#mobile-navigation")).toHaveCount(0);
  }
});
