package margin

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/portfolio"
	"github.com/shopspring/decimal"
)

func Required(i domain.Instrument, quantity, price, accountLeverage decimal.Decimal, currency string, conversion portfolio.CurrencyConversionService) (decimal.Decimal, error) {
	leverage := decimal.Min(accountLeverage, i.DefaultLeverage)
	if !leverage.IsPositive() {
		return decimal.Zero, domain.Err("INVALID_LEVERAGE", "Leverage must be positive")
	}
	notional := i.ContractSize.Mul(quantity).Mul(price)
	fromCurrency := i.QuoteCurrency
	// Base-currency accounts need no round-trip FX conversion (e.g. USDJPY in USD).
	if i.BaseCurrency == currency {
		notional = i.ContractSize.Mul(quantity)
		fromCurrency = currency
	}
	value, err := conversion.Convert(notional, fromCurrency, currency)
	if err != nil {
		return decimal.Zero, err
	}
	result := value.DivRound(leverage, 12)
	// Required margin always rounds upward to avoid understating risk by a fraction.
	if result.Mul(leverage).LessThan(value) {
		result = result.Add(domain.D("0.000000000001"))
	}
	return result, nil
}
func Totals(a domain.Account, positions []domain.Position) domain.Account {
	return TotalsWithPolicy(a, positions, DefaultPolicy())
}
func TotalsWithPolicy(a domain.Account, positions []domain.Position, policy Policy) domain.Account {
	a.UnrealizedPnL = decimal.Zero
	a.MarginUsed = decimal.Zero
	for _, p := range positions {
		if p.Status == "OPEN" {
			a.UnrealizedPnL = a.UnrealizedPnL.Add(p.UnrealizedPnL)
			a.MarginUsed = a.MarginUsed.Add(p.MarginUsed)
		}
	}
	a.Equity = a.Balance.Add(a.UnrealizedPnL)
	a.MarginFree = a.Equity.Sub(a.MarginUsed)
	a.MarginLevel = decimal.Zero
	if a.MarginUsed.IsPositive() {
		a.MarginLevel = a.Equity.Mul(domain.D("100")).DivRound(a.MarginUsed, 8)
	}
	a.MarginStatus = Status(a, policy)
	return a
}
