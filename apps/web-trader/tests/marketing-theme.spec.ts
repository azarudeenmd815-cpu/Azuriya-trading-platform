import { expect, test, type Page } from "@playwright/test";

type Theme = "light" | "dark";
function luminance(color: string) {
  const channels = color.match(/\d+/g)!.slice(0, 3).map(Number);
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

async function expectVisitorTheme(page: Page, theme: Theme) {
  await expect(page.locator("html")).toHaveAttribute(
    "data-marketing-theme",
    theme,
  );
  const isLanding = (await page.locator(".az-landing-page").count()) > 0;
  await expect(page.locator(".az-marketing").first()).toHaveCSS(
    "background-color",
    theme === "dark"
      ? isLanding
        ? "rgb(0, 0, 0)"
        : "rgb(0, 0, 0)"
      : "rgb(255, 255, 255)",
  );
  if (isLanding && theme === "dark") {
    await expect(page.locator(".az-header")).toHaveCSS(
      "background-color",
      "rgb(0, 0, 0)",
    );
    await expect(page.locator(".sf-footer")).toHaveCSS(
      "background-color",
      "rgb(0, 0, 0)",
    );
  }
  await expect(page.locator(".az-marketing").first()).toHaveCSS(
    "color-scheme",
    theme,
  );
  await expect(
    page.getByRole("button", {
      name: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
    }),
  ).toHaveCount(1);
}

test("theme choice persists across reload and visitor navigation without resetting dashboard state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expectVisitorTheme(page, "dark");
  const demo = page.locator("#platform");
  const journal = demo.getByRole("region", {
    name: "Illustrative trading journal",
  });
  await demo
    .getByRole("combobox", { name: "Filter demo by team" })
    .selectOption("Gold Elite");
  await journal
    .getByRole("button", { name: "Show one week of closed trades" })
    .click();
  await journal
    .getByRole("searchbox", { name: "Search closed trades" })
    .fill("XAUUSD");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expectVisitorTheme(page, "light");
  await expect(demo).toHaveAttribute("data-dashboard-theme", "light");
  await expect(journal).toContainText("−$89.00");
  await expect(journal.getByRole("searchbox")).toHaveValue("XAUUSD");
  await expect(
    demo.getByRole("combobox", { name: "Filter demo by team" }),
  ).toHaveValue("Gold Elite");
  expect(
    await page.evaluate(() => localStorage.getItem("azuriya.marketing-theme")),
  ).toBe("light");
  await page.reload();
  await expectVisitorTheme(page, "light");
  await page.locator(".mdh-hero-link").click();
  await expect(page).toHaveURL(/\/mt5-deposits$/);
  await expectVisitorTheme(page, "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expectVisitorTheme(page, "dark");
  await page.reload();
  await expectVisitorTheme(page, "dark");
  for (const path of [
    "/insights",
    "/legal/privacy",
    "/community",
    "/no-such-theme-page",
  ]) {
    await page.goto(path);
    await expectVisitorTheme(page, "dark");
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expectVisitorTheme(page, "light");
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
  }
  expect(errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} theme covers all twelve dashboard views and native controls`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("azuriya.marketing-theme", value),
      theme,
    );
    await page.goto("/");
    await expectVisitorTheme(page, theme);
    const dashboard = page.locator("#platform .az-dashboard");
    const views = page.getByRole("navigation", {
      name: "Demo dashboard views",
    });
    for (const name of [
      "Overview",
      "Teams",
      "Accounts",
      "Copy trading",
      "Funding",
      "Community",
      "Risk controls",
      "Analytics",
      "Administration",
      "Prop firm",
      "Brokerage",
      "Platforms",
    ]) {
      const view = views.getByRole("button", {
        name: name === "Teams" ? /^Teams\s+\d+$/ : name,
        exact: true,
      });
      await view.click();
      await expect(view).toHaveAttribute("aria-pressed", "true");
      await expect(dashboard.locator(".az-stat")).toHaveCount(
        name === "Overview" ? 4 : 0,
      );
      await expect(dashboard.locator(".dd-environment-strip")).toHaveCount(
        name === "Overview" ? 1 : 0,
      );
      await expect(dashboard).toHaveCSS(
        "background-color",
        theme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)",
      );
      await expect(dashboard).toHaveCSS("color-scheme", theme);
      const colors = await dashboard.evaluate((el) => ({
        heading: getComputedStyle(el.querySelector(".az-dash-heading h2")!)
          .color,
        panels: Array.from(
          el.querySelectorAll(
            ".az-stat, .az-chart-panel, .az-engine, .az-positions, .dd-panel, .dd-message-panel, .az-team-card, .az-demo-detail, .da-panel, .dp-equity, .db-panel, .tj-journal",
          ),
        ).map((panel) => {
          let surface = panel;
          while (
            getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)" &&
            surface.parentElement
          )
            surface = surface.parentElement;
          return {
            blue: panel.classList.contains("is-money"),
            color: getComputedStyle(surface).backgroundColor,
          };
        }),
        controls: Array.from(el.querySelectorAll("input, select")).map(
          (control) => getComputedStyle(control).colorScheme,
        ),
      }));
      const channels = (color: string) =>
        color.match(/\d+/g)!.slice(0, 3).map(Number);
      expect(
        channels(colors.heading).every((channel) =>
          theme === "dark" ? channel > 180 : channel < 100,
        ),
        `${name} heading`,
      ).toBe(true);
      expect(colors.panels.length).toBeGreaterThan(0);
      for (const panel of colors.panels) {
        expect(panel.color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
        if (panel.blue) expect(panel.color).toBe("rgb(56, 105, 252)");
        else
          expect(
            channels(panel.color).every((channel) =>
              theme === "dark" ? channel < 210 : channel >= 240,
            ),
            `${name}: ${panel.color}`,
          ).toBe(true);
      }
      expect(
        colors.controls.every((scheme) => scheme === theme),
        `${name} native controls`,
      ).toBe(true);
      if (name === "Overview" || name === "Analytics") {
        const historyColors = await dashboard
          .locator(".tj-journal")
          .evaluate((journal) => ({
            background: getComputedStyle(journal).backgroundColor,
            text: Array.from(
              journal.querySelectorAll("tbody td, tbody td small"),
            ).map((cell) => ({
              label: cell.textContent,
              color: getComputedStyle(cell).color,
            })),
          }));
        expect(historyColors.text.length).toBeGreaterThan(0);
        const background = luminance(historyColors.background);
        for (const cell of historyColors.text) {
          const foreground = luminance(cell.color);
          const contrast =
            (Math.max(background, foreground) + 0.05) /
            (Math.min(background, foreground) + 0.05);
          expect(
            contrast,
            `${theme} trade history: ${cell.label}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    await page.reload();
    await expectVisitorTheme(page, theme);
  });
}

