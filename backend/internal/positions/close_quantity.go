package positions

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/instruments"
	"github.com/shopspring/decimal"
)

// CloseQuantity chooses the nearest legal percentage close. Ties prefer the
// smaller close. A valid residual is either zero or at least the minimum lot.
func CloseQuantity(i domain.Instrument, open decimal.Decimal, r domain.CloseRequest) (decimal.Decimal, decimal.Decimal, error) {
	if r.Quantity != nil && r.Percentage != nil {
		return decimal.Zero, decimal.Zero, domain.Err("INVALID_CLOSE_REQUEST", "Provide quantity or percentage, not both")
	}
	requested := open
	if r.Quantity != nil {
		requested = *r.Quantity
	}
	if r.Percentage != nil {
		if !domain.ValidInputDecimal(*r.Percentage) || !r.Percentage.IsPositive() || r.Percentage.GreaterThan(domain.D("100")) {
			return decimal.Zero, decimal.Zero, domain.Err("INVALID_PERCENTAGE", "Close percentage must be greater than zero and at most 100")
		}
		requested = open.Mul(*r.Percentage).Shift(-2)
		if r.Percentage.Equal(domain.D("100")) {
			return requested, open, nil
		}
		if !i.QuantityStep.IsPositive() {
			return requested, decimal.Zero, domain.Err("INVALID_INSTRUMENT", "Instrument quantity step is invalid")
		}
		rounded := requested.DivRound(i.QuantityStep, 0).Mul(i.QuantityStep)
		minSteps, _ := i.MinQuantity.QuoRem(i.QuantityStep, 0)
		minimum := minSteps.Mul(i.QuantityStep)
		if minimum.LessThan(i.MinQuantity) {
			minimum = minimum.Add(i.QuantityStep)
		}
		candidates := []decimal.Decimal{rounded, rounded.Sub(i.QuantityStep), rounded.Add(i.QuantityStep), minimum, open.Sub(minimum), open}
		best := decimal.Zero
		distance := decimal.Zero
		for _, candidate := range candidates {
			remaining := open.Sub(candidate)
			if instruments.Quantity(i, candidate) != nil || candidate.GreaterThan(open) || (remaining.IsPositive() && (remaining.LessThan(i.MinQuantity) || !remaining.Mod(i.QuantityStep).IsZero())) {
				continue
			}
			d := candidate.Sub(requested).Abs()
			if best.IsZero() || d.LessThan(distance) || (d.Equal(distance) && candidate.LessThan(best)) {
				best = candidate
				distance = d
			}
		}
		if best.IsZero() {
			return requested, best, domain.Err("INVALID_QUANTITY", "No legal close quantity is available")
		}
		return requested, best, nil
	}
	if err := instruments.Quantity(i, requested); err != nil {
		return requested, decimal.Zero, err
	}
	if requested.GreaterThan(open) {
		return requested, decimal.Zero, domain.Err("INVALID_QUANTITY", "Close quantity exceeds the open position quantity")
	}
	remaining := open.Sub(requested)
	if remaining.IsPositive() && (remaining.LessThan(i.MinQuantity) || !remaining.Mod(i.QuantityStep).IsZero()) {
		return requested, decimal.Zero, domain.Err("INVALID_QUANTITY", "Remaining quantity would violate the instrument minimum or step")
	}
	return requested, requested, nil
}
