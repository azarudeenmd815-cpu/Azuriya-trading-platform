package domain

import (
	"github.com/shopspring/decimal"
	"time"
)

type ProfileRefs struct {
	PricingProfileID        string `json:"pricing_profile_id,omitempty"`
	CommissionPlanID        string `json:"commission_plan_id,omitempty"`
	SwapPlanID              string `json:"swap_plan_id,omitempty"`
	LeveragePlanID          string `json:"leverage_plan_id,omitempty"`
	MarginProfileID         string `json:"margin_profile_id,omitempty"`
	ExecutionProfileID      string `json:"execution_profile_id,omitempty"`
	TradingSessionProfileID string `json:"trading_session_profile_id,omitempty"`
}
type PricingPolicy struct {
	Unit          string          `json:"unit"`
	BidMarkup     decimal.Decimal `json:"bid_markup"`
	AskMarkup     decimal.Decimal `json:"ask_markup"`
	MinimumSpread decimal.Decimal `json:"minimum_spread"`
	MaximumSpread decimal.Decimal `json:"maximum_spread"`
}
type CommissionPolicy struct {
	Mode     string          `json:"mode"`
	Amount   decimal.Decimal `json:"amount"`
	Currency string          `json:"currency"`
}
type SwapPolicy struct {
	Enabled       bool            `json:"enabled"`
	LongRate      decimal.Decimal `json:"long_rate"`
	ShortRate     decimal.Decimal `json:"short_rate"`
	Currency      string          `json:"currency"`
	Timezone      string          `json:"timezone"`
	RolloverTime  string          `json:"rollover_time"`
	TripleSwapDay int             `json:"triple_swap_day"`
	CatchUpDays   int             `json:"catch_up_days"`
}
type LeverageRule struct {
	AssetClass    string          `json:"asset_class,omitempty"`
	SymbolGroupID string          `json:"symbol_group_id,omitempty"`
	Symbol        string          `json:"symbol,omitempty"`
	MaxLeverage   decimal.Decimal `json:"max_leverage"`
}
type LeveragePolicy struct {
	MaxLeverage decimal.Decimal `json:"max_leverage"`
	Rules       []LeverageRule  `json:"rules"`
}
type MarginPolicy struct {
	MarginCallLevel decimal.Decimal `json:"margin_call_level"`
	StopOutLevel    decimal.Decimal `json:"stop_out_level"`
	StopOutEnabled  bool            `json:"stop_out_enabled"`
}
type ExecutionPolicy struct {
	LatencyMode   string `json:"latency_mode"`
	BaseLatencyMS int64  `json:"base_latency_ms"`
	SlippageMode  string `json:"slippage_mode"`
}
type SessionWindow struct {
	Day    int    `json:"day"`
	Start  string `json:"start"`
	End    string `json:"end"`
	Status string `json:"status"`
}
type SessionPolicy struct {
	Timezone      string          `json:"timezone"`
	DefaultStatus string          `json:"default_status"`
	Windows       []SessionWindow `json:"windows"`
}
type BrokerProfileSymbolOverride struct {
	Symbol     string            `json:"symbol"`
	Pricing    *PricingPolicy    `json:"pricing,omitempty"`
	Commission *CommissionPolicy `json:"commission,omitempty"`
	Swap       *SwapPolicy       `json:"swap,omitempty"`
}
type BrokerProfile struct {
	ID              string                        `json:"id"`
	TenantID        string                        `json:"tenant_id"`
	Kind            string                        `json:"kind"`
	Name            string                        `json:"name"`
	Description     string                        `json:"description"`
	Status          string                        `json:"status"`
	Revision        uint64                        `json:"revision"`
	Pricing         *PricingPolicy                `json:"pricing,omitempty"`
	Commission      *CommissionPolicy             `json:"commission,omitempty"`
	Swap            *SwapPolicy                   `json:"swap,omitempty"`
	Leverage        *LeveragePolicy               `json:"leverage,omitempty"`
	Margin          *MarginPolicy                 `json:"margin,omitempty"`
	Execution       *ExecutionPolicy              `json:"execution,omitempty"`
	Session         *SessionPolicy                `json:"session,omitempty"`
	SymbolOverrides []BrokerProfileSymbolOverride `json:"symbol_overrides"`
	CreatedAt       time.Time                     `json:"created_at"`
	UpdatedAt       time.Time                     `json:"updated_at"`
}
type SymbolRule struct {
	SymbolGroupID string `json:"symbol_group_id,omitempty"`
	Symbol        string `json:"symbol,omitempty"`
	ProfileRefs
}
type TradingGroup struct {
	ID          string `json:"id"`
	TenantID    string `json:"tenant_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      string `json:"status"`
	ProfileRefs
	SymbolRules []SymbolRule `json:"symbol_rules"`
	Revision    uint64       `json:"revision"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}
