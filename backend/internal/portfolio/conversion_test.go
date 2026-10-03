package portfolio_test

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/portfolio"
	"testing"
	"time"
)

func TestConversionUsesAssetAndLiabilitySides(t *testing.T) {
	q := domain.Quote{Bid: domain.D("150"), Ask: domain.D("151"), Timestamp: time.Now().UTC()}
	c := portfolio.USDConversion{Quotes: map[string]domain.Quote{domain.MarketKey("t", "USDJPY"): q}, TenantID: "t", Now: time.Now().UTC()}
	credit, err := c.Convert(domain.D("151"), "JPY", "USD")
	if err != nil || !credit.Equal(domain.D("1")) {
		t.Fatal(credit, err)
	}
	debit, err := c.Convert(domain.D("-150"), "JPY", "USD")
	if err != nil || !debit.Equal(domain.D("-1")) {
		t.Fatal(debit, err)
	}
	_, err = c.Convert(domain.D("1"), "GBP", "USD")
	if err == nil {
		t.Fatal("unsupported cross must fail explicitly")
	}
}
