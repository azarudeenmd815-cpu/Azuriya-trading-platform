package accounts

import "azuriya/backend/internal/domain"

func CanTrade(a domain.Account, closing bool) error {
	if a.Mode != "PROP_SIMULATED" && a.Mode != "BROKER_DEMO" {
		return domain.Err("ACCOUNT_MODE_DISABLED", "Only simulated and demo execution is enabled")
	}
	if a.PositionMode != "HEDGING" {
		return domain.Err("POSITION_MODE_DISABLED", "Only hedging positions are enabled")
	}
	if a.Status != "ACTIVE" && !(closing && a.Status == "READ_ONLY") {
		return domain.Err("ACCOUNT_NOT_TRADABLE", "Account is not enabled for this trading operation")
	}
	if a.Currency != "USD" {
		return domain.Err("UNSUPPORTED_CURRENCY", "Phase 1 accounts must use USD")
	}
	return nil
}
