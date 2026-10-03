import { create } from "zustand";
import type {
  Quote,
  Candle,
  Workspace,
  WorkspaceConfig,
  ChartPane,
  ChartLayout,
} from "@azuriya/api-types";
import {
  configFromWorkspace,
  defaultWorkspaceConfig,
  updatePane,
  withLayout,
} from "./workspace-model";
export type Connection = "LIVE" | "RECONNECTING" | "OFFLINE";
interface TerminalState {
  symbol: string;
  accountId: string;
  connection: Connection;
  lastMessage: string;
  quotes: Record<string, Quote>;
  previousQuotes: Record<string, Quote>;
  history: Record<string, Quote[]>;
  candles: Record<string, Candle>;
  workspace?: Workspace;
  config: WorkspaceConfig;
  configVersion: number;
  savedVersion: number;
  loadWorkspace: (workspace: Workspace) => void;
  saveAcknowledged: (workspace: Workspace, version: number) => void;
  updateConfig: (patch: Partial<WorkspaceConfig>) => void;
  updateChart: (
    id: string,
    patch: Partial<Pick<ChartPane, "symbol" | "interval">>,
  ) => void;
  selectChart: (id: string) => void;
  setLayout: (layout: ChartLayout) => void;
  ingestCandle: (candle: Candle) => void;
  selectSymbol: (symbol: string) => void;
  selectAccount: (accountId: string) => void;
  setConnection: (connection: Connection) => void;
  ingest: (quote: Quote) => void;
  reset: () => void;
}
export const useTerminal = create<TerminalState>((set) => ({
  symbol: "EURUSD",
  accountId: "",
  connection: "OFFLINE",
  lastMessage: "",
  quotes: {},
  previousQuotes: {},
  history: {},
  candles: {},
  config: defaultWorkspaceConfig(),
  configVersion: 0,
  savedVersion: 0,
  loadWorkspace: (workspace) =>
    set({
      workspace,
      config: configFromWorkspace(workspace),
      symbol: workspace.selected_symbol,
      accountId: workspace.selected_account,
      configVersion: 0,
      savedVersion: 0,
    }),
  saveAcknowledged: (workspace, version) =>
    set((state) =>
      state.workspace?.id === workspace.id
        ? { workspace, savedVersion: version }
        : state,
    ),
  updateConfig: (patch) =>
    set((state) => ({
      config: { ...state.config, ...patch },
      configVersion: state.configVersion + 1,
    })),
  updateChart: (id, patch) =>
    set((state) => {
      const config = updatePane(state.config, id, patch);
      return {
        config,
        symbol: config.selected_symbol,
        configVersion: state.configVersion + 1,
      };
    }),
  selectChart: (id) =>
    set((state) => {
      const pane = state.config.chart_panes.find((item) => item.id === id);
      return pane
        ? {
            config: {
              ...state.config,
              selected_chart: id,
              selected_symbol: pane.symbol,
              selected_interval: pane.interval,
            },
            symbol: pane.symbol,
            configVersion: state.configVersion + 1,
          }
        : state;
    }),
  setLayout: (layout) =>
    set((state) => {
      const config = withLayout(state.config, layout);
      return {
        config,
        symbol: config.selected_symbol,
        configVersion: state.configVersion + 1,
      };
    }),
  selectSymbol: (symbol) =>
    set((state) => ({
      symbol,
      config: updatePane(state.config, state.config.selected_chart, { symbol }),
      configVersion: state.configVersion + 1,
    })),
  selectAccount: (accountId) =>
    set((state) => ({
      accountId,
      quotes: {},
      previousQuotes: {},
      history: {},
      config: { ...state.config, selected_account: accountId },
      configVersion: state.configVersion + 1,
    })),
  ingestCandle: (candle) =>
    set((state) => {
      const key = `${candle.symbol}:${candle.interval}`;
      const previous = state.candles[key];
      if (
        previous &&
        (candle.open_time < previous.open_time ||
          (candle.open_time === previous.open_time &&
            candle.sequence <= previous.sequence))
      )
        return state;
      return { candles: { ...state.candles, [key]: candle } };
    }),
  setConnection: (connection) => set({ connection }),
  ingest: (quote) =>
    set((state) => {
      if (
        !quote.symbol ||
        !quote.bid ||
        !quote.ask ||
        !Number.isSafeInteger(quote.sequence)
      )
        return state;
      const previous = state.quotes[quote.symbol];
      if (previous && quote.sequence <= previous.sequence) return state;
      return {
        quotes: { ...state.quotes, [quote.symbol]: quote },
        previousQuotes: {
          ...state.previousQuotes,
          ...(previous ? { [quote.symbol]: previous } : {}),
        },
        history: {
          ...state.history,
          [quote.symbol]: [
            ...(state.history[quote.symbol] || []).slice(-3599),
            quote,
          ],
        },
        lastMessage: quote.timestamp,
      };
    }),
  reset: () =>
    set({
      quotes: {},
      previousQuotes: {},
      history: {},
      candles: {},
      workspace: undefined,
      config: defaultWorkspaceConfig(),
      configVersion: 0,
      savedVersion: 0,
      symbol: "EURUSD",
      accountId: "",
      connection: "OFFLINE",
      lastMessage: "",
    }),
}));
