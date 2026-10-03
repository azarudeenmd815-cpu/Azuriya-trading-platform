package domain

import "github.com/shopspring/decimal"

// TradeRequest preserves the flat Phase 1 order JSON while adding server sizing.
// DISTANCE is an absolute price distance, not pips or a percentage.
type TradeRequest struct {
	OrderRequest
	QuantityMode   string           `json:"quantity_mode,omitempty"`
	RiskPercent    *decimal.Decimal `json:"risk_percent,omitempty"`
	RiskAmount     *decimal.Decimal `json:"risk_amount,omitempty"`
	StopLossMode   string           `json:"stop_loss_mode,omitempty"`
	TakeProfitMode string           `json:"take_profit_mode,omitempty"`
}

type OrderPreview struct {
	EstimatedEntry           decimal.Decimal  `json:"estimated_entry"`
	Quantity                 decimal.Decimal  `json:"quantity"`
	RiskAmount               decimal.Decimal  `json:"risk_amount"`
	RiskPercent              decimal.Decimal  `json:"risk_percent"`
	PotentialLoss            decimal.Decimal  `json:"potential_loss"`
	PotentialProfit          decimal.Decimal  `json:"potential_profit"`
	RiskReward               decimal.Decimal  `json:"risk_reward"`
	EstimatedMargin          decimal.Decimal  `json:"estimated_margin"`
	FreeMarginAfter          decimal.Decimal  `json:"free_margin_after"`
	DistanceToSL             decimal.Decimal  `json:"distance_to_sl"`
	DistanceToTP             decimal.Decimal  `json:"distance_to_tp"`
	StopLoss                 *decimal.Decimal `json:"stop_loss"`
	TakeProfit               *decimal.Decimal `json:"take_profit"`
	ValidationWarnings       []string         `json:"validation_warnings"`
	CanSubmit                bool             `json:"can_submit"`
	NonBinding               bool             `json:"non_binding"`
	QuoteSequence            uint64           `json:"quote_sequence"`
	EstimatedCommission      decimal.Decimal  `json:"estimated_commission"`
	EstimatedCloseCommission decimal.Decimal  `json:"estimated_close_commission"`
	EstimatedSwap            decimal.Decimal  `json:"estimated_swap"`
	EffectiveLeverage        decimal.Decimal  `json:"effective_leverage"`
	SessionStatus            string           `json:"session_status"`
}

// ModifyOrderRequest replaces protection as a pair: null clears a level.
// Omitted quantity and entry_price retain their existing values.
type ModifyOrderRequest struct {
	ClientOrderID string           `json:"client_order_id"`
	Quantity      *decimal.Decimal `json:"quantity,omitempty"`
	EntryPrice    *decimal.Decimal `json:"entry_price,omitempty"`
	StopLoss      *decimal.Decimal `json:"stop_loss"`
	TakeProfit    *decimal.Decimal `json:"take_profit"`
}

type ClosePreview struct {
	PositionID           string          `json:"position_id"`
	PositionQuantity     decimal.Decimal `json:"position_quantity"`
	RequestedQuantity    decimal.Decimal `json:"requested_quantity"`
	Quantity             decimal.Decimal `json:"quantity"`
	RemainingQuantity    decimal.Decimal `json:"remaining_quantity"`
	ActualPercentage     decimal.Decimal `json:"actual_percentage"`
	EstimatedPrice       decimal.Decimal `json:"estimated_price"`
	EstimatedRealizedPnL decimal.Decimal `json:"estimated_realized_pnl"`
	Adjusted             bool            `json:"adjusted"`
	ValidationWarnings   []string        `json:"validation_warnings"`
	NonBinding           bool            `json:"non_binding"`
	EstimatedCommission  decimal.Decimal `json:"estimated_commission"`
	EstimatedNetPnL      decimal.Decimal `json:"estimated_net_pnl"`
}

type BreakevenRequest struct {
	ClientOrderID string `json:"client_order_id"`
}
