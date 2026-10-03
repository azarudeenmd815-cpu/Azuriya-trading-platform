package candles

import (
	"azuriya/backend/internal/domain"
)

// Aggregate is pure: a accepted quote updates exactly one current candle per
// interval. Duplicate/replayed sequences do not double-count volume. Missing
// intervals represent no observed ticks and are left as gaps, not fake volume.
func Aggregate(series Series, quote domain.Quote) (Series, []Candle, error) {
	if quote.TenantID != series.TenantID || quote.Symbol != series.Symbol {
		return series, nil, domain.Err("INVALID_QUOTE", "Candle quote scope does not match its series")
	}
	if !domain.ValidInputDecimal(quote.Bid) || !domain.ValidInputDecimal(quote.Ask) || !quote.Bid.IsPositive() || quote.Ask.LessThan(quote.Bid) || quote.Timestamp.IsZero() || quote.Sequence == 0 {
		return series, nil, domain.Err("INVALID_QUOTE", "Candle aggregation requires a valid committed quote")
	}
	if quote.Sequence <= series.LastQuote.Sequence {
		return series, []Candle{}, nil
	}
	if quote.Timestamp.Before(series.LastQuote.Timestamp) {
		return series, nil, domain.Err("REPLAYED_QUOTE", "Candle quote time moved backwards")
	}
	next := series.Clone()
	updates := make([]Candle, 0, len(Supported)*2)
	for _, interval := range Supported {
		openTime := interval.Open(quote.Timestamp)
		current, exists := next.Current[interval.Name]
		if exists && current.OpenTime.After(openTime) {
			return series, nil, domain.Err("REPLAYED_QUOTE", "Candle bucket moved backwards")
		}
		if !exists || current.OpenTime.Before(openTime) {
			if exists {
				current.Complete = true
				current.Sequence = quote.Sequence
				updates = append(updates, current)
			}
			current = Candle{TenantID: quote.TenantID, Symbol: quote.Symbol, Interval: interval.Name, OpenTime: openTime, CloseTime: openTime.Add(interval.Duration), Open: quote.Bid, High: quote.Bid, Low: quote.Bid, Close: quote.Bid, Simulated: true, Source: "SIMULATED_TICKS"}
		}
		if quote.Bid.GreaterThan(current.High) {
			current.High = quote.Bid
		}
		if quote.Bid.LessThan(current.Low) {
			current.Low = quote.Bid
		}
		current.Close = quote.Bid
		current.TickVolume++
		current.Sequence = quote.Sequence
		next.Current[interval.Name] = current
		updates = append(updates, current)
	}
	next.LastQuote = quote
	return next, updates, nil
}
