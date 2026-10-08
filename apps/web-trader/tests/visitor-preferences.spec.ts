import { expect, test } from "@playwright/test";

test("first visit suggests Portuguese by country and saves language and cookie choices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "azuriya_site_consent=; Path=/; Max-Age=0";
  });
  await page.route("**/api/site-locale", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ locale: "pt", source: "country" }),
    }),
  );
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Personalize a Azuriya" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Sugerido para a sua região", { exact: true }),
  ).toBeVisible();
  await dialog.locator("select").selectOption("pt");
  await dialog.getByRole("checkbox", { name: "Cookies opcionais" }).check();
  await dialog
    .getByRole("button", { name: "Aceitar cookies opcionais" })
    .click();

  await expect(page.locator("html")).toHaveAttribute("lang", "pt");
  await expect(page.locator(".az-hero-tagline")).toHaveText(
    "Criada para impulsionar seu negócio de trading.",
  );
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("azuriya:site-consent") ?? "{}"),
      ),
    )
    .toMatchObject({ essential: true, optionalAnalytics: true });
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain("azuriya_site_consent=");
});

test("a delayed country suggestion keeps the visitor's explicit header language choice", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.removeItem("azuriya:language"));
  let releaseSuggestion: () => void = () => {};
  const suggestion = new Promise<void>((resolve) => {
    releaseSuggestion = resolve;
  });
  await page.route("**/api/site-locale", async (route) => {
    await suggestion;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ locale: "pt", source: "country" }),
    });
  });
  await page.goto("/");
  await page.locator(".az-language-switch select").selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  const response = page.waitForResponse("**/api/site-locale");
  releaseSuggestion();
  await (await response).finished();
  await page.locator(".sf-preferences-trigger").click();
  await expect(page.locator(".sf-visitor-dialog")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator(".sf-language-field select")).toHaveValue("es");
});
