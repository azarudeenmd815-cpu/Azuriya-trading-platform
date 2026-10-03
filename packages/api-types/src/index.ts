/** Version 1 wire contracts. Financial values are decimal strings, never numbers. */
export * from "./workspace";
export type Decimal = string;
export * from "./trading";
export * from "./broker";
export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type AccountMode =
  | "PROP_SIMULATED"
  | "BROKER_DEMO"
  | "BROKER_LIVE_INTERNALIZED";
export interface User {
  id: string;
  email: string;
  tenant_id: string;
  role: string;
}
export interface TradingAccount {
  id: string;
  tenant_id: string;
  user_id: string;
  account_number: string;
  name: string;
  mode: AccountMode;
  status: "ACTIVE" | "READ_ONLY" | "SUSPENDED" | "CLOSED";
  currency: string;
  balance: Decimal;
  equity: Decimal;
  margin_used: Decimal;
  margin_free: Decimal;
  margin_level: Decimal;
  leverage: Decimal;
  unrealized_pnl: Decimal;
  position_mode: "HEDGING" | "NETTING";
  trading_group_id?: string;
  margin_status?: "NORMAL" | "MARGIN_CALL" | "STOP_OUT" | "STOP_OUT_REQUIRED";
  max_leverage_override?: Decimal | null;
}
export interface Instrument {
  id: string;
  tenant_id: string;
  symbol: string;
  display_name: string;
  asset_class: string;
  base_currency: string;
  quote_currency: string;
  digits: number;
  tick_size: Decimal;
  contract_size: Decimal;
  min_quantity: Decimal;
  max_quantity: Decimal;
  quantity_step: Decimal;
  default_leverage: Decimal;
  trading_status: "OPEN" | "CLOSE_ONLY" | "DISABLED" | "CLOSED";
}
export interface Quote {
  symbol: string;
  bid: Decimal;
  ask: Decimal;
  timestamp: string;
  sequence: number;
}
export interface Order {
  id: string;
  client_order_id: string;
  tenant_id: string;
  account_id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  status: string;
  time_in_force: "IOC" | "GTC";
  quantity: Decimal;
  remaining_quantity: Decimal;
  requested_price?: Decimal;
  limit_price?: Decimal;
  stop_price?: Decimal;
  stop_loss?: Decimal;
  take_profit?: Decimal;
  reject_code?: string;
  reject_reason?: string;
  created_at: string;
  updated_at: string;
}
export interface Position {
  id: string;
  tenant_id: string;
  account_id: string;
  symbol: string;
  side: Side;
  quantity: Decimal;
  open_price: Decimal;
  current_price: Decimal;
  unrealized_pnl: Decimal;
  realized_pnl: Decimal;
  margin_used: Decimal;
  stop_loss?: Decimal;
  take_profit?: Decimal;
  opened_at: string;
  closed_at?: string;
  status: string;
  commission_paid?: Decimal;
  swap_accrued?: Decimal;
}
export interface Fill {
  id: string;
  order_id: string;
  account_id: string;
  position_id: string;
  symbol: string;
  side: Side;
  quantity: Decimal;
  price: Decimal;
  reference_bid: Decimal;
  reference_ask: Decimal;
  execution_reason: string;
  execution_latency_ms: number;
  commission?: Decimal;
  created_at: string;
}
export interface AccountTransaction {
  id: string;
  account_id: string;
  type: string;
  amount: Decimal;
  balance_after?: Decimal;
  currency?: string;
  reason?: string;
  reference?: string;
  created_at: string;
}
export interface AuditEvent {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  sequence: number;
  event_type: string;
  payload: unknown;
  occurred_at: string;
}
export interface OrderRequest {
  client_order_id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: Decimal;
  limit_price?: Decimal;
  stop_price?: Decimal;
  stop_loss?: Decimal;
  take_profit?: Decimal;
  time_in_force?: "IOC" | "GTC";
}
export interface APIErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
export interface RealtimeEvent {
  account_id?: string;
  type: string;
  timestamp: string;
  sequence: number;
  payload: unknown;
}
