import { expect, test } from "@playwright/test";

test("journal trade filters, search, expansion and empty state keep summary scoped to the full period", async ({
  page,
}) => {
  await page.goto("/");
  const journal = page.getByRole("region", {
    name: "Illustrative trading journal",
  });
  const summary = journal.getByRole("complementary", {
    name: "Closed-trade summary",
  });
  const table = journal.getByRole("table");
  await expect(summary).toContainText("+$754.00");
  await expect(summary).toContainText("8 example trades");
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await journal.getByRole("button", { name: "Show all 8 trades" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await journal.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(3);
  for (const row of await table.locator("tbody tr").all()) {
    await expect(row.locator("td").nth(1)).toContainText("Sell");
  }
  await expect(summary).toContainText("+$754.00");
  await journal
    .getByRole("button", { name: "All trades", exact: true })
    .click();
  await journal
    .getByRole("searchbox", { name: "Search closed trades" })
    .fill("XAUUSD");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table).toContainText("2641.000");
  await journal
    .getByRole("searchbox", { name: "Search closed trades" })
    .fill("not-a-trade");
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await expect(journal.getByText("No matching closed trades")).toBeVisible();
  await journal.getByRole("button", { name: "Clear filters" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(5);
});

test("team and period selections update the chart, reconciled totals and history", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#platform");
  const journal = demo.getByRole("region", {
    name: "Illustrative trading journal",
  });
  await demo
    .getByRole("combobox", { name: "Filter demo by team" })
    .selectOption("Gold Elite");
  await expect(journal).toContainText("+$223.00");
  await expect(
    journal.getByRole("img", {
      name: "Gold Elite realized P&L history for 1M",
    }),
  ).toBeVisible();
  await expect(journal.getByRole("table").locator("tbody tr")).toHaveCount(2);
  await journal
    .getByRole("button", { name: "Show one week of closed trades" })
    .click();
  await expect(journal).toContainText("−$89.00");
  await expect(
    journal.getByRole("img", {
      name: "Gold Elite realized P&L history for 1W",
    }),
  ).toBeVisible();
  await expect(journal.getByRole("table").locator("tbody tr")).toHaveCount(1);
  await journal
    .getByRole("button", { name: "Show three months of closed trades" })
    .click();
  await expect(journal).toContainText("+$484.00");
  await expect(journal.getByRole("table").locator("tbody tr")).toHaveCount(4);
});
