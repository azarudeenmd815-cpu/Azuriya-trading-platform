import { expect, test } from "@playwright/test";
import { sitePages } from "../src/components/marketing/site-pages";

test("every new page renders its own content, metadata and shared footer", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  for (const entry of sitePages) {
    const response = await request.get(entry.path);
    expect(response.status(), entry.path).toBe(200);
    const html = await response.text();
    expect(html, entry.path).toContain(
      (entry.seoTitle ?? `${entry.navLabel} | Azuriya`).replaceAll(
        "&",
        "&amp;",
      ),
    );
    expect(html, entry.path).toContain('aria-label="Azuriya site footer"');
    expect(html, entry.path).toContain('id="main-content"');
  }
  await page.goto("/legal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Legal & transparency centre",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  await expect(
    page.getByText("Awaiting confirmation", { exact: true }),
  ).toHaveCount(4);
  await expect(page.locator(".sp-directory-entry")).toHaveCount(8);
  await page
    .getByRole("navigation", { name: "On this page" })
    .getByRole("link", { name: "Document status", exact: true })
    .click();
  await expect(page.locator("#document-status")).toBeInViewport();
  const ids = await page
    .locator("[id]")
    .evaluateAll((elements) => elements.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test("footer destinations resolve and public pages share all five link groups", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo", { name: "Azuriya site footer" });
  for (const title of [
    "platform",
    "solutions",
    "resources",
    "company",
    "legal",
  ]) {
    await expect(
      footer.getByRole("navigation", { name: `Footer ${title} navigation` }),
    ).toBeVisible();
  }
  const paths = await footer
    .locator("a")
    .evaluateAll((links) => [
      ...new Set(links.map((link) => link.getAttribute("href")!)),
    ]);
  for (const path of paths)
    expect((await request.get(path)).status(), path).toBe(200);
  await footer.getByRole("link", { name: "Legal centre", exact: true }).click();
  await expect(page).toHaveURL(/\/legal$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Legal & transparency centre",
  );
  await page.goto("/mt5-deposits");
  await expect(
    page.getByRole("contentinfo", { name: "Azuriya site footer" }),
  ).toBeVisible();
});

test("site directory filters, searches, handles empty results and opens pages", async ({
  page,
}) => {
  await page.goto("/sitemap");
  const directory = page.getByRole("region", { name: "Page directory" });
  await expect(directory.locator(".sp-directory-entry")).toHaveCount(
    sitePages.length + 2,
  );
  await directory.getByRole("button", { name: "Legal", exact: true }).click();
  await expect(directory.locator(".sp-directory-entry")).toHaveCount(9);
  const search = directory.getByRole("searchbox", { name: "Search pages" });
  await search.fill("privacy");
  await expect(directory.locator(".sp-directory-entry")).toHaveCount(2);
  await expect(
    directory.locator('.sp-directory-entry[href="/legal/privacy"]'),
  ).toBeVisible();
  await expect(
    directory.locator('.sp-directory-entry[href="/legal/cookies"]'),
  ).toBeVisible();
  await search.fill("nothing-matches-this-query");
  await expect(
    directory.getByText("No pages match this search."),
  ).toBeVisible();
  await directory.getByRole("button", { name: "Show all pages" }).click();
  await expect(search).toHaveValue("");
  await expect(directory.locator(".sp-directory-entry")).toHaveCount(
    sitePages.length + 2,
  );
  await search.fill("copy trading");
  await directory.locator('.sp-directory-entry[href="/copy-trading"]').click();
  await expect(page).toHaveURL(/\/copy-trading$/);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Copy trading", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("group", { name: /Copy engine workspace illustration/ }),
  ).toBeVisible();
});

test("privacy preference uses opt-in storage, preserves workspace and supports keyboard closing", async ({
  page,
}) => {
  await page.goto("/legal/cookies");
  await page.evaluate(() => {
    localStorage.removeItem("azuriya:privacy-preferences");
    localStorage.setItem("azuriya:workspace:test", "workspace-example");
  });
  const trigger = page.getByRole("button", {
    name: "Privacy preferences",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Privacy preferences" });
  const remember = dialog.getByRole("checkbox", {
    name: "Remember my privacy choice on this device",
  });
  await expect(remember).not.toBeChecked();
  await expect(
    dialog.getByText(
      "No optional tracking scripts are enabled in this preview.",
    ),
  ).toBeVisible();
  await remember.check();
  await dialog.getByRole("button", { name: "Save preference" }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("azuriya:privacy-preferences")!),
    ),
  ).toEqual({ optionalAnalytics: false, rememberPreference: true });
  await page.reload();
  await trigger.click();
  await expect(remember).toBeChecked();
  await remember.uncheck();
  await dialog.getByRole("button", { name: "Save preference" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("azuriya:privacy-preferences"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("azuriya:workspace:test")),
  ).toBe("workspace-example");
  await trigger.click();
  await dialog
    .getByRole("button", { name: "Close privacy preferences" })
    .press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("contact prepares a local draft without sending or persisting personal information", async ({
  page,
}) => {
  const submissions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") submissions.push(request.url());
  });
  await page.goto("/contact");
  await page.getByLabel("Your name", { exact: true }).fill("Preview Visitor");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("preview@example.com");
  await page
    .getByLabel("Tell us about your operation")
    .fill("We want a community workspace with MT5 and clear member roles.");
  await page.getByRole("button", { name: "Prepare inquiry" }).click();
  await expect(
    page.getByRole("heading", { name: "Your prepared inquiry" }),
  ).toBeVisible();
  await expect(page.locator(".sp-inquiry-draft pre")).toContainText(
    "preview@example.com",
  );
  await expect(page.locator(".sp-inquiry-feedback")).toHaveText(
    "Your inquiry draft is ready. It has not been sent.",
  );
  expect(submissions).toEqual([]);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain("preview@example.com");
  await page.reload();
  await expect(page.locator(".sp-inquiry-draft")).toHaveCount(0);
});

test("public reference layouts fit phones, tablets and desktops", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/legal/privacy");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(
      (value) => localStorage.setItem("azuriya.marketing-theme", value),
      theme,
    );
    for (const path of [
      "/legal/privacy",
      "/brokerage",
      "/liquidity",
      "/sitemap",
      "/contact",
      "/community",
      "/pricing",
    ]) {
      await page.goto(path);
      for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 982 });
        await expect
          .poll(
            () =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
            { message: `${path} fits ${width}px in ${theme} theme` },
          )
          .toBe(true);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator(".sp-page")).toHaveCSS(
          "background-color",
          theme === "dark" ? "rgb(15, 16, 20)" : "rgb(255, 255, 255)",
        );
        // Outer clipping must not hide a hero button expanding the grid.
        for (const button of await page
          .locator(".sp-hero-actions .az-button")
          .all()) {
          const bounds = await button.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x).toBeGreaterThanOrEqual(16);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 15);
        }
      }
    }
  }
  expect(errors).toEqual([]);
});

