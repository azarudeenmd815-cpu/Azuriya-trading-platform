import { expect, test } from "@playwright/test";

test("desktop navigation reaches integrations and the platform CTA opens the preview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Launch your own brokerage or prop firm.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Built to power your trading business.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#hero-title")).not.toContainText(
    "No development cost.",
  );
  await expect(page.locator(".az-header .az-login")).toHaveCount(0);
  await expect(page.locator('a[href*="mode=register"]')).toHaveCount(0);

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await navigation
    .getByRole("link", { name: "Integrations", exact: true })
    .click();
  await expect(page).toHaveURL(/\/integrations$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your connected world.",
  );
  await page.goto("/");

  await page
    .getByRole("link", { name: "Explore the Platform", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#platform$/);
  await expect(page.locator("#platform")).toBeInViewport();
  expect(errors).toEqual([]);
});

test("brokerage positioning includes the hero illustration, working platform logos and supplied liquidity references", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const routingPromise = page.locator(".ab-routing-banner");
  await expect(routingPromise).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Execution built for serious brokerages.",
    }),
  ).toBeVisible();

  const heroIllustration = page.locator("img[data-hero-illustration]");
  await expect(heroIllustration).toBeVisible();

  const platformLogos = page.locator("#trading-platforms [data-platform-logo]");
  expect(await platformLogos.count()).toBeGreaterThanOrEqual(26);
  const providers = page.locator("#liquidity [data-liquidity-logo]");
  await expect(providers).toHaveCount(23);
  for (const provider of await providers.all()) {
    await provider.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        provider.locator("img").evaluate((element) => {
          const asset = element as HTMLImageElement;
          return asset.complete && asset.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }

  const gallery = page.locator("#infrastructure");
  const originalReferences = gallery.locator(".ig-source-details");
  await expect(originalReferences).not.toHaveAttribute("open", "");
  await originalReferences.locator("summary").click();
  await expect(originalReferences).toHaveAttribute("open", "");
  const references = gallery.locator("[data-liquidity-reference]");
  await expect(references).toHaveCount(7);

  for (const image of [
    heroIllustration,
    ...(await platformLogos.all()),
    gallery
      .getByRole("region", {
        name: "Selected original infrastructure reference",
      })
      .locator("img"),
  ]) {
    expect(await image.getAttribute("src")).toMatch(/^\//);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const asset = element as HTMLImageElement;
          return asset.complete && asset.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }

  for (const reference of await references.all()) {
    const href = await reference.locator("a").getAttribute("href");
    expect(href).toMatch(/^\//);
    const response = await page.request.get(href!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/^image\//);
  }
});

test("dashboard views filter actual demo rows, search accounts and update the chart period", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  const teamFilter = demo.getByLabel("Filter demo by team");

  await views.getByRole("button", { name: /^Teams/ }).click();
  await expect(
    demo.getByRole("button", { name: /Algo Team 85 traders/ }),
  ).toBeVisible();
  await teamFilter.selectOption("Gold Elite");
  await expect(
    demo.getByRole("heading", { name: "Teams", exact: true }),
  ).toBeVisible();
  await expect(
    demo.getByRole("heading", { name: "Gold Elite workspace", exact: true }),
  ).toBeVisible();
  await expect(
    demo
      .getByRole("region", { name: "Team management preview" })
      .getByText("James Carter", { exact: true }),
  ).toHaveCount(0);

  await views.getByRole("button", { name: "Accounts", exact: true }).click();
  const table = demo.getByRole("table");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table).toContainText("Alex Morgan");
  await expect(table).toContainText("James Carter");
  await expect(table).not.toContainText("Ryan Mitchell");

  const search = demo.getByRole("textbox", { name: "Search accounts" });
  await search.fill("92731");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("James Carter");
  await search.fill("no-such-account");
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await expect(
    demo.getByText("No matching accounts. Try another trader or symbol."),
  ).toBeVisible();
  await search.clear();
  await teamFilter.selectOption("All teams");
  await expect(table.locator("tbody tr")).toHaveCount(4);

  await views.getByRole("button", { name: "Analytics", exact: true }).click();
  await demo.getByRole("button", { name: "1W", exact: true }).click();
  await expect(
    demo.getByRole("button", { name: "1W", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    demo.getByRole("img", {
      name: "Illustrative community volume trend for 1W",
    }),
  ).toBeVisible();
  await expect(demo.locator(".az-stat")).toHaveCount(0);
  const weekChartPath = await demo
    .getByRole("img", { name: "Illustrative community volume trend for 1W" })
    .locator("path")
    .last()
    .getAttribute("d");
  await demo.getByRole("button", { name: "3M", exact: true }).click();
  await expect(
    demo.getByRole("img", {
      name: "Illustrative community volume trend for 3M",
    }),
  ).toBeVisible();
  await expect(
    demo
      .getByRole("img", { name: "Illustrative community volume trend for 3M" })
      .locator("path")
      .last(),
  ).not.toHaveAttribute("d", weekChartPath!);

  await views
    .getByRole("button", { name: "Risk controls", exact: true })
    .click();
  await teamFilter.selectOption("FX Intraday");
  await expect(
    demo.getByRole("heading", { name: "Account group risk policy" }),
  ).toBeVisible();
  await expect(
    demo.getByText("Allowed instruments").locator(".."),
  ).toContainText("EURUSD");
  await expect(
    demo.getByText("Allowed instruments").locator(".."),
  ).not.toContainText("XAUUSD");
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(demo.getByText("JAMES-FX-01", { exact: false })).toBeVisible();
  await expect(
    demo.locator(".az-engine").getByText("James Carter", { exact: false }),
  ).toBeVisible();
  await expect(
    demo.locator(".az-engine").getByText("Alex Morgan", { exact: false }),
  ).toHaveCount(0);
});

test("an Accounts search does not hide positions after returning to Overview", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views.getByRole("button", { name: "Accounts", exact: true }).click();
  await demo
    .getByRole("textbox", { name: "Search accounts" })
    .fill("missing-account");
  await expect(demo.getByRole("table").locator("tbody tr")).toHaveCount(0);
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    demo.getByRole("table", { name: "Open positions" }).locator("tbody tr"),
  ).toHaveCount(4);
  await expect(
    demo.getByRole("table", { name: "Open positions" }),
  ).toContainText("Alex Morgan");
  await expect(
    demo.getByText("No matching accounts. Try another trader or symbol."),
  ).toHaveCount(0);
});

test("copy engine pause state persists across views while the standalone preview stays independent", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  const copyPreview = page.locator("#copy-trading");

  await demo.getByRole("button", { name: "Pause demo engine" }).click();
  await expect(demo.getByText("Paused", { exact: true })).toBeVisible();
  await views
    .getByRole("button", { name: "Copy trading", exact: true })
    .click();
  await expect(demo.getByText("Paused", { exact: true })).toHaveCount(4);
  await expect(copyPreview.getByText("Synced", { exact: true })).toHaveCount(3);
  await demo.getByRole("button", { name: "Resume demonstration" }).click();
  await expect(demo.getByText("Running", { exact: true })).toHaveCount(4);
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    demo.getByRole("button", { name: "Pause demo engine" }),
  ).toBeVisible();

  await copyPreview
    .getByRole("button", { name: "FX Intraday", exact: true })
    .click();
  await expect(
    copyPreview.getByText("JAMES-FX-01", { exact: true }),
  ).toBeVisible();
  await expect(
    copyPreview.getByText("184 example accounts synchronized"),
  ).toBeVisible();
  await copyPreview.getByRole("button", { name: "Pause copy preview" }).click();
  await expect(copyPreview.getByText("Paused", { exact: true })).toHaveCount(3);
  await expect(
    copyPreview.getByText("Preview paused. No real accounts are connected."),
  ).toBeVisible();
  await expect(demo.getByText("Running", { exact: true })).toBeVisible();
  await copyPreview
    .getByRole("button", { name: "Resume copy preview" })
    .click();
  await expect(copyPreview.getByText("Synced", { exact: true })).toHaveCount(3);
  await expect(
    copyPreview.getByText("184 example accounts synchronized"),
  ).toBeVisible();
});

