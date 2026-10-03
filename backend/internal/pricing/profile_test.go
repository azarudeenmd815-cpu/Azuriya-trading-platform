package pricing_test

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/pricing"
	"testing"
)

func TestReferenceQuoteIsPreserved(t *testing.T) {
	reference := domain.Quote{Symbol: "EURUSD", Bid: domain.D("1.08"), Ask: domain.D("1.0801"), Sequence: 42}
	profile := pricing.Profile{ID: "instrument-policy", BidMarkup: domain.D("0.00001"), AskMarkup: domain.D("0.00002")}
	q, err := pricing.Apply(reference, profile)
	if err != nil {
		t.Fatal(err)
	}
	if !q.Bid.Equal(domain.D("1.07999")) || !q.Ask.Equal(domain.D("1.08012")) || !reference.Bid.Equal(domain.D("1.08")) || q.Sequence != reference.Sequence {
		t.Fatal("reference/client quote separation failed")
	}
}
func TestMaximumSpreadRejectsInvalidProfile(t *testing.T) {
	_, err := pricing.Apply(domain.Quote{Bid: domain.D("1"), Ask: domain.D("1.01")}, pricing.Profile{ID: "bad", MaximumSpread: domain.D("0.001")})
	if err == nil {
		t.Fatal("maximum spread must reject")
	}
}
