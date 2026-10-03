import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("authenticated simulated trading, protection, partial close, pending order and audit", async ({
  page,
}) => {
  const suffix = randomUUID();
  const email = `browser-${suffix}@example.test`;
  const password = randomUUID() + "-Aa9!";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Create a workspace" }).click();
  await page.getByLabel("Workspace name").fill("Browser validation workspace");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create simulated account" }).click();
  await expect(page.getByLabel("Trading account")).toBeVisible();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel("Order quantity").fill("0.10");
  await page.getByRole("button", { name: "Buy EURUSD", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("filled successfully");
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Edit EURUSD protection").click();
  await page.getByLabel("Position stop loss").fill("0.50");
  await page.getByLabel("Position take profit").fill("2.00");
  await page.getByRole("button", { name: "Save protection" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Edit EURUSD protection").click();
  await page.getByLabel("Position stop loss").fill("");
  await page.getByLabel("Position take profit").fill("");
  await page.getByRole("button", { name: "Save protection" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Quantity to close").fill("0.04");
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("cell", { name: "0.06", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText("OFFLINE", { exact: true })).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "0.06", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/terminal-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(page.getByText("Your next position starts here")).toBeVisible();
  await page.getByRole("button", { name: "Limit", exact: true }).click();
  await page.getByLabel("Entry price").fill("0.50");
  await page.getByRole("button", { name: "Buy EURUSD", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Limit order accepted");
  await page.getByRole("tab", { name: "Orders" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("No working orders")).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "POSITION CLOSED", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Open trading terminal" }).click();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Buy EURUSD", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Your next position starts here")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/terminal-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