test("calculator updates exact revenue through markup and keyboard volume controls", async ({
  page,
}) => {
  await page.goto("/");
  const calculator = page.locator("#revenue");
  const result = calculator.locator("output");
  await expect(result).toHaveText("$10,000.00");

  const markup = calculator.getByRole("radio", { name: "$1.50", exact: true });
  await expect(markup).toBeEnabled();
  await markup.focus();
  await markup.press("Space");
  await expect(markup).toBeChecked();
  await expect(result).toHaveText("$15,000.00");
  await expect(calculator.getByText("Trader pays").locator("..")).toContainText(
    "$3.50",
  );

  const volume = calculator.getByRole("slider", {
    name: "Monthly trading volume",
  });
  await volume.focus();
  await volume.press("Home");
  await expect(volume).toHaveValue("1000");
  await expect(result).toHaveText("$1,500.00");
  await volume.press("ArrowRight");
  await expect(volume).toHaveValue("2000");
  await expect(result).toHaveText("$3,000.00");
  await volume.press("End");
  await expect(volume).toHaveValue("50000");
  await expect(result).toHaveText("$75,000.00");
  await expect(
    calculator.getByText("$1.50 markup × 50,000 lots"),
  ).toBeVisible();
});

test("FAQ disclosure reveals and hides its answer", async ({ page }) => {
  await page.goto("/");
  const faq = page.locator("#questions");
  const question = faq
    .locator("summary")
    .filter({ hasText: "Are the trades and performance figures live?" });
  const answer = question.locator("..").locator("p");
  await expect(answer).not.toBeVisible();
  await question.click();
  await expect(answer).toBeVisible();
  await expect(answer).toContainText("No real money is traded");
  await question.click();
  await expect(answer).not.toBeVisible();
});

