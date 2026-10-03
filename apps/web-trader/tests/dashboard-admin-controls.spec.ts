import { expect, test, type Page } from "@playwright/test";

async function openAdmin(page: Page) {
  await page.goto("/#platform");
  const demo = page.locator("#platform");
  await demo
    .getByRole("navigation", { name: "Demo dashboard views" })
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  return demo.getByRole("region", {
    name: "Admin portal configuration preview",
  });
}

test("admin preview shows role-specific capabilities and concrete configuration diffs without applying settings", async ({
  page,
}) => {
  const admin = await openAdmin(page);
  await admin
    .getByLabel("Operator role", { exact: true })
    .selectOption("Analyst");
  await expect(
    admin.getByLabel("Account administration", { exact: true }),
  ).not.toBeChecked();
  await expect(
    admin.getByLabel("Report exports", { exact: true }),
  ).toBeChecked();
  await admin
    .getByRole("group", { name: "Admin configuration categories" })
    .getByRole("button", { name: "Payments", exact: true })
    .click();
  await admin
    .getByLabel("Manual review threshold", { exact: true })
    .selectOption("$1,000.00");
  await admin.getByLabel("Payment receipt emails", { exact: true }).uncheck();
  await expect(admin.locator(".da-payment-preview")).toContainText(
    "Additional manual review above $1,000.00",
  );
  await admin
    .getByRole("button", { name: "Review configuration", exact: true })
    .click();
  const review = admin.getByRole("region", {
    name: "Configuration review summary",
  });
  await expect(review).toContainText("Operator role");
  await expect(review).toContainText("Analyst");
  await expect(review).toContainText("$5,000.00");
  await expect(review).toContainText("$1,000.00");
  await expect(admin).toContainText(
    "Draft reviewed locally. No settings were applied.",
  );
  await expect(admin.getByLabel("Required platform safeguards")).toContainText(
    "Authenticated ownership",
  );
  await admin
    .getByLabel("Manual review threshold", { exact: true })
    .selectOption("$2,500.00");
  await expect(review).toHaveCount(0);
  await admin.getByRole("button", { name: "Reset draft", exact: true }).click();
  await expect(
    admin.getByLabel("Manual review threshold", { exact: true }),
  ).toHaveValue("$5,000.00");

  await admin
    .getByRole("group", { name: "Admin configuration categories" })
    .getByRole("button", { name: "Access & roles", exact: true })
    .click();
  await admin
    .getByLabel("Operator role", { exact: true })
    .selectOption("Analyst");
  await admin
    .getByRole("button", { name: "Review configuration", exact: true })
    .click();
  await expect(review).toBeVisible();
  await page
    .getByLabel("Configuration group", { exact: true })
    .selectOption("FX Intraday");
  await expect(admin.getByLabel("Operator role", { exact: true })).toHaveValue(
    "Community owner",
  );
  await expect(review).toHaveCount(0);
});

test("admin technical preferences update instrument and operations graphics with keyboard access", async ({
  page,
}) => {
  const admin = await openAdmin(page);
  const categories = admin.getByRole("group", {
    name: "Admin configuration categories",
  });
  const instruments = categories.getByRole("button", {
    name: "Instruments",
    exact: true,
  });
  await instruments.focus();
  await page.keyboard.press("Enter");
  await expect(instruments).toHaveAttribute("aria-pressed", "true");
  await admin.getByLabel("Instrument", { exact: true }).selectOption("EURUSD");
  await admin
    .getByLabel("Order filling policy", { exact: true })
    .selectOption("Immediate or cancel (IOC)");
  await expect(admin.locator(".da-policy-preview")).toContainText("EURUSD");
  await expect(admin.locator(".da-policy-preview")).toContainText(
    "Immediate or cancel (IOC)",
  );
  await categories
    .getByRole("button", { name: "Operations", exact: true })
    .click();
  await admin
    .getByLabel("Backend adapter", { exact: true })
    .selectOption("cTrader Open API");
  await admin
    .getByLabel("Account sync interval", { exact: true })
    .selectOption("Every 60 seconds");
  await expect(admin.locator(".da-operation-service")).toContainText(
    "cTrader Open API",
  );
  await expect(admin.locator(".da-operation-service")).toContainText(
    "Every 60 seconds",
  );
  await admin
    .getByRole("button", { name: "Review configuration", exact: true })
    .click();
  await expect(
    admin.getByRole("region", { name: "Configuration review summary" }),
  ).toContainText("Order filling policy");
});

test("admin control categories and review remain contained and usable on a 320px phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const admin = await openAdmin(page);
  const categories = admin.getByRole("group", {
    name: "Admin configuration categories",
  });
  for (const category of [
    "Access & roles",
    "Instruments",
    "Payments",
    "Operations",
  ]) {
    const button = categories.getByRole("button", {
      name: category,
      exact: true,
    });
    await button.click();
    const bounds = await button.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(
      await admin.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  await admin
    .getByLabel("Statement format", { exact: true })
    .selectOption("CSV only");
  await admin
    .getByRole("button", { name: "Review configuration", exact: true })
    .click();
  await expect(
    admin.getByRole("region", { name: "Configuration review summary" }),
  ).toContainText("CSV only");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
