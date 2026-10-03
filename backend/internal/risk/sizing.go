package risk

import (
	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
)

// Size rounds down using an exact integer quotient, so precision truncation can
// never push a sized order above its requested risk budget.
func Size(budget, lossPerLot decimal.Decimal, i domain.Instrument) (decimal.Decimal, bool, error) {
	if !budget.IsPositive() || !lossPerLot.IsPositive() {
		return decimal.Zero, false, domain.Err("INVALID_RISK", "Risk amount and estimated loss per lot must be positive")
	}
	if !i.QuantityStep.IsPositive() {
		return decimal.Zero, false, domain.Err("INVALID_INSTRUMENT", "Instrument quantity step is invalid")
	}
	steps, _ := budget.QuoRem(lossPerLot.Mul(i.QuantityStep), 0)
	quantity := steps.Mul(i.QuantityStep)
	capped := false
	if quantity.GreaterThan(i.MaxQuantity) {
		maxSteps, _ := i.MaxQuantity.QuoRem(i.QuantityStep, 0)
		quantity = maxSteps.Mul(i.QuantityStep)
		capped = true
	}
	if quantity.LessThan(i.MinQuantity) {
		return decimal.Zero, false, domain.Err("RISK_BELOW_MINIMUM", "Risk budget is too small for the instrument minimum quantity")
	}
	return quantity, capped, nil
}
