package broker_test

import (
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"testing"
	"time"
)

func seeded() (domain.State, domain.Account, domain.Instrument) {
	s := domain.Seed("t", "u")
	broker.Ensure(&s)
	var a domain.Account
	for _, v := range s.Accounts {
		a = v
	}
	return s, a, s.Instruments[domain.MarketKey("t", "EURUSD")]
}
func TestPricingPrecedenceAndSymbolOverrideKeepReference(t *testing.T) {
	s, a, i := seeded()
	i.SymbolGroupID = "fx"
	s.Broker.SymbolGroups["fx"] = domain.SymbolGroup{ID: "fx", TenantID: "t", Name: "FX", ProfileRefs: domain.ProfileRefs{PricingProfileID: "category"}}
	for _, id := range []string{"group", "category", "symbol"} {
		p := domain.PricingPolicy{Unit: "POINTS", AskMarkup: domain.D("2")}
		s.Broker.Profiles[id] = domain.BrokerProfile{ID: id, TenantID: "t", Name: id, Kind: "PRICING", Status: "ACTIVE", Revision: 2, Pricing: &p}
	}
	p := s.Broker.Profiles["symbol"]
	p.SymbolOverrides = []domain.BrokerProfileSymbolOverride{{Symbol: "EURUSD", Pricing: &domain.PricingPolicy{Unit: "POINTS", AskMarkup: domain.D("5")}}}
	s.Broker.Profiles[p.ID] = p
	g := s.Broker.Groups[s.Broker.Settings["t"].DefaultTradingGroupID]
	g.PricingProfileID = "group"
	g.SymbolRules = []domain.SymbolRule{{Symbol: "EURUSD", ProfileRefs: domain.ProfileRefs{PricingProfileID: "symbol"}}}
	s.Broker.Groups[g.ID] = g
	c, err := broker.Resolve(&s, a, i, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if c.PricingProfileID != "symbol" || !c.Pricing.AskMarkup.Equal(domain.D("5")) {
		t.Fatal("explicit symbol policy did not win")
	}
	ref := s.Quotes[domain.MarketKey("t", i.Symbol)]
	q, err := broker.Price(ref, i, c)
	if err != nil {
		t.Fatal(err)
	}
	if !q.Ask.Equal(ref.Ask.Add(i.TickSize.Mul(domain.D("5")))) || !ref.Bid.Equal(domain.D("1.0845")) {
		t.Fatal("pricing mutated reference or used wrong unit")
	}
}
func TestLeverageAssetCategoryAndSymbolPrecedence(t *testing.T) {
	s, a, i := seeded()
	i.SymbolGroupID = "fx"
	p := domain.LeveragePolicy{MaxLeverage: domain.D("100"), Rules: []domain.LeverageRule{{AssetClass: "FOREX", MaxLeverage: domain.D("50")}, {SymbolGroupID: "fx", MaxLeverage: domain.D("30")}, {Symbol: "EURUSD", MaxLeverage: domain.D("20")}}}
	s.Broker.SymbolGroups["fx"] = domain.SymbolGroup{ID: "fx", TenantID: "t", Name: "FX"}
	s.Broker.Profiles["lev"] = domain.BrokerProfile{ID: "lev", TenantID: "t", Name: "Leverage", Kind: "LEVERAGE", Status: "ACTIVE", Leverage: &p}
	g := s.Broker.Groups[s.Broker.Settings["t"].DefaultTradingGroupID]
	g.LeveragePlanID = "lev"
	s.Broker.Groups[g.ID] = g
	c, err := broker.Resolve(&s, a, i, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !c.EffectiveLeverage.Equal(domain.D("20")) {
		t.Fatal(c.EffectiveLeverage)
	}
	a.MaxLeverageOverride = domain.CopyDecimal(&[]domain.LeveragePolicy{{MaxLeverage: domain.D("10")}}[0].MaxLeverage)
	c, err = broker.Resolve(&s, a, i, time.Now())
	if err != nil || !c.EffectiveLeverage.Equal(domain.D("10")) {
		t.Fatal(c.EffectiveLeverage, err)
	}
}
func TestSessionOvernightAndEqualityBoundaries(t *testing.T) {
	p := domain.SessionPolicy{Timezone: "UTC", DefaultStatus: "CLOSED", Windows: []domain.SessionWindow{{Day: 1, Start: "22:00", End: "02:00", Status: "OPEN"}}}
	cases := []struct{ at, status string }{{"2026-09-28T21:59:59Z", "CLOSED"}, {"2026-09-28T22:00:00Z", "OPEN"}, {"2026-09-29T01:59:59Z", "OPEN"}, {"2026-09-29T02:00:00Z", "CLOSED"}}
	for _, tc := range cases {
		at, _ := time.Parse(time.RFC3339, tc.at)
		got, err := broker.SessionStatus(p, at)
		if err != nil || got != tc.status {
			t.Fatal(tc.at, got, err)
		}
	}
	p.Windows = append(p.Windows, domain.SessionWindow{Day: 2, Start: "01:00", End: "03:00", Status: "CLOSE_ONLY"})
	profile := domain.BrokerProfile{ID: "p", TenantID: "t", Name: "Hours", Status: "ACTIVE", Kind: "SESSION", Session: &p}
	if broker.ValidateProfile(profile) == nil {
		t.Fatal("overlapping overnight session accepted")
	}
}
func TestProfilesRejectWrongKindsForeignRefsAndNegativeCosts(t *testing.T) {
	s, _, _ := seeded()
	fee := domain.CommissionPolicy{Mode: "PER_LOT_PER_SIDE", Amount: domain.D("-1"), Currency: "USD"}
	p := domain.BrokerProfile{ID: "fee", TenantID: "t", Name: "Fee", Status: "ACTIVE", Kind: "COMMISSION", Commission: &fee}
	if broker.ValidateProfile(p) == nil {
		t.Fatal("negative commission accepted")
	}
	fee.Amount = domain.D("1")
	p.TenantID = "foreign"
	s.Broker.Profiles[p.ID] = p
	g := s.Broker.Groups[s.Broker.Settings["t"].DefaultTradingGroupID]
	g.CommissionPlanID = p.ID
	if broker.ValidateGroup(&s, g) == nil {
		t.Fatal("foreign profile assigned")
	}
	p.TenantID = "t"
	s.Broker.Profiles[p.ID] = p
	g.PricingProfileID = p.ID
	if broker.ValidateGroup(&s, g) == nil {
		t.Fatal("wrong-kind profile assigned")
	}
}

func TestNonEconomicProfileRejectsSymbolOverridePayload(t *testing.T) {
 margin:=domain.MarginPolicy{MarginCallLevel:domain.D("100"),StopOutLevel:domain.D("50")};p:=domain.BrokerProfile{ID:"p",TenantID:"t",Name:"Risk",Status:"ACTIVE",Kind:"MARGIN",Margin:&margin,SymbolOverrides:[]domain.BrokerProfileSymbolOverride{{Symbol:"EURUSD",Pricing:&domain.PricingPolicy{Unit:"PRICE"}}}};if broker.ValidateProfile(p)==nil{t.Fatal("non-economic profile accepted an ignored pricing override")}
}