test("phone search, long inquiry drafts and short-height privacy dialogs remain usable", async ({
  page,
}) => {
  await page.goto("/contact");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(
      (value) => localStorage.setItem("azuriya.marketing-theme", value),
      theme,
    );
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 480 });
      await page.goto("/sitemap");
      const search = page.getByRole("searchbox", { name: "Search pages" });
      await expect(search).toHaveCSS("font-size", "16px");
      await search.fill("No matching topic " + "x".repeat(180));
      const clear = page.getByRole("button", { name: "Clear page search" });
      const clearBounds = await clear.boundingBox();
      expect(clearBounds!.width).toBeGreaterThanOrEqual(44);
      expect(clearBounds!.height).toBeGreaterThanOrEqual(44);
      await clear.click();
      await expect(search).toHaveValue("");

      await page.goto("/insights");
      await expect(
        page.getByRole("searchbox", { name: "Search articles" }),
      ).toHaveCSS("font-size", "16px");

      await page.goto("/contact");
      const name = page.getByLabel("Your name", { exact: true });
      await expect(name).toHaveCSS("font-size", "16px");
      await name.fill("Preview visitor");
      await page
        .getByLabel("Email address", { exact: true })
        .fill("preview@example.com");
      const message = "A long unbroken inquiry: " + "x".repeat(500);
      await page.getByLabel("Tell us about your operation").fill(message);
      await page.getByRole("button", { name: "Prepare inquiry" }).click();
      const draft = page.locator(".sp-inquiry-draft pre");
      await expect(draft).toContainText(message);
      expect(
        await draft.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      const trigger = page.getByRole("button", {
        name: "Privacy preferences",
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Privacy preferences" });
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      await dialog
        .getByRole("checkbox", {
          name: "Remember my privacy choice on this device",
        })
        .check();
      await dialog.getByRole("button", { name: "Save preference" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("unknown routes show a useful 404 and directory navigation", async ({
  page,
}) => {
  const response = await page.goto("/no-such-azuriya-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Let’s get you to the right place.",
  );
  await page.getByRole("link", { name: "Open the directory" }).click();
  await expect(page).toHaveURL(/\/sitemap$/);
});

test("standalone product diagrams pause their flows and funding retains its MT5 related link", async ({
  page,
}) => {
  for (const path of ["/liquidity", "/trading-platforms", "/admin-portal"]) {
    await page.goto(path);
    const tracks = page.locator("[data-flow-track]");
    expect(await tracks.count()).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Pause all flow animations", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Resume all flow animations",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() =>
        tracks.evaluateAll((elements) =>
          elements.every(
            (element) =>
              getComputedStyle(element).animationPlayState === "paused",
          ),
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Resume all flow animations", exact: true })
      .click();
    await expect
      .poll(() =>
        tracks.evaluateAll((elements) =>
          elements.every(
            (element) =>
              getComputedStyle(element).animationPlayState === "running",
          ),
        ),
      )
      .toBe(true);
  }
  await page.goto("/funding");
  await page
    .locator(".sp-related")
    .getByRole("link", { name: /Direct MT5 deposits/ })
    .click();
  await expect(page).toHaveURL(/\/mt5-deposits$/);
});