test("theme controls fit small screens and remain keyboard operable", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const current of ["dark", "light"] as const) {
      const toggle = page.getByRole("button", {
        name: `Switch to ${current === "dark" ? "light" : "dark"} theme`,
      });
      await expect(toggle).toBeVisible();
      await toggle.focus();
      await toggle.press("Enter");
      await expectVisitorTheme(page, current === "dark" ? "light" : "dark");
      const rectangles = await page
        .locator(
          ".az-header-inner > a, .az-theme-switch, .az-header .az-button-small, .az-menu-toggle",
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => getComputedStyle(el).display !== "none")
            .map((el) => {
              const box = el.getBoundingClientRect();
              return { left: box.left, right: box.right, width: box.width };
            }),
        );
      const sorted = rectangles.toSorted((a, b) => a.left - b.left);
      expect(
        sorted.every(
          (box, index) =>
            box.left >= 0 &&
            box.right <= width &&
            (!index || box.left >= sorted[index - 1].right),
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("theme changes from another tab remain synchronized through terminal navigation", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expectVisitorTheme(page, "dark");
  const otherTab = await context.newPage();
  await otherTab.goto("/insights");
  await expectVisitorTheme(otherTab, "dark");
  await page
    .getByRole("link", { name: "Explore the terminal", exact: true })
    .click();
  await expect(page).toHaveURL(/\/terminal$/);
  await otherTab.getByRole("button", { name: "Switch to light theme" }).click();
  await expectVisitorTheme(otherTab, "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-marketing-theme",
    "light",
  );
  await page.goBack();
  await expectVisitorTheme(page, "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expectVisitorTheme(otherTab, "dark");
  await otherTab.close();
});

test("theme switching still works when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "azuriya.marketing-theme")
        throw new DOMException("Storage unavailable", "SecurityError");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "azuriya.marketing-theme")
        throw new DOMException("Storage unavailable", "SecurityError");
      setItem.call(this, key, value);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expectVisitorTheme(page, "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expectVisitorTheme(page, "light");
  await page.reload();
  await expectVisitorTheme(page, "dark");
  expect(errors).toEqual([]);
});
