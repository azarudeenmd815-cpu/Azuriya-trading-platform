package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestExplicitAdminOriginAllowlistPreservesTraderOrigin(t *testing.T) {
	// Removing the additional-origin check prevents the separate authenticated
	// admin app from reaching the same API; allowing arbitrary origins leaks it.
	server := &Server{config: Config{WebOrigin: "http://localhost:3000", AllowedOrigins: []string{"http://localhost:3001"}}}
	handler := server.middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	for _, tc := range []struct {
		origin string
		status int
	}{{"http://localhost:3000", 204}, {"http://localhost:3001", 204}, {"http://foreign.invalid", 403}} {
		request := httptest.NewRequest("GET", "/healthz", nil)
		request.Header.Set("Origin", tc.origin)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != tc.status {
			t.Fatalf("origin %s: %d", tc.origin, response.Code)
		}
		if tc.status == 204 && response.Header().Get("Access-Control-Allow-Origin") != tc.origin {
			t.Fatal("credential origin response absent")
		}
	}
}

func TestAdminNestedFinancialInputsRequirePlainDecimalStrings(t *testing.T) {
	// Removing recursive validation would accept a JSON number or exponent in a
	// nested policy and turn an imprecise client value into authoritative money.
	for _, value := range []string{`2.5`, `"2e3"`, `"0.00000000001"`} {
		t.Run(value, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/v1/admin/commission-plans", strings.NewReader(`{"commission":{"amount":`+value+`}}`))
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			var body struct {
				Commission struct {
					Amount decimal.Decimal `json:"amount"`
				} `json:"commission"`
			}
			if decode(response, req, &body) {
				t.Fatal("nested financial input accepted")
			}
			if response.Code != 400 || !strings.Contains(response.Body.String(), "INVALID_DECIMAL") {
				t.Fatalf("unexpected rejection: %d %s", response.Code, response.Body.String())
			}
		})
	}
	request := httptest.NewRequest("POST", "/api/v1/admin/leverage-plans", strings.NewReader(`{"rules":[{"max_leverage":"100"}]}`))
	request.Header.Set("Content-Type", "application/json")
	var body struct {
		Rules []struct {
			MaxLeverage decimal.Decimal `json:"max_leverage"`
		} `json:"rules"`
	}
	if !decode(httptest.NewRecorder(), request, &body) || !body.Rules[0].MaxLeverage.Equal(decimal.NewFromInt(100)) {
		t.Fatal("valid nested decimal string rejected")
	}
}
