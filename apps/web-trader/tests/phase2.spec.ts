import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("Phase 2 charts, saved workspaces, risk entry, management and responsive resync", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(20000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Create a workspace" }).click();
  await page.getByLabel("Workspace name").fill("Phase 2 browser");
  await page
    .getByLabel("Email address")
    .fill(`phase2-${randomUUID()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill(`${randomUUID()}-Aa9!`);
  await page.getByRole("button", { name: "Create simulated account" }).click();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".chart-bottom").first()).toContainText(
    "301 HISTORY BARS",
  );
  await page.getByLabel("Chart interval chart-1").selectOption("5m");
  await page.getByLabel("Search markets").fill("GBP");
  await page.getByLabel("Select GBPUSD").click();
  await expect(page.getByLabel("Chart instrument chart-1")).toHaveValue(
    "GBPUSD",
  );
  await page.getByLabel("Search markets").fill("");
  await page
    .getByRole("button", { name: "2 charts vertical", exact: true })
    .click();
  await expect(page.locator(".chart-pane")).toHaveCount(2);
  await page.getByLabel("Chart instrument chart-2").selectOption("XAUUSD");
  await page.getByLabel("Chart interval chart-2").selectOption("15m");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".chart-wait")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/phase2-two-charts-1440.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "4 charts grid", exact: true })
    .click();
  await expect(page.locator(".chart-pane")).toHaveCount(4);
  await page.getByLabel("Workspace menu").click();
  await page
    .getByRole("button", { name: "Rename workspace", exact: true })
    .click();
  await page.getByLabel("Workspace name").fill("Saved four chart workspace");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Save workspace", { exact: true }).click();
  await expect(page.locator(".save-state")).toHaveText("Saved");
  await page.reload();
  await expect(page.locator(".chart-pane")).toHaveCount(4);
  await expect(page.getByLabel("Chart instrument chart-2")).toHaveValue(
    "XAUUSD",
  );
  await expect(page.getByLabel("Chart interval chart-2")).toHaveValue("15m");
  await expect(page.locator(".chart-wait")).toHaveCount(0);
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".chart-pane").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/phase2-grid-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "1 chart", exact: true }).click();
  await page.getByLabel("Chart instrument chart-1").selectOption("EURUSD");
  await page.getByLabel("Chart interval chart-1").selectOption("1s");
  await page.getByRole("button", { name: "Risk", exact: true }).click();
  await page.getByLabel("Risk value").fill("0.10");
  await page
    .getByRole("button", { name: "Price distance", exact: true })
    .click();
  await page.getByLabel("Stop loss", { exact: true }).fill("0.001");
  await page.getByLabel("Take profit", { exact: true }).fill("0.002");
  await page.getByRole("button", { name: "Buy EURUSD", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("filled successfully");
  await page.getByLabel("Chart interval chart-1").selectOption("1D");
  await page.getByLabel("Fit chart chart-1").click();
  const slHandle = page
    .locator(".chart-trade-handle")
    .filter({ hasText: /^SL/ });
  await expect(slHandle).toBeVisible();
  await slHandle.focus();
  const chartModify = page.waitForResponse(
    (r) => r.url().includes("/positions/") && r.request().method() === "PATCH",
  );
  await slHandle.press("ArrowUp");
  await slHandle.press("Enter");
  expect((await chartModify).status()).toBe(200);
  await expect(slHandle).toBeEnabled();
  const canonicalTitle = await slHandle.getAttribute("title");
  await page.route("**/api/v1/accounts/*/positions/*", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "INVALID_PROTECTION",
          message: "Chart modification rejected for rollback verification",
        }),
      });
    else await route.continue();
  });
  await slHandle.press("ArrowDown");
  await slHandle.press("Enter");
  await expect(page.locator(".toast.error")).toContainText(
    "Chart modification rejected",
  );
  await expect(slHandle).toHaveAttribute("title", canonicalTitle!);
  await page.unroute("**/api/v1/accounts/*/positions/*");
  await page.getByLabel("Edit EURUSD protection").click();
  await page.getByLabel("Position stop loss").fill("0.50");
  await page.getByLabel("Position take profit").fill("2.00");
  await page
    .getByRole("button", { name: "Save protection", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "50%", exact: true }).click();
  await expect(page.locator(".close-preview")).toContainText("Will remain");
  await page
    .getByRole("button", { name: "Confirm close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Edit EURUSD protection").click();
  const breakResponse = page.waitForResponse(
    (r) => r.url().endsWith("/breakeven") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Move SL to breakeven", exact: true })
    .click();
  const breakeven = await breakResponse;
  expect([200, 400, 409, 422]).toContain(breakeven.status());
  if (breakeven.status() !== 200)
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  else
    await expect(page.getByLabel("Position stop loss")).not.toHaveValue("0.50");
  await page.getByLabel("Close dialog", { exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm close", exact: true })
    .click();
  await expect(page.getByText("Your next position starts here")).toBeVisible();
  await page.getByRole("button", { name: "Risk $", exact: true }).click();
  await page.getByLabel("Risk value").fill("100");
  await page.locator(".trade-sides .sell").click();
  await page.getByRole("button", { name: "Sell EURUSD", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("SELL EURUSD filled");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Lots", exact: true }).click();
  await page.getByLabel("Enable stop loss and take profit").uncheck();
  await page.locator(".trade-sides .buy").click();
  await page.getByRole("button", { name: "Limit", exact: true }).click();
  await page.getByLabel("Entry price", { exact: true }).fill("0.50");
  await page.getByRole("button", { name: "Buy EURUSD", exact: true }).click();
  await page.getByRole("tab", { name: /^Orders/ }).click();
  await page.getByRole("button", { name: "Modify", exact: true }).click();
  await page.getByLabel("Pending entry price").fill("0.55");
  await page.getByRole("button", { name: "Save order changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "0.55000", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("No working orders")).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByLabel("Entry price", { exact: true }).fill("2.00");
  await page.getByRole("button", { name: "Buy EURUSD", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Stop order accepted");
  await page.context().setOffline(true);
  await expect(page.getByText("OFFLINE", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buy EURUSD", exact: true }),
  ).toBeDisabled();
  await page.context().setOffline(false);
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  await expect(page.locator(".activity-panel tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search commands").fill("Open activity");
  await page.getByLabel("Search commands").press("Enter");
  await page.getByLabel("Activity scope").selectOption("WORKSPACE");
  await expect(
    page.getByRole("cell", { name: "WORKSPACE CREATED", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  while (await page.getByLabel("Dismiss notification").count())
    await page.getByLabel("Dismiss notification").first().click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/phase2-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
