package instruments

import (
	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
)

func Quantity(i domain.Instrument, q decimal.Decimal) error {
	if !domain.ValidInputDecimal(q) {
		return domain.Err("INVALID_QUANTITY", "Quantity precision or magnitude is unsupported")
	}
	if q.LessThan(i.MinQuantity) || q.GreaterThan(i.MaxQuantity) || !i.QuantityStep.IsPositive() || !q.Mod(i.QuantityStep).IsZero() {
		return domain.Err("INVALID_QUANTITY", "Quantity must satisfy the instrument minimum, maximum, and step")
	}
	return nil
}
func Price(i domain.Instrument, p *decimal.Decimal) error {
	if p != nil && !domain.ValidInputDecimal(*p) {
		return domain.Err("INVALID_PRICE", "Price precision or magnitude is unsupported")
	}
	if p != nil && (!p.IsPositive() || !i.TickSize.IsPositive() || !p.Mod(i.TickSize).IsZero()) {
		return domain.Err("INVALID_PRICE", "Price must be positive and aligned to the instrument tick size")
	}
	return nil
}
