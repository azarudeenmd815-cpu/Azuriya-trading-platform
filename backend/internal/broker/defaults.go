// Package broker resolves validated tenant trading policies without transport or storage dependencies.
package broker

import (
	"azuriya/backend/internal/domain"
	"time"
)

func DefaultProfileID(tenant, kind string) string { return "default:" + tenant + ":" + kind }
func DefaultGroupID(tenant string) string         { return "default:" + tenant + ":group" }
func Defaults(a domain.Account, i domain.Instrument) domain.EffectiveConfiguration {
	leverage := i.DefaultLeverage
	if !leverage.IsPositive() {
		leverage = domain.D("100")
	}
	return domain.EffectiveConfiguration{AccountID: a.ID, Symbol: i.Symbol, ProfileRevisions: map[string]uint64{}, EffectiveLeverage: leverage, Pricing: domain.PricingPolicy{Unit: "PRICE"}, Commission: domain.CommissionPolicy{Mode: "NONE", Currency: "USD"}, Swap: domain.SwapPolicy{Currency: "USD", Timezone: "UTC", RolloverTime: "00:00", TripleSwapDay: 3, CatchUpDays: 7}, Leverage: domain.LeveragePolicy{MaxLeverage: leverage, Rules: []domain.LeverageRule{}}, Margin: domain.MarginPolicy{MarginCallLevel: domain.D("100"), StopOutLevel: domain.D("50")}, Execution: domain.ExecutionPolicy{LatencyMode: "NONE", SlippageMode: "NONE"}, Session: domain.SessionPolicy{Timezone: "UTC", DefaultStatus: "OPEN", Windows: []domain.SessionWindow{}}}
}

// Ensure adds defaults to legacy snapshots without replacing existing state.
func Ensure(s *domain.State) {
	if s.Broker.Settings == nil {
		s.Broker.Settings = map[string]domain.BrokerSettings{}
	}
	if s.Broker.Profiles == nil {
		s.Broker.Profiles = map[string]domain.BrokerProfile{}
	}
	if s.Broker.Groups == nil {
		s.Broker.Groups = map[string]domain.TradingGroup{}
	}
	if s.Broker.SymbolGroups == nil {
		s.Broker.SymbolGroups = map[string]domain.SymbolGroup{}
	}
	if s.Broker.ClientStatuses == nil {
		s.Broker.ClientStatuses = map[string]string{}
	}
	if s.Broker.RolloverKeys == nil {
		s.Broker.RolloverKeys = map[string]domain.RolloverCheckpoint{}
	}
	tenants := map[string]time.Time{}
	for _, a := range s.Accounts {
		at, ok := tenants[a.TenantID]
		if !ok || a.CreatedAt.Before(at) {
			tenants[a.TenantID] = a.CreatedAt
		}
	}
	for key, i := range s.Instruments {
		if _, ok := tenants[i.TenantID]; !ok {
			tenants[i.TenantID] = time.Unix(0, 0).UTC()
		}
		if i.Revision == 0 {
			i.Revision = 1
		}
		if i.PriceSourceSymbol == "" {
			i.PriceSourceSymbol = i.Symbol
		}
		s.Instruments[key] = i
	}
	for tenant := range s.Broker.Settings {
		if _, ok := tenants[tenant]; !ok {
			tenants[tenant] = time.Unix(0, 0).UTC()
		}
	}
	for tenant, now := range tenants {
		d := Defaults(domain.Account{}, domain.Instrument{})
		profiles := []domain.BrokerProfile{{Kind: "PRICING", Pricing: &d.Pricing}, {Kind: "COMMISSION", Commission: &d.Commission}, {Kind: "SWAP", Swap: &d.Swap}, {Kind: "LEVERAGE", Leverage: &d.Leverage}, {Kind: "MARGIN", Margin: &d.Margin}, {Kind: "EXECUTION", Execution: &d.Execution}, {Kind: "SESSION", Session: &d.Session}}
		for _, p := range profiles {
			p.ID = DefaultProfileID(tenant, p.Kind)
			p.TenantID = tenant
			p.Name = "Default " + p.Kind
			p.Status = "ACTIVE"
			p.Revision = 1
			p.CreatedAt = now
			p.UpdatedAt = now
			p.SymbolOverrides = []domain.BrokerProfileSymbolOverride{}
			if _, ok := s.Broker.Profiles[p.ID]; !ok {
				s.Broker.Profiles[p.ID] = p
			}
		}
		gid := DefaultGroupID(tenant)
		if _, ok := s.Broker.Groups[gid]; !ok {
			s.Broker.Groups[gid] = domain.TradingGroup{ID: gid, TenantID: tenant, Name: "Default simulated", Status: "ACTIVE", Revision: 1, CreatedAt: now, UpdatedAt: now, SymbolRules: []domain.SymbolRule{}, ProfileRefs: domain.ProfileRefs{PricingProfileID: DefaultProfileID(tenant, "PRICING"), CommissionPlanID: DefaultProfileID(tenant, "COMMISSION"), SwapPlanID: DefaultProfileID(tenant, "SWAP"), MarginProfileID: DefaultProfileID(tenant, "MARGIN"), ExecutionProfileID: DefaultProfileID(tenant, "EXECUTION"), TradingSessionProfileID: DefaultProfileID(tenant, "SESSION")}}
		}
		if _, ok := s.Broker.Settings[tenant]; !ok {
			s.Broker.Settings[tenant] = domain.BrokerSettings{TenantID: tenant, BrokerName: "Azuriya", BaseCurrency: "USD", DefaultTradingGroupID: gid, Timezone: "UTC", TradingEnabled: true, Revision: 1, CreatedAt: now, UpdatedAt: now}
		}
	}
	for id, p := range s.Broker.Profiles {
		if p.Status == "" {
			p.Status = "ACTIVE"
		}
		if p.Revision == 0 {
			p.Revision = 1
		}
		s.Broker.Profiles[id] = p
	}
	for id, g := range s.Broker.Groups {
		if g.Status == "" {
			g.Status = "ACTIVE"
		}
		if g.Revision == 0 {
			g.Revision = 1
		}
		s.Broker.Groups[id] = g
	}
	for id, p := range s.Positions {
		if p.Economics == nil {
			if i, ok := s.Instruments[domain.MarketKey(p.TenantID, p.Symbol)]; ok {
				p.Economics = &domain.PositionEconomics{ContractSize: i.ContractSize, QuoteCurrency: i.QuoteCurrency, Commission: domain.CommissionPolicy{Mode: "NONE", Currency: "USD"}}
				s.Positions[id] = p
			}
		}
	}
}
