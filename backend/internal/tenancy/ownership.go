package tenancy

import "azuriya/backend/internal/domain"

func Owns(identity domain.Identity, account domain.Account) error {
	if identity.UserID == "" || identity.TenantID == "" || identity.TenantID != account.TenantID || identity.UserID != account.UserID {
		return domain.Err("ACCOUNT_NOT_FOUND", "Trading account not found")
	}
	return nil
}
