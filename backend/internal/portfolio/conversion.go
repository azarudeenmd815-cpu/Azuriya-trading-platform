package portfolio

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/marketdata"
	"github.com/shopspring/decimal"
	"time"
)

type CurrencyConversionService interface {
	Convert(amount decimal.Decimal, from, to string) (decimal.Decimal, error)
}
type USDConversion struct {
	Quotes   map[string]domain.Quote
	TenantID string
	Now      time.Time
}

// Positive JPY is sold at USDJPY ask; negative JPY is funded at USDJPY bid.
// Division rounds to 12 decimals, an explicit calculation precision, never binary floats.
func (c USDConversion) Convert(amount decimal.Decimal, from, to string) (decimal.Decimal, error) {
	if from == to {
		return amount, nil
	}
	if from != "JPY" || to != "USD" {
		return decimal.Zero, domain.Err("CONVERSION_UNAVAILABLE", "Only USD and JPY-to-USD conversion are supported in Phase 1")
	}
	q, ok := c.Quotes[domain.MarketKey(c.TenantID, "USDJPY")]
	if !ok {
		return decimal.Zero, domain.Err("CONVERSION_UNAVAILABLE", "USDJPY conversion quote is unavailable")
	}
	if err := marketdata.Fresh(q, c.Now); err != nil {
		return decimal.Zero, err
	}
	rate := q.Ask
	if amount.IsNegative() {
		rate = q.Bid
	}
	if !rate.IsPositive() {
		return decimal.Zero, domain.Err("CONVERSION_UNAVAILABLE", "Invalid currency conversion rate")
	}
	return amount.DivRound(rate, 12), nil
}
