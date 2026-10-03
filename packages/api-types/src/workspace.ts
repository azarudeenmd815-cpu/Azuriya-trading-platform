export const CANDLE_INTERVALS = [
  "1s",
  "5s",
  "15s",
  "30s",
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1D",
] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];
export interface Candle {
  symbol: string;
  interval: CandleInterval;
  open_time: string;
  close_time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  tick_volume: number;
  complete: boolean;
  sequence: number;
  simulated: true;
}
export type ChartLayout =
  | "SINGLE"
  | "TWO_VERTICAL"
  | "TWO_HORIZONTAL"
  | "GRID_4";
export interface ChartPane {
  id: string;
  symbol: string;
  interval: CandleInterval;
}
export interface WorkspacePanels {
  markets: boolean;
  ticket: boolean;
  bottom: boolean;
  markets_width: number;
  ticket_width: number;
  bottom_height: number;
}
export interface WorkspaceWatchlist {
  symbols: string[];
  favorites: string[];
  category: string;
  compact: boolean;
}
export interface TicketPreferences {
  quantity_mode: "LOTS" | "RISK";
  risk_mode: "PERCENT" | "AMOUNT";
  quantity: string;
  risk_value: string;
  protection_mode: "PRICE" | "DISTANCE";
  show_ask: boolean;
}
export interface WorkspaceConfig {
  layout: ChartLayout;
  selected_account: string;
  chart_panes: ChartPane[];
  selected_chart: string;
  selected_symbol: string;
  selected_interval: CandleInterval;
  panels: WorkspacePanels;
  watchlist: WorkspaceWatchlist;
  sync: { symbol: boolean; interval: boolean };
  order_ticket: TicketPreferences;
}
export interface Workspace extends WorkspaceConfig {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
