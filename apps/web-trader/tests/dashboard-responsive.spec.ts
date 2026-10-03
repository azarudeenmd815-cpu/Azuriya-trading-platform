import { expect, test, type Locator } from "@playwright/test";

const views = [
  "Overview",
  "Teams",
  "Accounts",
  "Copy trading",
  "Funding",
  "Community",
  "Analytics",
  "Administration",
  "Prop firm",
  "Brokerage",
  "Risk controls",
  "Platforms",
];

async function expectContainedWorkspace(workspace: Locator) {
  const overflow = await workspace.evaluate((root) => {
    const bounds = root.getBoundingClientRect();
    const hasScrollableAncestor = (element: Element) => {
      for (
        let parent = element.parentElement;
        parent && parent !== root;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (
          ["auto", "scroll"].includes(style.overflowX) &&
          parent.scrollWidth > parent.clientWidth + 1
        )
          return true;
      }
      return false;
    };
    return Array.from(root.querySelectorAll("*"))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          !box.width ||
          !box.height ||
          element.closest("svg, .az-sr-only, .dc-community-sr") ||
          style.visibility === "hidden" ||
          hasScrollableAncestor(element)
        )
          return false;
        return box.left < bounds.left - 2 || box.right > bounds.right + 2;
      })
      .map((element) => ({
        element: element.tagName,
        className: element.className,
        text: element.textContent?.slice(0, 60),
      }));
  });
  expect(overflow).toEqual([]);
}

for (const theme of ["light", "dark"]) {
  test(`${theme} dashboard contains every view and phone metrics at nine device widths`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("azuriya.marketing-theme", value),
      theme,
    );
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const workspace = page.locator("#platform .az-dashboard");
    const navigation = workspace.getByRole("navigation", {
      name: "Demo dashboard views",
    });
    for (const width of [320, 375, 390, 430, 768, 820, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width <= 1100) {
        const overlaps = await navigation
          .getByRole("button")
          .evaluateAll((buttons) =>
            buttons
              .slice(1)
              .filter(
                (button, index) =>
                  button.getBoundingClientRect().left <
                  buttons[index].getBoundingClientRect().right - 1,
              )
              .map((button) => button.textContent),
          );
        expect(overlaps, `Navigation overlap at ${width}px`).toEqual([]);
      }
      for (const name of views) {
        await navigation
          .getByRole("button", {
            name: name === "Teams" ? /^Teams(?:\s+\d+)?$/ : name,
            exact: true,
          })
          .click();
        await expectContainedWorkspace(workspace);
        const clipped = await workspace
          .locator(
            ".az-stat > strong, .dd-funding-banner h3, .dc-community-channel-heading h3",
          )
          .evaluateAll((elements) =>
            elements
              .filter(
                (element) =>
                  element.getBoundingClientRect().width > 0 &&
                  element.scrollWidth > element.clientWidth + 2,
              )
              .map((element) => element.textContent),
          );
        expect(clipped, `${name} at ${width}px`).toEqual([]);
      }
    }
  });

  test(`${theme} community dialogs and configuration reviews fit a narrow phone`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("azuriya.marketing-theme", value),
      theme,
    );
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    const workspace = page.locator("#platform .az-dashboard");
    const navigation = workspace.getByRole("navigation", {
      name: "Demo dashboard views",
    });
    await navigation
      .getByRole("button", { name: "Community", exact: true })
      .click();
    for (const name of [
      "Community settings",
      "Community events",
      "Pinned messages",
    ]) {
      await workspace.getByRole("button", { name, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
      await expectContainedWorkspace(dialog);
      await dialog.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
    await navigation
      .getByRole("button", { name: "Administration", exact: true })
      .click();
    for (const name of [
      "Access & roles",
      "Instruments",
      "Payments",
      "Operations",
    ]) {
      await workspace
        .getByRole("group", { name: "Admin configuration categories" })
        .getByRole("button", { name, exact: true })
        .click();
      await expectContainedWorkspace(workspace);
    }
    await workspace
      .getByRole("button", { name: "Review configuration", exact: true })
      .click();
    await expect(
      workspace.getByRole("region", { name: "Configuration review summary" }),
    ).toBeVisible();
    await expectContainedWorkspace(workspace);
    await navigation
      .getByRole("button", { name: "Prop firm", exact: true })
      .click();
    const prop = workspace.getByRole("region", {
      name: "Prop firm program preview",
    });
    await prop
      .getByRole("button", {
        name: "$100,000.00 evaluation account",
        exact: true,
      })
      .click();
    for (const name of [
      "Evaluation 1 stage",
      "Verification stage",
      "Funded stage",
    ]) {
      await prop.getByRole("button", { name, exact: true }).click();
      await expectContainedWorkspace(workspace);
    }
    for (const name of ["Program setup", "Risk rules", "Payouts"]) {
      await prop.getByRole("button", { name, exact: true }).click();
      await expectContainedWorkspace(workspace);
    }
    await navigation
      .getByRole("button", { name: "Brokerage", exact: true })
      .click();
    const brokerage = workspace.getByRole("region", {
      name: "Brokerage controls preview",
    });
    for (const name of [
      "Execution",
      "Symbols & pricing",
      "Server & accounts",
      "Monitoring",
    ]) {
      await brokerage.getByRole("tab", { name, exact: true }).click();
      await expectContainedWorkspace(workspace);
    }
    await workspace
      .getByRole("button", { name: "Review configuration", exact: true })
      .click();
    await expect(
      workspace.getByRole("region", { name: "Brokerage configuration review" }),
    ).toBeVisible();
    await expectContainedWorkspace(workspace);
  });
}
