package domain

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/shopspring/decimal"
)

const RecentEventLimit = 1000

type Identity struct {
	UserID   string
	TenantID string
	Role     string
}

const (
	ModePropSimulated          = "PROP_SIMULATED"
	ModeBrokerDemo             = "BROKER_DEMO"
	ModeBrokerLiveInternalized = "BROKER_LIVE_INTERNALIZED" // Defined for future adapters; disabled in Phase 1.
	PositionModeHedging        = "HEDGING"
	PositionModeNetting        = "NETTING" // Defined, but deliberately not implemented in Phase 1.
)

type Error struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

func (e *Error) Error() string { return e.Message }
func Err(code, message string) *Error {
	return &Error{Code: code, Message: message, Details: map[string]any{}}
}
func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("secure identifier generation failed: %v", err))
	}
	return hex.EncodeToString(b[:])
}
func MarketKey(tenantID, symbol string) string { return tenantID + ":" + symbol }
func D(s string) decimal.Decimal               { return decimal.RequireFromString(s) }

type Tenant struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
type TenantMembership struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Role     string `json:"role"`
}

type Account struct {
	ID                   string           `json:"id"`
	TenantID             string           `json:"tenant_id"`
	UserID               string           `json:"user_id"`
	AccountNumber        string           `json:"account_number"`
	Name                 string           `json:"name"`
	Mode                 string           `json:"mode"`
	Status               string           `json:"status"`
	Currency             string           `json:"currency"`
	PositionMode         string           `json:"position_mode"`
	Balance              decimal.Decimal  `json:"balance"`
	Equity               decimal.Decimal  `json:"equity"`
	UnrealizedPnL        decimal.Decimal  `json:"unrealized_pnl"`
	MarginUsed           decimal.Decimal  `json:"margin_used"`
	MarginFree           decimal.Decimal  `json:"margin_free"`
	MarginLevel          decimal.Decimal  `json:"margin_level"`
	MarginStatus         string           `json:"margin_status"`
	MarginNotifiedStatus string           `json:"margin_notified_status,omitempty"`
	Leverage             decimal.Decimal  `json:"leverage"`
	TradingGroupID       string           `json:"trading_group_id,omitempty"`
	MaxLeverageOverride  *decimal.Decimal `json:"max_leverage_override,omitempty"`
	CreatedAt            time.Time        `json:"created_at"`
	UpdatedAt            time.Time        `json:"updated_at"`
}
type Instrument struct {
	ID                string          `json:"id"`
	TenantID          string          `json:"tenant_id"`
	Symbol            string          `json:"symbol"`
	DisplayName       string          `json:"display_name"`
	AssetClass        string          `json:"asset_class"`
	BaseCurrency      string          `json:"base_currency"`
	QuoteCurrency     string          `json:"quote_currency"`
	Digits            int32           `json:"digits"`
	TickSize          decimal.Decimal `json:"tick_size"`
	ContractSize      decimal.Decimal `json:"contract_size"`
	MinQuantity       decimal.Decimal `json:"min_quantity"`
	MaxQuantity       decimal.Decimal `json:"max_quantity"`
	QuantityStep      decimal.Decimal `json:"quantity_step"`
	DefaultLeverage   decimal.Decimal `json:"default_leverage"`
	TradingStatus     string          `json:"trading_status"`
	SymbolGroupID     string          `json:"symbol_group_id,omitempty"`
	ProfileOverrides  ProfileRefs     `json:"profile_overrides"`
	PriceSourceSymbol string          `json:"price_source_symbol"`
	Description       string          `json:"description"`
	SortOrder         int             `json:"sort_order"`
	Revision          uint64          `json:"revision"`
}
type Quote struct {
	TenantID  string          `json:"tenant_id,omitempty"`
	Symbol    string          `json:"symbol"`
	Bid       decimal.Decimal `json:"bid"`
	Ask       decimal.Decimal `json:"ask"`
	Timestamp time.Time       `json:"timestamp"`
	Sequence  uint64          `json:"sequence"`
	Simulated bool            `json:"simulated"`
}
type OrderRequest struct {
	ClientOrderID string           `json:"client_order_id"`
	Symbol        string           `json:"symbol"`
	Side          string           `json:"side"`
	Type          string           `json:"type"`
	Quantity      decimal.Decimal  `json:"quantity"`
	TimeInForce   string           `json:"time_in_force,omitempty"`
	LimitPrice    *decimal.Decimal `json:"limit_price,omitempty"`
	StopPrice     *decimal.Decimal `json:"stop_price,omitempty"`
	StopLoss      *decimal.Decimal `json:"stop_loss,omitempty"`
	TakeProfit    *decimal.Decimal `json:"take_profit,omitempty"`
}
type CloseRequest struct {
	ClientOrderID string           `json:"client_order_id"`
	Quantity      *decimal.Decimal `json:"quantity,omitempty"`
	Percentage    *decimal.Decimal `json:"percentage,omitempty"`
}
type ProtectionRequest struct {
	StopLoss   *decimal.Decimal `json:"stop_loss"`
	TakeProfit *decimal.Decimal `json:"take_profit"`
}
type Order struct {
	ID                string           `json:"id"`
	ClientOrderID     string           `json:"client_order_id"`
	TenantID          string           `json:"tenant_id"`
	AccountID         string           `json:"account_id"`
	Symbol            string           `json:"symbol"`
	Side              string           `json:"side"`
	Type              string           `json:"type"`
	Status            string           `json:"status"`
	TimeInForce       string           `json:"time_in_force"`
	Quantity          decimal.Decimal  `json:"quantity"`
	RemainingQuantity decimal.Decimal  `json:"remaining_quantity"`
	RequestedPrice    *decimal.Decimal `json:"requested_price,omitempty"`
	LimitPrice        *decimal.Decimal `json:"limit_price,omitempty"`
	StopPrice         *decimal.Decimal `json:"stop_price,omitempty"`
	StopLoss          *decimal.Decimal `json:"stop_loss,omitempty"`
	TakeProfit        *decimal.Decimal `json:"take_profit,omitempty"`
	RejectCode        string           `json:"reject_code,omitempty"`
	RejectReason      string           `json:"reject_reason,omitempty"`
	PositionID        string           `json:"position_id,omitempty"`
	CreatedAt         time.Time        `json:"created_at"`
	UpdatedAt         time.Time        `json:"updated_at"`
}
type Fill struct {
	ID                     string          `json:"id"`
	TenantID               string          `json:"tenant_id"`
	OrderID                string          `json:"order_id"`
	AccountID              string          `json:"account_id"`
	PositionID             string          `json:"position_id"`
	Symbol                 string          `json:"symbol"`
	Side                   string          `json:"side"`
	Quantity               decimal.Decimal `json:"quantity"`
	Price                  decimal.Decimal `json:"price"`
	ReferenceBid           decimal.Decimal `json:"reference_bid"`
	ReferenceAsk           decimal.Decimal `json:"reference_ask"`
	ClientBid              decimal.Decimal `json:"client_bid"`
	ClientAsk              decimal.Decimal `json:"client_ask"`
	ExecutionReason        string          `json:"execution_reason"`
	ExecutionLatencyMS     int64           `json:"execution_latency_ms"`
	ExecutionProfileID     string          `json:"execution_profile_id"`
	LatencyMode            string          `json:"latency_mode"`
	SlippageMode           string          `json:"slippage_mode"`
	ExecutionMode          string          `json:"execution_mode"`
	PricingProfileID       string          `json:"pricing_profile_id"`
	QuoteSequence          uint64          `json:"quote_sequence"`
	CreatedAt              time.Time       `json:"created_at"`
	Commission             decimal.Decimal `json:"commission"`
	CommissionPlanID       string          `json:"commission_plan_id,omitempty"`
	CommissionPlanRevision uint64          `json:"commission_plan_revision"`
	TradingGroupID         string          `json:"trading_group_id,omitempty"`
	ConfigurationRevision  uint64          `json:"configuration_revision"`
}
type Position struct {
	ID              string             `json:"id"`
	TenantID        string             `json:"tenant_id"`
	AccountID       string             `json:"account_id"`
	Symbol          string             `json:"symbol"`
	Side            string             `json:"side"`
	Status          string             `json:"status"`
	Quantity        decimal.Decimal    `json:"quantity"`
	InitialQuantity decimal.Decimal    `json:"initial_quantity"`
	OpenPrice       decimal.Decimal    `json:"open_price"`
	CurrentPrice    decimal.Decimal    `json:"current_price"`
	UnrealizedPnL   decimal.Decimal    `json:"unrealized_pnl"`
	RealizedPnL     decimal.Decimal    `json:"realized_pnl"`
	MarginUsed      decimal.Decimal    `json:"margin_used"`
	StopLoss        *decimal.Decimal   `json:"stop_loss,omitempty"`
	TakeProfit      *decimal.Decimal   `json:"take_profit,omitempty"`
	OpenedAt        time.Time          `json:"opened_at"`
	ClosedAt        *time.Time         `json:"closed_at,omitempty"`
	Economics       *PositionEconomics `json:"economics,omitempty"`
	CommissionPaid  decimal.Decimal    `json:"commission_paid"`
	SwapAccrued     decimal.Decimal    `json:"swap_accrued"`
}
type Transaction struct {
	ID                string          `json:"id"`
	TenantID          string          `json:"tenant_id"`
	AccountID         string          `json:"account_id"`
	PositionID        string          `json:"position_id,omitempty"`
	Type              string          `json:"type"`
	Amount            decimal.Decimal `json:"amount"`
	Currency          string          `json:"currency"`
	BalanceAfter      decimal.Decimal `json:"balance_after"`
	CreatedAt         time.Time       `json:"created_at"`
	FillID            string          `json:"fill_id,omitempty"`
	ProfileID         string          `json:"profile_id,omitempty"`
	ActorUserID       string          `json:"actor_user_id,omitempty"`
	Reason            string          `json:"reason,omitempty"`
	Reference         string          `json:"reference,omitempty"`
	ClientOperationID string          `json:"client_operation_id,omitempty"`
	RolloverDate      string          `json:"rollover_date,omitempty"`
}
type Event struct {
	ID            string          `json:"id"`
	TenantID      string          `json:"tenant_id"`
	AccountID     string          `json:"account_id,omitempty"`
	UserID        string          `json:"user_id,omitempty"`
	ActorUserID   string          `json:"actor_user_id,omitempty"`
	ActorRole     string          `json:"actor_role,omitempty"`
	AggregateType string          `json:"aggregate_type"`
	AggregateID   string          `json:"aggregate_id"`
	Sequence      uint64          `json:"sequence"`
	Type          string          `json:"event_type"`
	Payload       json.RawMessage `json:"payload"`
	OccurredAt    time.Time       `json:"occurred_at"`
}
type IdempotencyRecord struct {
	Fingerprint  string          `json:"fingerprint"`
	ResourceID   string          `json:"resource_id"`
	Result       json.RawMessage `json:"result"`
	ErrorCode    string          `json:"error_code,omitempty"`
	ErrorMessage string          `json:"error_message,omitempty"`
}
type State struct {
	Accounts     map[string]Account           `json:"accounts"`
	Instruments  map[string]Instrument        `json:"instruments"`
	Quotes       map[string]Quote             `json:"quotes"`
	Orders       map[string]Order             `json:"orders"`
	Fills        map[string]Fill              `json:"fills"`
	Positions    map[string]Position          `json:"positions"`
	Transactions []Transaction                `json:"transactions"`
	Events       []Event                      `json:"events"`
	Idempotency  map[string]IdempotencyRecord `json:"idempotency"`
	Sequence     uint64                       `json:"sequence"`
	Broker       BrokerState                  `json:"broker"`
}

func EmptyState() State {
	return State{Accounts: map[string]Account{}, Instruments: map[string]Instrument{}, Quotes: map[string]Quote{}, Orders: map[string]Order{}, Fills: map[string]Fill{}, Positions: map[string]Position{}, Transactions: []Transaction{}, Events: []Event{}, Idempotency: map[string]IdempotencyRecord{}, Broker: EmptyBrokerState()}
}