test("mobile layout has no page overflow and navigation closes after choosing a section", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
  });
  await expect(navigation).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toHaveAttribute("aria-expanded", "true");
  await navigation
    .getByRole("link", { name: "Integrations", exact: true })
    .click();
  await expect(page).toHaveURL(/\/integrations$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your connected world.",
  );
  await expect(navigation).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mobile navigation keeps every destination reachable in short landscape screens", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript((value) => {
      localStorage.setItem("azuriya.marketing-theme", value);
    }, theme);
    for (const viewport of [
      { width: 667, height: 375 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByRole("button", { name: "Open navigation" }).click();
      const navigation = page.getByRole("navigation", {
        name: "Mobile navigation",
      });
      const bounds = await navigation.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      const lastDestination = navigation.getByRole("link").last();
      const destination = await lastDestination.getAttribute("href");
      await lastDestination.click();
      await expect(navigation).toHaveCount(0);
      await expect(page).toHaveURL(
        new RegExp(`${destination!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      );
    }
  }
});

test("product graphics, logos and financial labels fit small phones, tablets and desktop screens", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 768, 1024, 1512]) {
    await page.setViewportSize({ width, height: 982 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("img[data-hero-illustration]")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);

    for (const id of [
      "liquidity",
      "trading-platforms",
      "communities",
      "revenue",
      "risk",
    ]) {
      const bounds = await page.locator(`#${id}`).boundingBox();
      expect(bounds, `${id} is present at ${width}px`).not.toBeNull();
      expect(
        bounds!.x,
        `${id} starts inside the ${width}px screen`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        bounds!.x + bounds!.width,
        `${id} fits the ${width}px screen`,
      ).toBeLessThanOrEqual(width + 1);
    }

    const balanceLabels = await page
      .locator(".pd-account-balances strong")
      .evaluateAll((labels) =>
        labels.map((label) => {
          const range = document.createRange();
          range.selectNodeContents(label);
          const text = range.getBoundingClientRect();
          const column = label.parentElement!.getBoundingClientRect();
          return {
            left: text.left,
            right: text.right,
            columnLeft: column.left,
            columnRight: column.right,
          };
        }),
      );
    for (const label of balanceLabels) {
      expect(
        label.left,
        `balance starts in its column at ${width}px`,
      ).toBeGreaterThanOrEqual(label.columnLeft - 1);
      expect(
        label.right,
        `balance is readable without clipping at ${width}px`,
      ).toBeLessThanOrEqual(label.columnRight + 1);
    }
  }
});
