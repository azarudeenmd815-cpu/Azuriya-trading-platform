package risk

import (
	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
)

func Check(a domain.Account, required, openingPnL decimal.Decimal) error {
	if required.GreaterThan(a.MarginFree.Add(openingPnL)) {
		return domain.Err("INSUFFICIENT_MARGIN", "Available free margin does not cover required margin and the opening spread")
	}
	return nil
}
