package domain

import "github.com/shopspring/decimal"

// ValidInputDecimal bounds work before formatting or arithmetic on client/feed
// values. Derived P&L may use 12 decimal places; no financial path uses float64.
func ValidInputDecimal(value decimal.Decimal) bool {
	if value.Exponent() < -12 || value.Exponent() > 18 || value.Coefficient().BitLen() > 104 {
		return false
	}
	return value.Abs().LessThan(D("1000000000000000000"))
}
