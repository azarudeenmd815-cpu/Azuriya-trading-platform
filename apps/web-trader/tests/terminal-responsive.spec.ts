import { expect, test, type Page } from "@playwright/test";
import type {
  EffectiveConfiguration,
  Instrument,
  Position,
  TradingAccount,
} from "@azuriya/api-types";

const viewports = [
  { width: 320, height: 640 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 901, height: 700 },
  { width: 1024, height: 768 },
  { width: 1100, height: 700 },
  { width: 1250, height: 700 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 844, height: 390 },
  { width: 1024, height: 500 },
];

async function expectWithinPage(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual((await page.viewportSize())!.width);
}

test("login and registration fit phone, tablet, desktop and landscape viewports", async ({
  page,
}) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 401,
      json: { code: "UNAUTHORIZED", message: "Sign in required" },
    }),
  );
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/terminal");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expectWithinPage(page);
    await page.getByRole("button", { name: "Create a workspace" }).click();
    await expect(page.getByLabel("Workspace name")).toBeVisible();
    await page.getByLabel("Email address").fill("responsive@example.test");
    await expectWithinPage(page);
    const field = await page.getByLabel("Email address").boundingBox();
    expect(field!.x).toBeGreaterThanOrEqual(0);
    expect(field!.x + field!.width).toBeLessThanOrEqual(viewport.width);
  }
});

test("read-only terminal keeps quotes, ticket, dialogs and multi-chart layouts within bounds", async ({
  page,
}) => {
  const account: TradingAccount = {
    id: "responsive-account",
    tenant_id: "responsive-tenant",
    user_id: "responsive-user",
    account_number: "12001001",
    name: "Responsive audit account",
    mode: "PROP_SIMULATED",
    status: "ACTIVE",
    currency: "USD",
    balance: "100000000.00",
    equity: "101240000.00",
    margin_used: "2100000.00",
    margin_free: "99140000.00",
    margin_level: "4820.00",
    leverage: "100",
    unrealized_pnl: "1240000.00",
    position_mode: "HEDGING",
  };
  const symbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "US100", "BTCUSD"];
  const instruments: Instrument[] = symbols.map((symbol, index) => ({
    id: `instrument-${index}`,
    tenant_id: account.tenant_id,
    symbol,
    display_name: symbol,
    asset_class: "FOREX",
    base_currency: symbol.slice(0, 3),
    quote_currency: "USD",
    digits: 5,
    tick_size: "0.00001",
    contract_size: "100000",
    min_quantity: "0.01",
    max_quantity: "100",
    quantity_step: "0.01",
    default_leverage: "100",
    trading_status: "OPEN",
  }));
  const position: Position = {
    id: "responsive-position",
    tenant_id: account.tenant_id,
    account_id: account.id,
    symbol: "EURUSD",
    side: "BUY",
    quantity: "0.10",
    open_price: "1.08120",
    current_price: "1.08130",
    unrealized_pnl: "1.00",
    realized_pnl: "0.00",
    margin_used: "108.12",
    stop_loss: "1.05000",
    take_profit: "1.11000",
    opened_at: "2026-10-02T00:00:00.000Z",
    status: "OPEN",
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/me"))
      data = {
        id: account.user_id,
        tenant_id: account.tenant_id,
        email: "responsive@example.test",
        role: "TRADER",
      };
    else if (path.endsWith("/accounts")) data = [account];
    else if (path.endsWith("/instruments")) data = instruments;
    else if (path.endsWith("/quotes"))
      data = symbols.map((symbol, index) => ({
        symbol,
        bid: "1.08130",
        ask: "1.08140",
        sequence: index + 1,
        timestamp: new Date().toISOString(),
      }));
    else if (path.endsWith("/positions")) data = [position];
    else if (path.endsWith("/effective-settings"))
      data = {
        account_id: account.id,
        symbol:
          new URL(route.request().url()).searchParams.get("symbol") || "EURUSD",
        trading_group_id: "responsive-group",
        trading_group_revision: 1,
        profile_revisions: {},
        effective_leverage: "100",
        session_status: "OPEN",
        pricing: {
          unit: "POINTS",
          bid_markup: "0",
          ask_markup: "0",
          minimum_spread: "0",
          maximum_spread: "0",
        },
        commission: { mode: "NONE", amount: "0", currency: "USD" },
        swap: {
          enabled: false,
          long_rate: "0",
          short_rate: "0",
          currency: "USD",
          timezone: "UTC",
          rollover_time: "00:00",
          triple_swap_day: 3,
          catch_up_days: 1,
        },
        margin: {
          margin_call_level: "100",
          stop_out_level: "50",
          stop_out_enabled: true,
        },
        execution: {
          latency_mode: "NONE",
          base_latency_ms: 0,
          slippage_mode: "NONE",
        },
        session: { timezone: "UTC", default_status: "OPEN", windows: [] },
      } satisfies EffectiveConfiguration;
    else if (route.request().method() !== "GET")
      return route.fulfill({
        status: 422,
        json: {
          code: "AUDIT_READ_ONLY",
          message: "Responsive audit is read-only",
        },
      });
    return route.fulfill({ json: data });
  });
  await page.routeWebSocket("**/api/v1/ws", (socket) =>
    socket.onMessage(() => {}),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/terminal");
  await expect(page.getByLabel("Trading account")).toBeVisible();
  await expect(page.getByText("LIVE", { exact: true })).toBeVisible();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expectWithinPage(page);
    const metricsBounds = await page.locator(".account-metrics").boundingBox();
    expect(metricsBounds!.x + metricsBounds!.width).toBeLessThanOrEqual(
      viewport.width,
    );
    const quoteClipping = await page
      .locator(".watch-select .watch-price")
      .evaluateAll(
        (prices) =>
          prices.filter(
            (price) =>
              price.getBoundingClientRect().right >
              price.closest(".watch-row-v2")!.getBoundingClientRect().right + 1,
          ).length,
      );
    expect(quoteClipping).toBe(0);
    const button = page.getByRole("button", {
      name: "Buy EURUSD",
      exact: true,
    });
    const previewBounds = await page.locator(".risk-preview").boundingBox();
    const buttonBounds = await button.boundingBox();
    expect(buttonBounds!.y).toBeGreaterThanOrEqual(
      previewBounds!.y + previewBounds!.height,
    );
    await page.getByLabel("Edit EURUSD protection").click();
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(19);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 19);
    expect(bounds!.y).toBeGreaterThanOrEqual(19);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      viewport.height - 19,
    );
    await page.getByLabel("Position stop loss").fill("1.05000");
    await page.getByLabel("Close dialog", { exact: true }).click();
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expectWithinPage(page);
    await page.getByRole("tab", { name: /^Positions/ }).click();
    await page.getByLabel("Open command palette").click();
    const palette = await page.locator(".command-palette").boundingBox();
    expect(palette!.y).toBeGreaterThanOrEqual(19);
    expect(palette!.y + palette!.height).toBeLessThanOrEqual(
      viewport.height - 19,
    );
    await page.getByLabel("Search commands").press("Escape");
  }
  await page.setViewportSize({ width: 320, height: 640 });
  for (const name of [
    "2 charts vertical",
    "2 charts horizontal",
    "4 charts grid",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expectWithinPage(page);
    for (const pane of await page.locator(".chart-pane").all()) {
      const bounds = await pane.boundingBox();
      expect(bounds!.width).toBeGreaterThan(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    }
  }
  expect(errors).toEqual([]);
});
