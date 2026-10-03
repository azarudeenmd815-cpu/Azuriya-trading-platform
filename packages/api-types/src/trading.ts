import type { Decimal, OrderRequest } from "./index";
export type QuantityMode = "LOTS" | "RISK_PERCENT" | "RISK_AMOUNT";
export type ProtectionMode = "PRICE" | "DISTANCE";
export interface TradeRequest extends Omit<OrderRequest, "quantity"> {
  quantity?: Decimal;
  quantity_mode?: QuantityMode;
  risk_percent?: Decimal;
  risk_amount?: Decimal;
  stop_loss_mode?: ProtectionMode;
  take_profit_mode?: ProtectionMode;
}
export interface OrderPreview {
  estimated_entry: Decimal;
  quantity: Decimal;
  risk_amount: Decimal;
  risk_percent: Decimal;
  potential_loss: Decimal;
  potential_profit: Decimal;
  risk_reward: Decimal;
  estimated_margin: Decimal;
  free_margin_after: Decimal;
  distance_to_sl: Decimal;
  distance_to_tp: Decimal;
  stop_loss?: Decimal | null;
  take_profit?: Decimal | null;
  validation_warnings: string[];
  non_binding: boolean;
  can_submit: boolean;
  quote_sequence: number;
  estimated_commission?: Decimal;
  estimated_close_commission?: Decimal;
  estimated_swap?: Decimal;
  effective_leverage?: Decimal;
  session_status?: "OPEN" | "CLOSE_ONLY" | "CLOSED";
}
export interface ClosePreview {
  position_id: string;
  position_quantity: Decimal;
  requested_quantity: Decimal;
  quantity: Decimal;
  remaining_quantity: Decimal;
  actual_percentage: Decimal;
  estimated_price: Decimal;
  estimated_realized_pnl: Decimal;
  adjusted: boolean;
  validation_warnings: string[];
  estimated_commission?: Decimal;
  estimated_net_pnl?: Decimal;
}
