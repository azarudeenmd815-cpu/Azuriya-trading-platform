package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"azuriya/backend/internal/auth"
)

func brokerRoleCookie(t *testing.T, f *apiFixture, tenantID, role string) (auth.User, *http.Cookie) {
	t.Helper()
	hash, err := auth.HashPassword("role-test-password-123")
	if err != nil {
		t.Fatal(err)
	}
	u := auth.User{ID: auth.RandomID(), Email: strings.ToLower(role) + "@roles.example.test", TenantID: tenantID, Role: role, Status: "ACTIVE", PasswordHash: hash}
	if err = f.repo.CreateUser(context.Background(), u, "Existing broker"); err != nil {
		t.Fatal(err)
	}
	_, token, err := f.auth.Login(context.Background(), u.Email, "role-test-password-123")
	if err != nil {
		t.Fatal(err)
	}
	return u, &http.Cookie{Name: "azuriya_session", Value: token}
}

func TestBrokerAdminHTTPRoleTenantAndNestedDecimalBoundaries(t *testing.T) {
	// A missing capability wrapper or a browser-chosen tenant would disclose
	// broker-wide data; nested JSON numbers must fail before policy mutation.
	f := newFixture(t, nil)
	owner, cookie, account := f.register("admin-owner@example.test")
	_, foreign, _ := f.register("admin-foreign@example.test")
	_, support := brokerRoleCookie(t, f, owner.TenantID, "SUPPORT")
	_, trader := brokerRoleCookie(t, f, owner.TenantID, "TRADER")
	status, data, _ := f.request("GET", "/api/v1/admin/me", "", cookie, "")
	if status != 200 || !strings.Contains(string(data), `"execution_mode":"SIMULATED_INTERNAL"`) || !strings.Contains(string(data), "accounts.balance_adjust") {
		t.Fatalf("admin identity: %d %s", status, data)
	}
	for _, tc := range []struct {
		method, path, body string
		cookie             *http.Cookie
		status             int
	}{
		{"GET", "/api/v1/admin/accounts", "", nil, 401},
		{"GET", "/api/v1/admin/accounts", "", support, 200},
		{"POST", "/api/v1/admin/accounts", `{}`, support, 403},
		{"GET", "/api/v1/admin/pricing-profiles", "", support, 403},
		{"GET", "/api/v1/admin/audit", "", support, 403},
		{"GET", "/api/v1/admin/dashboard", "", trader, 403},
		{"GET", "/api/v1/admin/accounts/" + account.ID, "", foreign, 404},
		{"POST", "/api/v1/admin/commission-plans", `{"name":"Invalid numeric","commission":{"mode":"PER_LOT_PER_SIDE","amount":2.5,"currency":"USD"}}`, cookie, 400},
		{"POST", "/api/v1/admin/trading-groups", `{"name":"Foreign","tenant_id":"forged"}`, cookie, 400},
		{"GET", "/api/v1/admin/accounts?limit=1001", "", cookie, 400},
		{"GET", "/api/v1/admin/reports/accounts?format=xml", "", cookie, 400},
	} {
		status, data, _ = f.request(tc.method, tc.path, tc.body, tc.cookie, "")
		if status != tc.status {
			t.Fatalf("%s %s: %d %s", tc.method, tc.path, status, data)
		}
	}
}

func TestBrokerClientSuspensionDeniesSessionButAllowsLogout(t *testing.T) {
	f := newFixture(t, nil)
	owner, cookie, _ := f.register("suspension-owner@example.test")
	member, memberCookie := brokerRoleCookie(t, f, owner.TenantID, "SUPPORT")
	status, data, _ := f.request("PATCH", "/api/v1/admin/clients/"+member.ID, `{"status":"SUSPENDED","reason":"membership investigation"}`, cookie, "")
	if status != 200 {
		t.Fatalf("suspend: %d %s", status, data)
	}
	status, data, _ = f.request("GET", "/api/v1/me", "", memberCookie, "")
	if status != 403 {
		t.Fatalf("suspended operating session: %d %s", status, data)
	}
	accountCount := len(f.engine.Snapshot().Accounts)
	status, data, _ = f.request("POST", "/api/v1/auth/login", `{"email":"`+member.Email+`","password":"role-test-password-123"}`, nil, "")
	if status != 403 || len(f.engine.Snapshot().Accounts) != accountCount {
		t.Fatalf("suspended login changed accounts or authenticated: %d %s", status, data)
	}
	status, data, _ = f.request("POST", "/api/v1/auth/logout", "", memberCookie, "")
	if status != 200 {
		t.Fatalf("suspended logout: %d %s", status, data)
	}
	var result map[string]bool
	if json.Unmarshal(data, &result) != nil || !result["ok"] {
		t.Fatal("logout result missing")
	}
}
