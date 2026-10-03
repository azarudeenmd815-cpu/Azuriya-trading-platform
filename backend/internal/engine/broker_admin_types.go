package engine

import (
	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
	"time"
)

// BrokerMember is a server-supplied membership projection. Authentication
// repositories never include password hashes or session material in this type.
type BrokerMember struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenant_id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
type BrokerFilter struct {
	AccountID, Symbol, Side, Status, Search, Sort string
	Before                                        uint64
	Limit                                         int
	From, To                                      time.Time
}
type BrokerClient struct {
	BrokerMember
	AccountCount int        `json:"account_count"`
	LastActivity *time.Time `json:"last_activity,omitempty"`
}
type BrokerClientDetail struct {
	Client      BrokerClient     `json:"client"`
	Accounts    []domain.Account `json:"accounts"`
	Memberships []BrokerMember   `json:"memberships"`
	Activity    []domain.Event   `json:"activity"`
}
type BrokerExposure struct {
	Symbol              string          `json:"symbol"`
	LongQuantity        decimal.Decimal `json:"long_quantity"`
	ShortQuantity       decimal.Decimal `json:"short_quantity"`
	NetQuantity         decimal.Decimal `json:"net_quantity"`
	LongNotional        decimal.Decimal `json:"long_notional"`
	ShortNotional       decimal.Decimal `json:"short_notional"`
	NetNotional         decimal.Decimal `json:"net_notional"`
	NotionalCurrency    string          `json:"notional_currency"`
	UnrealizedClientPnL decimal.Decimal `json:"unrealized_client_pnl"`
	LongPositions       int             `json:"number_of_long_positions"`
	ShortPositions      int             `json:"number_of_short_positions"`
	Accounts            int             `json:"number_of_accounts"`
}
type BrokerRiskAccount struct {
	Account           domain.Account  `json:"account"`
	ClientEmail       string          `json:"client_email"`
	OpenPositions     int             `json:"open_positions"`
	MarginUtilization decimal.Decimal `json:"margin_utilization"`
	RiskStatus        string          `json:"risk_status"`
}
type BrokerDashboard struct {
	ExecutionMode      string           `json:"execution_mode"`
	Currency           string           `json:"currency"`
	Clients            int              `json:"clients"`
	ActiveAccounts     int              `json:"active_accounts"`
	OpenPositions      int              `json:"open_positions"`
	PendingOrders      int              `json:"pending_orders"`
	TotalBalance       decimal.Decimal  `json:"total_balance"`
	TotalEquity        decimal.Decimal  `json:"total_equity"`
	ClientFloatingPnL  decimal.Decimal  `json:"client_floating_pnl"`
	MarginCallAccounts int              `json:"margin_call_accounts"`
	Exposure           []BrokerExposure `json:"top_exposures"`
	RecentActions      []domain.Event   `json:"recent_actions"`
	UpdatedAt          time.Time        `json:"updated_at"`
}
type BrokerAccountDetail struct {
	Account      domain.Account       `json:"account"`
	Client       *BrokerMember        `json:"client,omitempty"`
	Positions    []domain.Position    `json:"positions"`
	Orders       []domain.Order       `json:"orders"`
	Fills        []domain.Fill        `json:"fills"`
	Transactions []domain.Transaction `json:"transactions"`
	Audit        []domain.Event       `json:"audit"`
	// Effective instrument policies are resolved by the backend, never React.
	Effective []any `json:"effective"`
}
