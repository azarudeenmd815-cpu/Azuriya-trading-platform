package margin

import (
	"azuriya/backend/internal/domain"
)

type Policy = domain.MarginPolicy

func DefaultPolicy() Policy {
	return Policy{MarginCallLevel: domain.D("100"), StopOutLevel: domain.D("50"), StopOutEnabled: false}
}

// Status compares unrounded equity and margin, rather than a display percentage.
// STOP_OUT_REQUIRED is advisory in Phase 1; there is no automatic liquidation.
func Status(a domain.Account, p Policy) string {
	if !a.MarginUsed.IsPositive() {
		return "NORMAL"
	}
	equity := a.Equity.Mul(domain.D("100"))
	if equity.LessThanOrEqual(a.MarginUsed.Mul(p.StopOutLevel)) {
		return "STOP_OUT_REQUIRED"
	}
	if equity.LessThanOrEqual(a.MarginUsed.Mul(p.MarginCallLevel)) {
		return "MARGIN_CALL"
	}
	return "NORMAL"
}
