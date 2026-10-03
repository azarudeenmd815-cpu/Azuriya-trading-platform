package pricing

import (
	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
)

// Profile is instrument/profile based, never based on trader performance.
type Profile struct {
	ID            string          `json:"id"`
	BidMarkup     decimal.Decimal `json:"bid_markup"`
	AskMarkup     decimal.Decimal `json:"ask_markup"`
	MinimumSpread decimal.Decimal `json:"minimum_spread"`
	MaximumSpread decimal.Decimal `json:"maximum_spread"`
}

func Default() Profile { return Profile{ID: "native-default-v1"} }
func Apply(reference domain.Quote, p Profile) (domain.Quote, error) {
	q := reference
	q.Bid = q.Bid.Sub(p.BidMarkup)
	q.Ask = q.Ask.Add(p.AskMarkup)
	if q.Ask.Sub(q.Bid).LessThan(p.MinimumSpread) {
		q.Ask = q.Bid.Add(p.MinimumSpread)
	}
	if !q.Bid.IsPositive() || q.Ask.LessThan(q.Bid) || (p.MaximumSpread.IsPositive() && q.Ask.Sub(q.Bid).GreaterThan(p.MaximumSpread)) {
		return domain.Quote{}, domain.Err("INVALID_PRICING", "Pricing profile produced an invalid client quote")
	}
	return q, nil
}
