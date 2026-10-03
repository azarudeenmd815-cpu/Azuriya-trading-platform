"use client";
import { memo, useRef } from "react";
import type { ChartLayout, Instrument } from "@azuriya/api-types";
import { useTerminal } from "@/lib/store";
import { chartCount } from "@/lib/workspace-model";
import { MarketChart } from "./market-chart";
import { Icon } from "./icons";
export function togglePanel(name: "markets" | "ticket" | "bottom") {
  const state = useTerminal.getState();
  state.updateConfig({
    panels: { ...state.config.panels, [name]: !state.config.panels[name] },
  });
}
export function openActivity(tab: string) {
  const state = useTerminal.getState();
  state.updateConfig({ panels: { ...state.config.panels, bottom: true } });
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent("azuriya:activity-tab", { detail: tab }),
    );
    document
      .querySelector<HTMLElement>(".activity-tabs button[aria-selected=true]")
      ?.focus();
  }, 0);
}
export function WorkspaceToolbar() {
  const config = useTerminal((state) => state.config);
  const update = useTerminal((state) => state.updateConfig),
    setLayout = useTerminal((state) => state.setLayout);
  return (
    <div className="workspace-toolbar">
      <div className="layout-options" role="group" aria-label="Chart layout">
        {(
          [
            { key: "SINGLE", label: "1 chart", icon: "single" },
            {
              key: "TWO_VERTICAL",
              label: "2 charts vertical",
              icon: "columns",
            },
            {
              key: "TWO_HORIZONTAL",
              label: "2 charts horizontal",
              icon: "rows",
            },
            { key: "GRID_4", label: "4 charts grid", icon: "grid" },
          ] as { key: ChartLayout; label: string; icon: string }[]
        ).map((item) => (
          <button
            key={item.key}
            aria-label={item.label}
            aria-pressed={config.layout === item.key}
            title={item.label}
            className={config.layout === item.key ? "active" : ""}
            onClick={() => setLayout(item.key)}
          >
            <Icon name={item.icon} size={14} />
          </button>
        ))}
      </div>
      <span className="toolbar-divider" />
      <label className="toolbar-check">
        <input
          type="checkbox"
          checked={config.sync.symbol}
          onChange={(event) =>
            update({ sync: { ...config.sync, symbol: event.target.checked } })
          }
        />
        Sync symbol
      </label>
      <label className="toolbar-check">
        <input
          type="checkbox"
          checked={config.sync.interval}
          onChange={(event) =>
            update({ sync: { ...config.sync, interval: event.target.checked } })
          }
        />
        Sync interval
      </label>
      <label className="toolbar-check ask-toggle">
        <input
          type="checkbox"
          checked={config.order_ticket.show_ask}
          onChange={(event) =>
            update({
              order_ticket: {
                ...config.order_ticket,
                show_ask: event.target.checked,
              },
            })
          }
        />
        Ask line
      </label>
      <div className="panel-toggles">
        {(
          [
            { key: "markets", label: "Markets", icon: "columns" },
            { key: "ticket", label: "Order ticket", icon: "ticket" },
            { key: "bottom", label: "Bottom panel", icon: "rows" },
          ] as const
        ).map((panel) => (
          <button
            key={panel.key}
            title={`Toggle ${panel.label}`}
            aria-label={`Toggle ${panel.label}`}
            aria-pressed={config.panels[panel.key]}
            className={config.panels[panel.key] ? "active" : ""}
            onClick={() => togglePanel(panel.key)}
          >
            <Icon name={panel.icon} size={13} />
            <span>{panel.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
export const ChartWorkspace = memo(function ChartWorkspace({
  instruments,
  accountId,
}: {
  instruments: Instrument[];
  accountId: string;
}) {
  const panes = useTerminal((state) => state.config.chart_panes),
    layout = useTerminal((state) => state.config.layout),
    selected = useTerminal((state) => state.config.selected_chart);
  return (
    <div
      className={`chart-layout layout-${layout.toLowerCase()}`}
      data-testid="chart-layout"
    >
      {panes.slice(0, chartCount(layout)).map((pane) => (
        <MarketChart
          key={pane.id}
          pane={pane}
          instruments={instruments}
          accountId={accountId}
          active={pane.id === selected}
        />
      ))}
    </div>
  );
});
export function ResizeHandle({
  panel,
}: {
  panel: "markets" | "ticket" | "bottom";
}) {
  const start = useRef<{ x: number; y: number; value: number } | undefined>(
    undefined,
  );
  const property =
    panel === "markets"
      ? "markets_width"
      : panel === "ticket"
        ? "ticket_width"
        : "bottom_height";
  const value = useTerminal((state) => state.config.panels[property]);
  const limits =
    panel === "markets"
      ? [200, 380]
      : panel === "ticket"
        ? [280, 440]
        : [130, 420];
  const change = (next: number) => {
    const state = useTerminal.getState();
    state.updateConfig({
      panels: {
        ...state.config.panels,
        [property]: Math.max(limits[0], Math.min(limits[1], Math.round(next))),
      },
    });
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${panel} panel`}
      aria-orientation={panel === "bottom" ? "horizontal" : "vertical"}
      aria-valuemin={limits[0]}
      aria-valuemax={limits[1]}
      aria-valuenow={value}
      className={`resize-handle resize-${panel}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, y: event.clientY, value };
      }}
      onPointerMove={(event) => {
        if (start.current)
          change(
            start.current.value +
              (panel === "bottom"
                ? start.current.y - event.clientY
                : panel === "ticket"
                  ? start.current.x - event.clientX
                  : event.clientX - start.current.x),
          );
      }}
      onPointerUp={() => {
        start.current = undefined;
      }}
      onPointerCancel={() => {
        start.current = undefined;
      }}
      onKeyDown={(event) => {
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          change(
            value + (["ArrowRight", "ArrowUp"].includes(event.key) ? 10 : -10),
          );
        }
      }}
    />
  );
}
