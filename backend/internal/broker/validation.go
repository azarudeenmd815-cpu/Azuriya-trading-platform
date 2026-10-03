package broker

import (
	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
	"strings"
	"time"
)

func nonnegative(values ...decimal.Decimal) bool {
	for _, v := range values {
		if !domain.ValidInputDecimal(v) || v.IsNegative() {
			return false
		}
	}
	return true
}
func positive(v decimal.Decimal) bool {
	return domain.ValidInputDecimal(v) && v.IsPositive() && v.LessThanOrEqual(domain.D("1000000"))
}
func ValidName(name string) bool {
	return strings.TrimSpace(name) == name && len(name) >= 1 && len(name) <= 100
}
func validatePricing(p domain.PricingPolicy) error {
	if (p.Unit != "PRICE" && p.Unit != "POINTS") || !nonnegative(p.BidMarkup, p.AskMarkup, p.MinimumSpread, p.MaximumSpread) || (p.MaximumSpread.IsPositive() && p.MinimumSpread.GreaterThan(p.MaximumSpread)) {
		return domain.Err("INVALID_PRICING", "Pricing unit and nonnegative spread bounds are invalid")
	}
	return nil
}
func validateCommission(p domain.CommissionPolicy) error {
	if !nonnegative(p.Amount) || p.Currency != "USD" || (p.Mode != "NONE" && p.Mode != "PER_LOT_PER_SIDE" && p.Mode != "PER_LOT_ROUND_TURN") || (p.Mode == "NONE" && !p.Amount.IsZero()) {
		return domain.Err("INVALID_COMMISSION", "Commission requires a supported mode, USD, and nonnegative amount")
	}
	return nil
}
func validateSwap(p domain.SwapPolicy) error {
	if !domain.ValidInputDecimal(p.LongRate) || !domain.ValidInputDecimal(p.ShortRate) || p.Currency != "USD" || p.TripleSwapDay < 0 || p.TripleSwapDay > 6 || p.CatchUpDays < 1 || p.CatchUpDays > 31 {
		return domain.Err("INVALID_SWAP", "Swap rates, currency, triple day, or catch-up bound is invalid")
	}
	if _, err := time.LoadLocation(p.Timezone); err != nil {
		return domain.Err("INVALID_TIMEZONE", "Use a valid IANA timezone")
	}
	_, err := minuteClock(p.RolloverTime, false)
	return err
}
func ValidateProfile(p domain.BrokerProfile) error {
	if p.TenantID == "" || !ValidName(p.Name) || len(p.Description) > 2000 || (p.Status != "ACTIVE" && p.Status != "DISABLED") {
		return domain.Err("INVALID_PROFILE", "Profile tenant, name, description, or status is invalid")
	}
	count := 0
	for _, ok := range []bool{p.Pricing != nil, p.Commission != nil, p.Swap != nil, p.Leverage != nil, p.Margin != nil, p.Execution != nil, p.Session != nil} {
		if ok {
			count++
		}
	}
	if count != 1 {
		return domain.Err("INVALID_PROFILE", "Exactly one typed profile payload is required")
	}
	var err error
	switch p.Kind {
	case "PRICING":
		if p.Pricing == nil {
			break
		}
		err = validatePricing(*p.Pricing)
	case "COMMISSION":
		if p.Commission == nil {
			break
		}
		err = validateCommission(*p.Commission)
	case "SWAP":
		if p.Swap == nil {
			break
		}
		err = validateSwap(*p.Swap)
	case "LEVERAGE":
		if p.Leverage == nil {
			break
		}
		if !positive(p.Leverage.MaxLeverage) || len(p.Leverage.Rules) > 1000 {
			return domain.Err("INVALID_LEVERAGE", "Leverage must be positive and rules bounded")
		}
		seen := map[string]bool{}
		for _, r := range p.Leverage.Rules {
			selectors := 0
			key := ""
			if r.AssetClass != "" {
				selectors++
				key = "asset:" + r.AssetClass
			}
			if r.SymbolGroupID != "" {
				selectors++
				key = "group:" + r.SymbolGroupID
			}
			if r.Symbol != "" {
				selectors++
				key = "symbol:" + r.Symbol
			}
			if selectors != 1 || seen[key] || !positive(r.MaxLeverage) {
				return domain.Err("INVALID_LEVERAGE", "Leverage rules require unique single selectors and positive limits")
			}
			seen[key] = true
		}
		return nil
	case "MARGIN":
		if p.Margin == nil {
			break
		}
		if !nonnegative(p.Margin.MarginCallLevel, p.Margin.StopOutLevel) || p.Margin.MarginCallLevel.LessThan(p.Margin.StopOutLevel) || p.Margin.MarginCallLevel.GreaterThan(domain.D("1000000")) {
			return domain.Err("INVALID_MARGIN_PROFILE", "Margin thresholds must be ordered nonnegative percentages")
		}
		return nil
	case "EXECUTION":
		if p.Execution == nil {
			break
		}
		x := p.Execution
		if (x.LatencyMode != "NONE" && x.LatencyMode != "FIXED") || x.SlippageMode != "NONE" || x.BaseLatencyMS < 0 || x.BaseLatencyMS > 5000 || (x.LatencyMode == "NONE" && x.BaseLatencyMS != 0) {
			return domain.Err("INVALID_EXECUTION_PROFILE", "Only NONE/FIXED simulated latency and NONE slippage are supported")
		}
		return nil
	case "SESSION":
		if p.Session == nil {
			break
		}
		_, err = sessionWindows(*p.Session)
	default:
		return domain.Err("INVALID_PROFILE_KIND", "Unsupported broker profile kind")
	}
	matched := (p.Kind == "PRICING" && p.Pricing != nil) || (p.Kind == "COMMISSION" && p.Commission != nil) || (p.Kind == "SWAP" && p.Swap != nil) || (p.Kind == "SESSION" && p.Session != nil)
	if !matched {
		return domain.Err("INVALID_PROFILE", "Profile kind does not match its typed payload")
	}
	if err != nil {
		return err
	}
	if len(p.SymbolOverrides) > 1000 {
		return domain.Err("INVALID_PROFILE", "Too many symbol overrides")
	}
	seen := map[string]bool{}
	for _, o := range p.SymbolOverrides {
		count := 0
		if o.Pricing != nil {
			count++
		}
		if o.Commission != nil {
			count++
		}
		if o.Swap != nil {
			count++
		}
		if o.Symbol == "" || len(o.Symbol) > 32 || seen[o.Symbol] || count != 1 {
			return domain.Err("INVALID_PROFILE", "Symbol overrides must have unique symbols and exactly one payload")
		}
		seen[o.Symbol] = true
		switch p.Kind {
		case "PRICING":
			if o.Pricing == nil {
				return domain.Err("INVALID_PROFILE", "Override must match pricing kind")
			}
			err = validatePricing(*o.Pricing)
		case "COMMISSION":
			if o.Commission == nil {
				return domain.Err("INVALID_PROFILE", "Override must match commission kind")
			}
			err = validateCommission(*o.Commission)
		case "SWAP":
			if o.Swap == nil {
				return domain.Err("INVALID_PROFILE", "Override must match swap kind")
			}
			err = validateSwap(*o.Swap)
		default:
			return domain.Err("INVALID_PROFILE", "This kind does not permit symbol overrides")
		}
		if err != nil {
			return err
		}
	}
	return nil
}
func References(refs domain.ProfileRefs) map[string]string {
	return map[string]string{"PRICING": refs.PricingProfileID, "COMMISSION": refs.CommissionPlanID, "SWAP": refs.SwapPlanID, "LEVERAGE": refs.LeveragePlanID, "MARGIN": refs.MarginProfileID, "EXECUTION": refs.ExecutionProfileID, "SESSION": refs.TradingSessionProfileID}
}
func ValidateReferences(s *domain.State, tenant string, refs domain.ProfileRefs) error {
	for kind, id := range References(refs) {
		if id == "" {
			continue
		}
		p, ok := s.Broker.Profiles[id]
		if !ok || p.TenantID != tenant || p.Kind != kind || p.Status != "ACTIVE" {
			return domain.Err("INVALID_PROFILE_REFERENCE", "Profile reference is missing, disabled, foreign, or of the wrong kind")
		}
		if err := ValidateProfile(p); err != nil {
			return err
		}
	}
	return nil
}
func ValidateGroup(s *domain.State, g domain.TradingGroup) error {
	if g.TenantID == "" || !ValidName(g.Name) || len(g.Description) > 2000 || (g.Status != "ACTIVE" && g.Status != "DISABLED") || len(g.SymbolRules) > 1000 {
		return domain.Err("INVALID_GROUP", "Trading group metadata is invalid")
	}
	if err := ValidateReferences(s, g.TenantID, g.ProfileRefs); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, r := range g.SymbolRules {
		key := "symbol:" + r.Symbol
		if (r.Symbol == "") == (r.SymbolGroupID == "") {
			return domain.Err("INVALID_GROUP", "Each group rule needs exactly one selector")
		}
		if r.SymbolGroupID != "" {
			key = "group:" + r.SymbolGroupID
			category, ok := s.Broker.SymbolGroups[r.SymbolGroupID]
			if !ok || category.TenantID != g.TenantID {
				return domain.Err("SYMBOL_GROUP_NOT_FOUND", "Symbol category not found")
			}
		} else {
			if _, ok := s.Instruments[domain.MarketKey(g.TenantID, r.Symbol)]; !ok {
				return domain.Err("INSTRUMENT_NOT_FOUND", "Rule instrument not found")
			}
		}
		if seen[key] {
			return domain.Err("INVALID_GROUP", "Duplicate group selector")
		}
		seen[key] = true
		if err := ValidateReferences(s, g.TenantID, r.ProfileRefs); err != nil {
			return err
		}
	}
	return nil
}
func ValidateSymbolGroup(s *domain.State, g domain.SymbolGroup) error {
	if g.TenantID == "" || !ValidName(g.Name) || len(g.Description) > 2000 {
		return domain.Err("INVALID_SYMBOL_GROUP", "Category metadata is invalid")
	}
	return ValidateReferences(s, g.TenantID, g.ProfileRefs)
}
func ValidateSettings(s *domain.State, x domain.BrokerSettings) error {
	if x.TenantID == "" || !ValidName(x.BrokerName) || x.BaseCurrency != "USD" || len(x.SupportEmail) > 254 {
		return domain.Err("INVALID_SETTINGS", "Broker settings are invalid")
	}
	if _, err := time.LoadLocation(x.Timezone); err != nil {
		return domain.Err("INVALID_TIMEZONE", "Use a valid IANA timezone")
	}
	g, ok := s.Broker.Groups[x.DefaultTradingGroupID]
	if !ok || g.TenantID != x.TenantID || g.Status != "ACTIVE" {
		return domain.Err("INVALID_GROUP", "Default trading group must be active in this tenant")
	}
	return nil
}
