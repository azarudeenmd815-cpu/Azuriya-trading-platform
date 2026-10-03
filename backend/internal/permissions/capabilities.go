// Package permissions defines the explicit capabilities used by administrative
// transport and domain commands. Unknown roles and resources fail closed.
package permissions

import (
	"azuriya/backend/internal/domain"
	"sort"
	"strings"
)

var operating = []string{"broker.read", "clients.read", "clients.update", "accounts.read", "accounts.create", "accounts.update", "accounts.balance_adjust", "symbols.read", "symbols.write", "groups.read", "groups.write", "pricing.read", "pricing.write", "risk.read", "risk.write", "dealer.read", "reports.read", "audit.read", "tenant.settings.read"}
var support = []string{"broker.read", "clients.read", "accounts.read", "dealer.read", "tenant.settings.read"}

func Capabilities(role string) []string {
	var result []string
	switch role {
	case "OWNER":
		result = append(append([]string{}, operating...), "tenant.settings.write")
	case "ADMIN":
		result = append([]string{}, operating...)
	case "SUPPORT":
		result = append([]string{}, support...)
	default:
		result = []string{}
	}
	sort.Strings(result)
	return result
}

func Require(id domain.Identity, capability string) error {
	if id.UserID == "" || id.TenantID == "" || capability == "" {
		return domain.Err("FORBIDDEN", "Authenticated tenant capability is required")
	}
	for _, allowed := range Capabilities(id.Role) {
		if allowed == capability {
			return nil
		}
	}
	return domain.Err("FORBIDDEN", "Your role does not permit this administrative operation")
}

func Capability(resource string, write bool) string {
	suffix := ".read"
	if write {
		suffix = ".write"
	}
	switch resource {
	case "dashboard":
		if !write {
			return "broker.read"
		}
	case "clients":
		if write {
			return "clients.update"
		}
		return "clients.read"
	case "accounts":
		if write {
			return "accounts.update"
		}
		return "accounts.read"
	case "balance-operations":
		if write {
			return "accounts.balance_adjust"
		}
		return "accounts.read"
	case "transactions", "effective-settings":
		if !write {
			return "accounts.read"
		}
	case "symbols":
		return "symbols" + suffix
	case "trading-groups", "symbol-groups":
		return "groups" + suffix
	case "pricing-profiles", "commission-plans", "swap-plans", "leverage-plans":
		return "pricing" + suffix
	case "margin-profiles", "execution-profiles", "trading-sessions":
		return "risk" + suffix
	case "settings":
		return "tenant.settings" + suffix
	case "audit":
		if !write {
			return "audit.read"
		}
	}
	if !write && strings.HasPrefix(resource, "risk/") {
		return "risk.read"
	}
	if !write && strings.HasPrefix(resource, "dealer/") {
		return "dealer.read"
	}
	if !write && strings.HasPrefix(resource, "reports/") {
		return "reports.read"
	}
	return ""
}
