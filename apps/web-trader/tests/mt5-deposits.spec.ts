import { expect, test } from "@playwright/test";

test("the landing page introduces direct MT5 deposits and opens the dedicated page", async ({
  page,
}) => {
  await page.goto("/");
  const feature = page.locator("#mt5-deposits");
  await expect(
    feature.getByRole("heading", {
      name: /Deposit directly from MetaTrader 5\./,
    }),
  ).toBeVisible();
  await expect(feature).toContainText(
    "Availability depends on your broker and payment provider.",
  );
  await feature.getByRole("link", { name: "Explore MT5 deposits" }).click();
  await expect(page).toHaveURL(/\/mt5-deposits$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /MetaTrader 5|MT5/,
  );

  await page
    .locator("header")
    .getByRole("link", { name: "Azuriya home" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.locator(".mdh-hero-link").click();
  await expect(page).toHaveURL(/\/mt5-deposits$/);
});

test("MT5 deposits has its own metadata and opens workspace planning without signup links", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/mt5-deposits");
  await expect(page).toHaveTitle(/MT5.*deposit|deposit.*MT5/i);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /deposit.*MetaTrader 5|MetaTrader 5.*deposit/i,
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Deposit directly from MetaTrader 5.",
    }),
  ).toBeVisible();
  await expect(page.locator(".az-header .az-login")).toHaveCount(0);
  await expect(page.locator('a[href*="mode=register"]')).toHaveCount(0);
  await page
    .getByRole("link", { name: "Plan your workspace", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the funding walkthrough explains both methods, lets visitors revisit steps and never submits a payment", async ({
  page,
}) => {
  const paymentRequests: string[] = [];
  await page.goto("/mt5-deposits");
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) {
      paymentRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  const walkthrough = page.locator(".fw-walkthrough");
  const desktop = walkthrough.locator(".fw-desktop");
  const steps = walkthrough.getByRole("group", {
    name: "Funding walkthrough steps",
  });
  await expect(walkthrough.getByText("Illustrative walkthrough")).toBeVisible();
  await expect(walkthrough.getByText("No payment is processed")).toBeVisible();
  await expect(
    steps.getByRole("button", { name: /Choose amount/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(walkthrough.getByText("Example deposit amount")).toBeVisible();

  await walkthrough.getByRole("button", { name: "Next step" }).click();
  const card = walkthrough.getByRole("button", {
    name: "Payment card Provider checkout",
    exact: true,
  });
  const bank = walkthrough.getByRole("button", {
    name: "Bank transfer Where supported",
    exact: true,
  });
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await bank.focus();
  await bank.press("Space");
  await expect(bank).toHaveAttribute("aria-pressed", "true");
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await walkthrough.getByRole("button", { name: "Next step" }).click();
  await expect(
    walkthrough.getByText("Follow your provider’s bank transfer instructions."),
  ).toBeVisible();
  await expect(
    desktop.getByText("1,000.00 USD", { exact: true }),
  ).toBeVisible();

  await steps.getByRole("button", { name: /Select method/ }).click();
  await expect(bank).toHaveAttribute("aria-pressed", "true");
  await card.focus();
  await card.press("Space");
  await steps.getByRole("button", { name: /Provider checkout/ }).click();
  await expect(
    walkthrough.getByText("Enter card details on the provider’s secure page."),
  ).toBeVisible();
  await walkthrough.getByRole("button", { name: "Restart preview" }).click();
  await expect(walkthrough.getByText("Example deposit amount")).toBeVisible();
  await expect(
    steps.getByRole("button", { name: /Choose amount/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(paymentRequests).toEqual([]);
});

test("deposit graphics and all walkthrough steps fit phones, tablets and desktop screens", async ({
  page,
}) => {
  await page.goto("/mt5-deposits");
  const walkthrough = page.locator(".fw-walkthrough");
  const steps = walkthrough.getByRole("group", {
    name: "Funding walkthrough steps",
  });

  for (const width of [320, 390, 768, 1024, 1512]) {
    await page.setViewportSize({ width, height: 982 });
    for (const label of [
      "Choose amount",
      "Select method",
      "Provider checkout",
    ]) {
      await steps.getByRole("button", { name: new RegExp(label) }).click();
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          { message: `${label} fits the ${width}px screen` },
        )
        .toBe(true);
      const graphicBounds = await walkthrough.boundingBox();
      expect(graphicBounds).not.toBeNull();
      for (const button of await walkthrough.getByRole("button").all()) {
        const buttonBounds = await button.boundingBox();
        expect(
          buttonBounds,
          `${label} buttons render at ${width}px`,
        ).not.toBeNull();
        expect(buttonBounds!.x).toBeGreaterThanOrEqual(graphicBounds!.x);
        expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(
          graphicBounds!.x + graphicBounds!.width + 1,
        );
      }
      if (label === "Select method") {
        for (const method of await walkthrough
          .locator(".fw-methods button")
          .all()) {
          const methodBounds = await method.boundingBox();
          const labelBounds = await method.locator("strong").boundingBox();
          expect(methodBounds).not.toBeNull();
          expect(labelBounds).not.toBeNull();
          expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(
            methodBounds!.x + methodBounds!.width,
          );
        }
      }
    }
    const bounds = await walkthrough.boundingBox();
    expect(
      bounds,
      `the funding graphic is present at ${width}px`,
    ).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  }
});

test("mobile navigation returns to landing sections and opens MT5 deposits again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mt5-deposits");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("navigation", {
    name: "Mobile navigation",
  });
  await expect(
    navigation.getByRole("link", { name: "MT5 deposits", exact: true }),
  ).toHaveCount(0);
  await navigation.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page).toHaveURL(/\/#products$/, { timeout: 20_000 });
  await expect(page.locator("#products")).toBeInViewport();
  await expect(navigation).toHaveCount(0);

  await page.locator(".mdh-hero-link").click();
  await expect(page).toHaveURL(/\/mt5-deposits$/);
  await expect(navigation).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 1512, height: 982 });
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Integrations", exact: true })
    .click();
  await expect(page).toHaveURL(/\/#trading-platforms$/);
  await expect(page.locator("#trading-platforms")).toBeInViewport();
});

test("deposit FAQs explain provider availability, fees and the illustrative preview", async ({
  page,
}) => {
  await page.goto("/mt5-deposits");
  const methodsQuestion = page
    .locator("summary")
    .filter({ hasText: "Which payment methods are available?" });
  const methodsAnswer = methodsQuestion.locator("..").locator("p");
  await expect(methodsAnswer).not.toBeVisible();
  await methodsQuestion.click();
  await expect(methodsAnswer).toBeVisible();
  await expect(methodsAnswer).toContainText(/provider/i);
  await expect(methodsAnswer).toContainText(/region|country|configuration/i);
  await methodsQuestion.click();
  await expect(methodsAnswer).not.toBeVisible();

  const feesQuestion = page
    .locator("summary")
    .filter({ hasText: "Can I control payment fees and approvals?" });
  await feesQuestion.click();
  const feesAnswer = feesQuestion.locator("..").locator("p");
  await expect(feesAnswer).toBeVisible();
  await expect(feesAnswer).toContainText(/commission|fee/i);
  await expect(feesAnswer).toContainText(/provider/i);

  const liveQuestion = page
    .locator("summary")
    .filter({ hasText: "Is this a live payment integration?" });
  await liveQuestion.click();
  await expect(liveQuestion.locator("..").locator("p")).toContainText(
    /illustrative|demonstration|preview|example/i,
  );
});

test("the two client reference screens load and their full-size images are accessible", async ({
  page,
}) => {
  await page.goto("/mt5-deposits");
  await page
    .locator("summary")
    .filter({ hasText: "View MT5 reference screens" })
    .click();
  const references = page.locator("[data-mt5-reference]");
  await expect(references).toHaveCount(2);
  expect(
    (
      await references.evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      )
    ).sort(),
  ).toEqual(
    [
      "/marketing/mt5-deposits/desktop-deposit.png",
      "/marketing/mt5-deposits/desktop-mobile-deposit.png",
    ].sort(),
  );

  for (const reference of await references.all()) {
    const image = reference.locator("img");
    await reference.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("alt", /Example native MetaTrader 5/);
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const asset = element as HTMLImageElement;
          return asset.complete && asset.naturalWidth > 0;
        }),
      )
      .toBe(true);
    const href = await reference.getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/^image\//);
  }
  await expect(
    page.getByText(/These screens show native MT5 payment capabilities/),
  ).toBeVisible();
});
