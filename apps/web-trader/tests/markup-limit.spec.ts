import { expect, test } from "@playwright/test";

test("the maximum $5 extra markup keeps the $2 base and displays a $7 total", async ({
  page,
}) => {
  await page.goto("/");
  const calculator = page.getByRole("group", {
    name: "Your commercial model",
    exact: true,
  });
  await expect(
    calculator.getByRole("radio", { name: "$1.00", exact: true }),
  ).toBeChecked();
  const maximum = calculator.getByRole("radio", {
    name: "$5.00",
    exact: true,
  });
  await expect(maximum).toBeEnabled();
  await maximum.focus();
  await maximum.press("Space");
  await expect(maximum).toBeChecked();
  await expect(calculator.locator("output")).toHaveText("$50,000.00");
  await expect(calculator.getByText("Trader pays").locator("..")).toContainText(
    "$7.00",
  );
  await expect(
    calculator.getByText("Base commission", { exact: true }).locator(".."),
  ).toContainText("$2.00");
  await expect(
    calculator.getByText("$5.00 markup × 10,000 lots"),
  ).toBeVisible();
  await expect(
    calculator.getByText("Up to $5.00 extra above the $2.00 base commission."),
  ).toBeVisible();
});

test("calculator waits for its handlers before accepting keyboard input on a slow connection", async ({
  page,
}) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "commit" });
    const calculator = page.getByRole("group", {
      name: "Your commercial model",
      exact: true,
    });
    const maximum = calculator.getByRole("radio", {
      name: "$5.00",
      exact: true,
    });
    await expect(maximum).toBeVisible();
    await expect(maximum).toBeDisabled();
    await expect(calculator.getByRole("slider")).toBeDisabled();
    releaseScripts();
    await expect(maximum).toBeEnabled();
    await expect(calculator.getByRole("slider")).toBeEnabled();
    await maximum.focus();
    await maximum.press("Space");
    await expect(maximum).toBeChecked();
    await expect(calculator.locator("output")).toHaveText("$50,000.00");
  } finally {
    releaseScripts();
  }
});

test("all seven markup choices fit narrow screens and remain keyboard accessible", async ({
  page,
}) => {
  await page.goto("/");
  const calculator = page.getByRole("group", {
    name: "Your commercial model",
    exact: true,
  });
  const choices = calculator.getByRole("group", {
    name: "Your extra markup per lot",
  });
  await expect(choices.getByRole("radio")).toHaveCount(7);

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 982 });
    await choices.scrollIntoViewIfNeeded();
    const groupBounds = await choices.boundingBox();
    expect(groupBounds).not.toBeNull();
    for (const radio of await choices.getByRole("radio").all()) {
      const label = radio.locator("..");
      const bounds = await label.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(groupBounds!.x);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        groupBounds!.x + groupBounds!.width + 1,
      );
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
    }
    const maximum = choices.getByRole("radio", {
      name: "$5.00",
      exact: true,
    });
    await expect(maximum).toBeEnabled();
    await maximum.focus();
    await maximum.press("Space");
    await expect(maximum).toBeChecked();
    await maximum.press("ArrowLeft");
    await expect(
      choices.getByRole("radio", { name: "$4.00", exact: true }),
    ).toBeChecked();
    await expect(calculator.locator("output")).toHaveText("$40,000.00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
