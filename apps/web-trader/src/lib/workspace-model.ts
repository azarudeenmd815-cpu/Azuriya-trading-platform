import type {
  ChartLayout,
  ChartPane,
  WorkspaceConfig,
} from "@azuriya/api-types";
export const DEFAULT_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "XAUUSD",
  "US100",
  "BTCUSD",
];
export function defaultWorkspaceConfig(): WorkspaceConfig {
  return {
    layout: "SINGLE",
    selected_account: "",
    selected_chart: "chart-1",
    selected_symbol: "EURUSD",
    selected_interval: "1m",
    chart_panes: DEFAULT_SYMBOLS.slice(0, 4).map((symbol, index) => ({
      id: `chart-${index + 1}`,
      symbol,
      interval: "1m",
    })),
    panels: {
      markets: true,
      ticket: true,
      bottom: true,
      markets_width: 245,
      ticket_width: 304,
      bottom_height: 240,
    },
    watchlist: {
      symbols: [...DEFAULT_SYMBOLS],
      favorites: ["EURUSD", "XAUUSD"],
      category: "All",
      compact: false,
    },
    sync: { symbol: false, interval: false },
    order_ticket: {
      quantity_mode: "LOTS",
      risk_mode: "PERCENT",
      quantity: "0.10",
      risk_value: "0.50",
      protection_mode: "PRICE",
      show_ask: false,
    },
  };
}
export const chartCount = (layout: ChartLayout) =>
  layout === "GRID_4" ? 4 : layout === "SINGLE" ? 1 : 2;
export function updatePane(
  config: WorkspaceConfig,
  id: string,
  patch: Partial<Pick<ChartPane, "symbol" | "interval">>,
): WorkspaceConfig {
  const panes = config.chart_panes.map((pane) => ({
    ...pane,
    ...(pane.id === id ? patch : {}),
    ...(config.sync.symbol && patch.symbol ? { symbol: patch.symbol } : {}),
    ...(config.sync.interval && patch.interval
      ? { interval: patch.interval }
      : {}),
  }));
  const selected =
    panes.find((pane) => pane.id === config.selected_chart) || panes[0];
  return {
    ...config,
    chart_panes: panes,
    selected_symbol: selected.symbol,
    selected_interval: selected.interval,
  };
}
export function withLayout(
  config: WorkspaceConfig,
  layout: ChartLayout,
): WorkspaceConfig {
  const panes = [...config.chart_panes];
  while (panes.length < chartCount(layout)) {
    const index = panes.length;
    panes.push({
      id: `chart-${index + 1}`,
      symbol: DEFAULT_SYMBOLS[index % DEFAULT_SYMBOLS.length],
      interval: "1m",
    });
  }
  const visible = panes.slice(0, chartCount(layout));
  const selected =
    visible.find((pane) => pane.id === config.selected_chart) || visible[0];
  return {
    ...config,
    layout,
    chart_panes: panes,
    selected_chart: selected.id,
    selected_symbol: selected.symbol,
    selected_interval: selected.interval,
  };
}
export function configFromWorkspace(
  workspace: WorkspaceConfig,
): WorkspaceConfig {
  const {
    layout,
    selected_account,
    chart_panes,
    selected_chart,
    selected_symbol,
    selected_interval,
    panels,
    watchlist,
    sync,
    order_ticket,
  } = workspace;
  const category =
    (
      {
        ALL: "All",
        FOREX: "FX",
        METAL: "Metals",
        INDEX: "Indices",
        CRYPTO: "Crypto",
      } as Record<string, string>
    )[watchlist.category] || watchlist.category;
  return structuredClone({
    layout,
    selected_account,
    chart_panes,
    selected_chart,
    selected_symbol,
    selected_interval,
    panels,
    watchlist: { ...watchlist, category },
    sync,
    order_ticket,
  });
}
