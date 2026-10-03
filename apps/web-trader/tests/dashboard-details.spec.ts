import { expect, test } from "@playwright/test";

test("dashboard funding filters match transactions and MT5 deposits has its own page", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views.getByRole("button", { name: "Funding", exact: true }).click();
  await expect(demo.locator(".dd-payment-list article")).toHaveCount(5);
  await demo
    .getByLabel("Transaction type", { exact: true })
    .selectOption("Withdrawal");
  await expect(demo.locator(".dd-payment-list article")).toHaveCount(2);
  await expect(demo.locator(".dd-payment-list")).not.toContainText("Deposit");
  await demo
    .getByLabel("Payment status", { exact: true })
    .selectOption("Completed");
  await expect(demo.locator(".dd-payment-list article")).toHaveCount(0);
  await expect(
    demo.getByText("No example payments match these filters."),
  ).toBeVisible();
  await demo
    .getByLabel("Transaction type", { exact: true })
    .selectOption("Deposit");
  await expect(demo.locator(".dd-payment-list article")).toHaveCount(2);
  await demo
    .getByRole("link", { name: "Explore MT5 deposits", exact: true })
    .click();
  await expect(page).toHaveURL(/\/mt5-deposits$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("dashboard group commission preview supports $2 base plus $5 extra and updates overview exactly", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await expect(demo.locator(".dd-admin-total")).toContainText("$7.00 / lot");
  await demo
    .getByLabel("Configuration group", { exact: true })
    .selectOption("Algo Team");
  await demo.getByLabel("Group leverage", { exact: true }).selectOption("1:50");
  await demo
    .getByLabel("Extra markup per lot", { exact: true })
    .selectOption("1.50");
  await expect(demo.locator(".dd-admin-total")).toContainText("$3.50 / lot");
  await expect(
    demo.getByLabel("Configuration group", { exact: true }),
  ).toHaveValue("Algo Team");
  await expect(demo.locator(".az-stats")).toHaveCount(0);
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(demo.locator(".az-stats")).toContainText("$942.00");
  await expect(demo.locator(".dd-commission-panel")).toContainText("$942.00");
  await expect(demo.locator(".dd-fee-equation")).toContainText("$3.50");
  await views
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await expect(demo.getByLabel("Group leverage", { exact: true })).toHaveValue(
    "1:50",
  );
  await expect(
    demo.getByLabel("Extra markup per lot", { exact: true }),
  ).toHaveValue("1.50");
  await demo
    .getByLabel("Configuration group", { exact: true })
    .selectOption("FX Intraday");
  await expect(demo.getByLabel("Group leverage", { exact: true })).toHaveValue(
    "1:100",
  );
  await expect(
    demo.getByLabel("Extra markup per lot", { exact: true }),
  ).toHaveValue("5.00");
  await expect(demo.locator(".az-stats")).toHaveCount(0);
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(demo.locator(".az-stats")).toContainText("$16,420.00");
  await views
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await demo
    .getByLabel("Configuration group", { exact: true })
    .selectOption("Algo Team");
  await expect(demo.getByLabel("Group leverage", { exact: true })).toHaveValue(
    "1:50",
  );
  await expect(
    demo.getByLabel("Extra markup per lot", { exact: true }),
  ).toHaveValue("1.50");
  await views.getByRole("button", { name: "Overview", exact: true }).click();
  await demo.getByLabel("Filter demo by team").selectOption("All teams");
  await expect(demo.locator(".az-stats")).toContainText("$69,262.00");
  await expect(demo.locator(".dd-commission-panel")).toContainText(
    "$69,262.00",
  );
  await expect(
    demo.locator(".dd-group-rates > div").filter({ hasText: "Algo Team" }),
  ).toContainText("$1.50 markup");
  await expect(
    demo.locator(".dd-group-rates > div").filter({ hasText: "Gold Elite" }),
  ).toContainText("$5.00 markup");
});

test("overview funding, activity and balances follow the selected team", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  await demo.locator(".dc-activity-detail > summary").click();
  await demo.locator(".dc-platform-detail > summary").click();
  const filter = demo.getByLabel("Filter demo by team");
  await filter.selectOption("FX Intraday");
  await expect(demo.locator(".dd-overview-funding")).toContainText("#18273");
  await expect(demo.locator(".dd-overview-funding")).not.toContainText(
    "#23192",
  );
  await expect(demo.locator(".dd-overview-funding")).not.toContainText(
    "#92731",
  );
  await expect(demo.locator(".dd-overview-activity")).toContainText("#18273");
  await expect(demo.locator(".dd-overview-activity")).not.toContainText(
    "Gold Elite",
  );
  await filter.selectOption("Algo Team");
  await expect(demo.locator(".dd-overview-funding")).toContainText("#62714");
  await expect(demo.locator(".dd-overview-funding")).not.toContainText(
    "#18273",
  );
  await expect(demo.locator(".dd-overview-activity")).toContainText(
    "cardholder check needed",
  );
  await expect(demo.locator(".dd-platform-balances")).toContainText(
    "100 accounts",
  );
  await expect(demo.locator(".dd-platform-balances")).toContainText(
    "$186,500.00",
  );
});

test("dashboard community channels and platform connection filters show useful details", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  await views.getByRole("button", { name: "Community", exact: true }).click();
  const channels = demo.getByRole("navigation", {
    name: "Demo community channels",
  });
  await channels.getByRole("button", { name: /account-support/ }).click();
  await expect(demo.locator(".dd-message-panel")).toContainText(
    "Where can I check the status of my withdrawal request?",
  );
  await channels.getByRole("button", { name: /market-discussion/ }).click();
  await expect(demo.locator(".dd-message-panel")).toContainText("London open");
  await expect(demo.locator(".dd-message-panel")).not.toContainText(
    "withdrawal request",
  );
  await views.getByRole("button", { name: "Platforms", exact: true }).click();
  await expect(demo.locator(".dd-connections article")).toHaveCount(4);
  await demo
    .getByLabel("Platform connection status")
    .selectOption("Configuration needed");
  await expect(demo.locator(".dd-connections article")).toHaveCount(1);
  await expect(demo.locator(".dd-connections")).toContainText("DXtrade");
  await demo.getByLabel("Platform connection status").selectOption("Connected");
  await expect(demo.locator(".dd-connections article")).toHaveCount(3);
  await expect(demo.locator(".dd-connections")).toContainText(
    "MT5 Manager API",
  );
});

test("expanded dashboard remains contained on phones and account details scroll inside the portal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/");
  const demo = page.locator("#platform");
  const views = demo.getByRole("navigation", { name: "Demo dashboard views" });
  for (const view of [
    "Overview",
    "Funding",
    "Community",
    "Administration",
    "Platforms",
    "Accounts",
  ]) {
    await views.getByRole("button", { name: view, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    if (view === "Overview") {
      await expect
        .poll(() =>
          demo
            .locator(".az-stat.is-money > strong")
            .evaluate((element) => element.scrollWidth <= element.clientWidth),
        )
        .toBe(true);
    } else {
      await expect(demo.locator(".az-stat")).toHaveCount(0);
    }
    if (view === "Administration") {
      for (const fee of await demo.locator(".dd-admin-fees b").all()) {
        await expect
          .poll(() =>
            fee.evaluate(
              (element) => element.scrollWidth <= element.clientWidth,
            ),
          )
          .toBe(true);
      }
    }
  }
  await expect(demo.getByRole("table")).toContainText("Equity $24,491.00");
  expect(
    await demo
      .locator(".az-table-scroll")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
});
