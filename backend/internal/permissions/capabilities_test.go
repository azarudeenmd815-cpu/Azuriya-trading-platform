package permissions

import (
	"azuriya/backend/internal/domain"
	"testing"
)

func TestAdministrativeCapabilitiesDoNotPermitTraderOrSupportConfiguration(t *testing.T) {
	for _, role := range []string{"TRADER", "SUPPORT", "UNKNOWN"} {
		for _, capability := range []string{"pricing.write", "risk.write", "accounts.balance_adjust", "groups.write"} {
			if err := Require(domain.Identity{UserID: "user", TenantID: "tenant", Role: role}, capability); err == nil {
				t.Errorf("%s unexpectedly permitted %s", role, capability)
			}
		}
	}
	if err := Require(domain.Identity{UserID: "user", TenantID: "tenant", Role: "SUPPORT"}, "accounts.read"); err != nil {
		t.Fatal(err)
	}
	if err := Require(domain.Identity{Role: "OWNER"}, "pricing.write"); err == nil {
		t.Fatal("missing authenticated scope permitted")
	}
}

func TestOwnerSettingsAuthorityAndAdminOperatingAuthority(t *testing.T) {
	admin := domain.Identity{UserID: "admin", TenantID: "tenant", Role: "ADMIN"}
	owner := domain.Identity{UserID: "owner", TenantID: "tenant", Role: "OWNER"}
	if err := Require(admin, "accounts.balance_adjust"); err != nil {
		t.Fatal(err)
	}
	if err := Require(admin, "tenant.settings.write"); err == nil {
		t.Fatal("ADMIN may not rewrite owner settings")
	}
	if err := Require(owner, "tenant.settings.write"); err != nil {
		t.Fatal(err)
	}
	if Capability("pricing-profiles", true) != "pricing.write" || Capability("dealer/positions", false) != "dealer.read" || Capability("unknown", false) != "" {
		t.Fatal("resource capability mapping is unsafe")
	}
}
