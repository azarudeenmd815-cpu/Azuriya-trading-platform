package positions

import "github.com/shopspring/decimal"

// Profit returns P&L in the instrument quote currency. Currency conversion is separate.
func Profit(side string, open, close, quantity, contract decimal.Decimal) decimal.Decimal {
	difference := close.Sub(open)
	if side == "SELL" {
		difference = difference.Neg()
	}
	return difference.Mul(quantity).Mul(contract)
}
