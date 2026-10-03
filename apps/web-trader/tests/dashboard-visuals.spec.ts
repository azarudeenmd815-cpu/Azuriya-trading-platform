import { expect, test } from "@playwright/test";

test("dashboard graphics follow team volume and copy flow pause controls", async ({
  page,
}) => {
  await page.goto("/#platform");
  const dashboard = page.locator("#platform");
  const copyTracks = dashboard.locator(
    '[data-flow-diagram="dashboard-copy"] [data-flow-track]',
  );
  await expect(copyTracks).toHaveCount(4);
  await expect(
    dashboard.locator(
      '[data-flow-diagram="dashboard-routing"] [data-flow-track]',
    ),
  ).toHaveCount(6);
  await expect(dashboard.locator(".dv-sparkline")).toHaveCount(4);
  await expect(dashboard.locator(".dc-routing-detail")).not.toHaveAttribute(
    "open",
    "",
  );
  await dashboard.locator(".dc-routing-detail > summary").click();
  await expect(
    dashboard.getByRole("figure", { name: /Example platform distribution/ }),
  ).toBeVisible();
  await dashboard.getByLabel("Filter demo by team").selectOption("FX Intraday");
  const volume = dashboard.getByLabel("Example trading volume by team");
  await expect(volume).toContainText("FX Intraday");
  await expect(volume).toContainText("3,284");
  await expect(volume).not.toContainText("Gold Elite");
  await dashboard
    .getByRole("button", { name: "Pause demo engine", exact: true })
    .click();
  expect(
    await copyTracks.evaluateAll((paths) =>
      paths.every(
        (path) => getComputedStyle(path).animationPlayState === "paused",
      ),
    ),
  ).toBe(true);
  await dashboard
    .getByRole("button", { name: "Resume demo engine", exact: true })
    .click();
  expect(
    await copyTracks.evaluateAll((paths) =>
      paths.every(
        (path) => getComputedStyle(path).animationPlayState === "running",
      ),
    ),
  ).toBe(true);
});

test("keyboard shortcuts open the detailed operational workspaces", async ({
  page,
}) => {
  await page.goto("/#platform");
  const dashboard = page.locator("#platform");
  for (const [shortcut, title] of [
    ["Admin Portal", "Administration"],
    ["Prop firm", "Prop firm"],
    ["Brokerage", "Brokerage"],
  ]) {
    await dashboard
      .getByRole("navigation", { name: "Demo dashboard views" })
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await dashboard
      .getByRole("button", { name: `Open ${shortcut} controls`, exact: true })
      .press("Enter");
    await expect(
      dashboard.getByRole("heading", { name: title, exact: true, level: 2 }),
    ).toBeVisible();
    expect(
      await dashboard.locator(".az-dash-content select").count(),
    ).toBeGreaterThan(5);
  }
});