type SymbolGroup struct {
	ID          string `json:"id"`
	TenantID    string `json:"tenant_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	ProfileRefs
	Revision  uint64    `json:"revision"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
type BrokerSettings struct {
	TenantID              string    `json:"tenant_id"`
	BrokerName            string    `json:"broker_name"`
	BaseCurrency          string    `json:"base_currency"`
	DefaultTradingGroupID string    `json:"default_trading_group_id"`
	Timezone              string    `json:"timezone"`
	SupportEmail          string    `json:"support_email"`
	TradingEnabled        bool      `json:"trading_enabled"`
	Revision              uint64    `json:"revision"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}
type RolloverCheckpoint struct {
	PositionID string          `json:"position_id"`
	LocalDate  string          `json:"local_date"`
	SwapPlanID string          `json:"swap_plan_id"`
	RolloverAt time.Time       `json:"rollover_at"`
	Amount     decimal.Decimal `json:"amount"`
}
type BrokerState struct {
	Settings       map[string]BrokerSettings     `json:"settings"`
	Profiles       map[string]BrokerProfile      `json:"profiles"`
	Groups         map[string]TradingGroup       `json:"groups"`
	SymbolGroups   map[string]SymbolGroup        `json:"symbol_groups"`
	ClientStatuses map[string]string             `json:"client_statuses"`
	RolloverKeys   map[string]RolloverCheckpoint `json:"rollover_keys"`
}

func EmptyBrokerState() BrokerState {
	return BrokerState{Settings: map[string]BrokerSettings{}, Profiles: map[string]BrokerProfile{}, Groups: map[string]TradingGroup{}, SymbolGroups: map[string]SymbolGroup{}, ClientStatuses: map[string]string{}, RolloverKeys: map[string]RolloverCheckpoint{}}
}

type EffectiveConfiguration struct {
	AccountID             string `json:"account_id"`
	Symbol                string `json:"symbol"`
	TradingGroupID        string `json:"trading_group_id"`
	TradingGroupRevision  uint64 `json:"trading_group_revision"`
	ConfigurationRevision uint64 `json:"configuration_revision"`
	ProfileRefs
	ProfileRevisions  map[string]uint64 `json:"profile_revisions"`
	EffectiveLeverage decimal.Decimal   `json:"effective_leverage"`
	SessionStatus     string            `json:"session_status"`
	Pricing           PricingPolicy     `json:"pricing"`
	Commission        CommissionPolicy  `json:"commission"`
	Swap              SwapPolicy        `json:"swap"`
	Leverage          LeveragePolicy    `json:"leverage"`
	Margin            MarginPolicy      `json:"margin"`
	Execution         ExecutionPolicy   `json:"execution"`
	Session           SessionPolicy     `json:"session"`
}
type PositionEconomics struct {
	ContractSize           decimal.Decimal  `json:"contract_size"`
	QuoteCurrency          string           `json:"quote_currency"`
	CommissionPlanID       string           `json:"commission_plan_id"`
	CommissionPlanRevision uint64           `json:"commission_plan_revision"`
	Commission             CommissionPolicy `json:"commission"`
}

func (p BrokerProfile) Clone() BrokerProfile {
	if p.Pricing != nil {
		v := *p.Pricing
		p.Pricing = &v
	}
	if p.Commission != nil {
		v := *p.Commission
		p.Commission = &v
	}
	if p.Swap != nil {
		v := *p.Swap
		p.Swap = &v
	}
	if p.Leverage != nil {
		v := *p.Leverage
		v.Rules = append([]LeverageRule{}, v.Rules...)
		p.Leverage = &v
	}
	if p.Margin != nil {
		v := *p.Margin
		p.Margin = &v
	}
	if p.Execution != nil {
		v := *p.Execution
		p.Execution = &v
	}
	if p.Session != nil {
		v := *p.Session
		v.Windows = append([]SessionWindow{}, v.Windows...)
		p.Session = &v
	}
	p.SymbolOverrides = append([]BrokerProfileSymbolOverride{}, p.SymbolOverrides...)
	for n, v := range p.SymbolOverrides {
		if v.Pricing != nil {
			c := *v.Pricing
			v.Pricing = &c
		}
		if v.Commission != nil {
			c := *v.Commission
			v.Commission = &c
		}
		if v.Swap != nil {
			c := *v.Swap
			v.Swap = &c
		}
		p.SymbolOverrides[n] = v
	}
	return p
}
func (g TradingGroup) Clone() TradingGroup {
	g.SymbolRules = append([]SymbolRule{}, g.SymbolRules...)
	return g
}
func (b BrokerState) Clone() BrokerState {
	c := EmptyBrokerState()
	for k, v := range b.Settings {
		c.Settings[k] = v
	}
	for k, v := range b.Profiles {
		c.Profiles[k] = v.Clone()
	}
	for k, v := range b.Groups {
		c.Groups[k] = v.Clone()
	}
	for k, v := range b.SymbolGroups {
		c.SymbolGroups[k] = v
	}
	for k, v := range b.ClientStatuses {
		c.ClientStatuses[k] = v
	}
	for k, v := range b.RolloverKeys {
		c.RolloverKeys[k] = v
	}
	return c
}
