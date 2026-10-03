package margin_test

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/margin"
	"azuriya/backend/internal/portfolio"
	"testing"
	"time"
)

func TestRequiredMarginCurrencyAndConservativeRounding(t *testing.T) {
	s := domain.Seed("t", "u")
	converter := portfolio.USDConversion{Quotes: s.Quotes, TenantID: "t", Now: time.Now().UTC()}
	i := s.Instruments[domain.MarketKey("t", "USDJPY")]
	required, err := margin.Required(i, domain.D("1"), domain.D("150.123"), domain.D("100"), "USD", converter)
	if err != nil || !required.Equal(domain.D("1000")) {
		t.Fatalf("USD base margin got %s: %v", required, err)
	}
	i = s.Instruments[domain.MarketKey("t", "EURUSD")]
	i.DefaultLeverage = domain.D("3")
	required, err = margin.Required(i, domain.D("0.01"), domain.D("1"), domain.D("100"), "USD", converter)
	if err != nil || !required.Equal(domain.D("333.333333333334")) {
		t.Fatalf("margin must round upward, got %s: %v", required, err)
	}
}

func TestMarginWarningDoesNotUseRoundedDisplayLevel(t *testing.T) {
	a := domain.Account{Equity: domain.D("999.999999999999"), MarginUsed: domain.D("1000"), MarginLevel: domain.D("100")}
	if margin.Status(a, margin.DefaultPolicy()) != "MARGIN_CALL" {
		t.Fatal("rounded margin level hid exact breach")
	}
	a.Equity = domain.D("499")
	if margin.Status(a, margin.DefaultPolicy()) != "STOP_OUT_REQUIRED" || margin.DefaultPolicy().StopOutEnabled {
		t.Fatal("stop-out must be advisory only")
	}
}
