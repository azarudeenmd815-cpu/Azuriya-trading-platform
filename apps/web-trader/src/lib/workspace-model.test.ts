import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceConfig,
  updatePane,
  withLayout,
} from "./workspace-model";
describe("workspace configuration", () => {
  it("keeps chart settings independent until their sync setting is enabled", () => {
    let config = defaultWorkspaceConfig();
    config = updatePane(config, "chart-1", {
      symbol: "BTCUSD",
      interval: "4h",
    });
    expect(config.chart_panes[1].symbol).toBe("GBPUSD");
    expect(config.chart_panes[1].interval).toBe("1m");
    config.sync = { symbol: true, interval: true };
    config = updatePane(config, "chart-2", {
      symbol: "XAUUSD",
      interval: "15s",
    });
    expect(
      config.chart_panes.every(
        (pane) => pane.symbol === "XAUUSD" && pane.interval === "15s",
      ),
    ).toBe(true);
  });
  it("restores a visible active chart when a layout shrinks and preserves hidden panes", () => {
    const config = defaultWorkspaceConfig();
    config.selected_chart = "chart-4";
    const result = withLayout(config, "SINGLE");
    expect(result.selected_chart).toBe("chart-1");
    expect(result.chart_panes).toHaveLength(4);
  });
});
