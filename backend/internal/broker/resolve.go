package broker

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/pricing"
	"github.com/shopspring/decimal"
	"time"
)

func overlay(dst *domain.ProfileRefs, src domain.ProfileRefs) {
	if src.PricingProfileID != "" {
		dst.PricingProfileID = src.PricingProfileID
	}
	if src.CommissionPlanID != "" {
		dst.CommissionPlanID = src.CommissionPlanID
	}
	if src.SwapPlanID != "" {
		dst.SwapPlanID = src.SwapPlanID
	}
	if src.LeveragePlanID != "" {
		dst.LeveragePlanID = src.LeveragePlanID
	}
	if src.MarginProfileID != "" {
		dst.MarginProfileID = src.MarginProfileID
	}
	if src.ExecutionProfileID != "" {
		dst.ExecutionProfileID = src.ExecutionProfileID
	}
	if src.TradingSessionProfileID != "" {
		dst.TradingSessionProfileID = src.TradingSessionProfileID
	}
}
func ResolveAccount(s *domain.State, a domain.Account, now time.Time) (domain.EffectiveConfiguration, error) {
	return Resolve(s, a, domain.Instrument{TenantID: a.TenantID, DefaultLeverage: a.Leverage}, now)
}
func Resolve(s *domain.State, a domain.Account, i domain.Instrument, now time.Time) (domain.EffectiveConfiguration, error) {
	c := Defaults(a, i)
	settings, ok := s.Broker.Settings[a.TenantID]
	if !ok {
		return c, domain.Err("BROKER_CONFIGURATION_UNAVAILABLE", "Tenant broker settings are unavailable")
	}
	c.ConfigurationRevision = settings.Revision
	selected, ok := s.Broker.Groups[settings.DefaultTradingGroupID]
	if !ok || selected.TenantID != a.TenantID || selected.Status != "ACTIVE" {
		return c, domain.Err("INVALID_GROUP", "Default group is unavailable")
	}
	overlay(&c.ProfileRefs, selected.ProfileRefs)
	if a.TradingGroupID != "" {
		selected, ok = s.Broker.Groups[a.TradingGroupID]
		if !ok || selected.TenantID != a.TenantID || selected.Status != "ACTIVE" {
			return c, domain.Err("INVALID_GROUP", "Account group is unavailable")
		}
		overlay(&c.ProfileRefs, selected.ProfileRefs)
	}
	c.TradingGroupID = selected.ID
	c.TradingGroupRevision = selected.Revision
	c.ConfigurationRevision += selected.Revision
	if i.SymbolGroupID != "" {
		category, ok := s.Broker.SymbolGroups[i.SymbolGroupID]
		if !ok || category.TenantID != a.TenantID {
			return c, domain.Err("SYMBOL_GROUP_NOT_FOUND", "Instrument category is unavailable")
		}
		overlay(&c.ProfileRefs, category.ProfileRefs)
		c.ConfigurationRevision += category.Revision
	}
	for _, r := range selected.SymbolRules {
		if r.SymbolGroupID != "" && r.SymbolGroupID == i.SymbolGroupID {
			overlay(&c.ProfileRefs, r.ProfileRefs)
		}
	}
	overlay(&c.ProfileRefs, i.ProfileOverrides)
	for _, r := range selected.SymbolRules {
		if r.Symbol != "" && r.Symbol == i.Symbol {
			overlay(&c.ProfileRefs, r.ProfileRefs)
		}
	}
	if err := ValidateReferences(s, a.TenantID, c.ProfileRefs); err != nil {
		return c, err
	}
	names := map[string]string{"PRICING": "pricing_profile_id", "COMMISSION": "commission_plan_id", "SWAP": "swap_plan_id", "LEVERAGE": "leverage_plan_id", "MARGIN": "margin_profile_id", "EXECUTION": "execution_profile_id", "SESSION": "trading_session_profile_id"}
	for kind, id := range References(c.ProfileRefs) {
		if id == "" {
			continue
		}
		p := s.Broker.Profiles[id].Clone()
		c.ProfileRevisions[names[kind]] = p.Revision
		c.ConfigurationRevision += p.Revision
		for _, o := range p.SymbolOverrides {
			if o.Symbol == i.Symbol {
				if o.Pricing != nil {
					p.Pricing = o.Pricing
				}
				if o.Commission != nil {
					p.Commission = o.Commission
				}
				if o.Swap != nil {
					p.Swap = o.Swap
				}
			}
		}
		switch kind {
		case "PRICING":
			c.Pricing = *p.Pricing
		case "COMMISSION":
			c.Commission = *p.Commission
		case "SWAP":
			c.Swap = *p.Swap
		case "LEVERAGE":
			c.Leverage = *p.Leverage
			c.EffectiveLeverage = c.Leverage.MaxLeverage
		case "MARGIN":
			c.Margin = *p.Margin
		case "EXECUTION":
			c.Execution = *p.Execution
		case "SESSION":
			c.Session = *p.Session
		}
	}
	for _, r := range c.Leverage.Rules {
		if r.AssetClass != "" && r.AssetClass == i.AssetClass {
			c.EffectiveLeverage = r.MaxLeverage
		}
	}
	for _, r := range c.Leverage.Rules {
		if r.SymbolGroupID != "" && r.SymbolGroupID == i.SymbolGroupID {
			c.EffectiveLeverage = r.MaxLeverage
		}
	}
	for _, r := range c.Leverage.Rules {
		if r.Symbol != "" && r.Symbol == i.Symbol {
			c.EffectiveLeverage = r.MaxLeverage
		}
	}
	c.EffectiveLeverage = decimal.Min(c.EffectiveLeverage, a.Leverage)
	if a.MaxLeverageOverride != nil {
		if !positive(*a.MaxLeverageOverride) {
			return c, domain.Err("INVALID_LEVERAGE", "Account leverage override must be positive")
		}
		c.EffectiveLeverage = decimal.Min(c.EffectiveLeverage, *a.MaxLeverageOverride)
	}
	if !positive(c.EffectiveLeverage) {
		return c, domain.Err("INVALID_LEVERAGE", "Effective leverage must be positive")
	}
	var err error
	c.SessionStatus, err = SessionStatus(c.Session, now)
	return c, err
}
func Price(reference domain.Quote, i domain.Instrument, c domain.EffectiveConfiguration) (domain.Quote, error) {
	p := c.Pricing
	factor := domain.D("1")
	if p.Unit == "POINTS" {
		factor = i.TickSize
	}
	bid := p.BidMarkup.Mul(factor)
	ask := p.AskMarkup.Mul(factor)
	minimum := p.MinimumSpread.Mul(factor)
	maximum := p.MaximumSpread.Mul(factor)
	if !i.TickSize.IsPositive() {
		return domain.Quote{}, domain.Err("INVALID_INSTRUMENT", "Instrument tick size is invalid")
	}
	for _, v := range []decimal.Decimal{bid, ask, minimum, maximum} {
		if !v.Mod(i.TickSize).IsZero() {
			return domain.Quote{}, domain.Err("INVALID_PRICING", "Pricing values must align to instrument tick size")
		}
	}
	return pricing.Apply(reference, pricing.Profile{ID: c.PricingProfileID, BidMarkup: bid, AskMarkup: ask, MinimumSpread: minimum, MaximumSpread: maximum})
}
func Commission(p domain.CommissionPolicy, quantity decimal.Decimal, closing bool) decimal.Decimal {
	if p.Mode == "NONE" || (closing && p.Mode == "PER_LOT_ROUND_TURN") {
		return decimal.Zero
	}
	return quantity.Mul(p.Amount)
}
func ClientStatus(s *domain.State, id domain.Identity) error {
	status := s.Broker.ClientStatuses[id.TenantID+":"+id.UserID]
	if status != "" && status != "ACTIVE" {
		return domain.Err("CLIENT_SUSPENDED", "Client membership is suspended")
	}
	return nil
}
