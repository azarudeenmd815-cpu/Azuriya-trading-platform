package httpapi_test

import (
	"azuriya/backend/internal/candles"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/workspaces"
	"encoding/json"
	"strings"
	"testing"
)

func TestPhase2HistoryAndWorkspaceHTTPIsolation(t *testing.T) {
	f := newFixture(t, nil)
	_, cookie, account := f.register("phase2-owner@example.test")
	_, other, _ := f.register("phase2-other@example.test")
	for _, path := range []string{"/workspaces", "/instruments/EURUSD/candles"} {
		status, _, _ := f.request("GET", "/api/v1"+path, "", nil, "")
		if status != 401 {
			t.Fatalf("unauthenticated %s: %d", path, status)
		}
	}
	status, data, _ := f.request("GET", "/api/v1/workspaces", "", cookie, "")
	var list []workspaces.Workspace
	if status != 200 || json.Unmarshal(data, &list) != nil || len(list) != 1 {
		t.Fatalf("default workspace: %d %s", status, data)
	}
	path := "/api/v1/workspaces/" + list[0].ID
	status, data, _ = f.request("PATCH", path, `{"layout":"GRID_4","revision":1}`, cookie, "")
	if status != 200 {
		t.Fatalf("patch: %d %s", status, data)
	}
	status, _, _ = f.request("PATCH", path, `{"name":"stale change","revision":1}`, cookie, "")
	if status != 409 {
		t.Fatalf("revision conflict: %d", status)
	}
	for _, method := range []string{"GET", "PATCH", "DELETE"} {
		status, _, _ = f.request(method, path, `{"name":"Stolen workspace"}`, other, "")
		if status != 404 {
			t.Fatalf("workspace owner escaped via %s: %d", method, status)
		}
	}
	status, data, _ = f.request("GET", "/api/v1/instruments/EURUSD/candles?interval=5m&limit=30", "", cookie, "")
	var bars []candles.Candle
	if status != 200 || json.Unmarshal(data, &bars) != nil || len(bars) != 30 {
		t.Fatalf("history: %d %s", status, data)
	}
	for i, c := range bars {
		if c.TenantID != account.TenantID || i > 0 && !bars[i-1].OpenTime.Before(c.OpenTime) {
			t.Fatal("history ownership/order")
		}
	}
	if !strings.Contains(string(data), `"open":"`) {
		t.Fatal("OHLC must be decimal strings")
	}
	for _, query := range []string{"interval=bad", "limit=2001", "from=tomorrow"} {
		status, _, _ = f.request("GET", "/api/v1/instruments/EURUSD/candles?"+query, "", cookie, "")
		if status < 400 {
			t.Fatalf("invalid candle query accepted: %s", query)
		}
	}
	status, data, _ = f.request("DELETE", path, "", cookie, "")
	if status != 200 {
		t.Fatalf("delete: %d %s", status, data)
	}
	status, data, _ = f.request("GET", "/api/v1/workspaces", "", cookie, "")
	if json.Unmarshal(data, &list) != nil || len(list) != 1 {
		t.Fatalf("last workspace replacement: %d %s", status, data)
	}
}

func TestPhase2TradingPreviewHTTPDecimalAndOwnership(t *testing.T) {
	f := newFixture(t, nil)
	_, cookie, account := f.register("preview-owner@example.test")
	_, other, _ := f.register("preview-other@example.test")
	path := "/api/v1/accounts/" + account.ID + "/orders/preview"
	body := `{"symbol":"EURUSD","side":"BUY","type":"MARKET","quantity_mode":"RISK_PERCENT","risk_percent":"0.50","stop_loss":"0.01","stop_loss_mode":"DISTANCE","take_profit":"0.02","take_profit_mode":"DISTANCE"}`
	status, data, _ := f.request("POST", path, body, cookie, "")
	var preview domain.OrderPreview
	if status != 200 || json.Unmarshal(data, &preview) != nil || !preview.CanSubmit || !preview.NonBinding {
		t.Fatalf("risk preview: %d %s", status, data)
	}
	status, _, _ = f.request("POST", path, body, other, "")
	if status != 403 && status != 404 {
		t.Fatalf("preview ownership: %d", status)
	}
	status, _, _ = f.request("POST", path, strings.Replace(body, `"risk_percent":"0.50"`, `"risk_percent":0.50`, 1), cookie, "")
	if status != 400 {
		t.Fatalf("numeric risk accepted: %d", status)
	}
	if len(f.engine.Snapshot().Orders) != 0 {
		t.Fatal("preview mutated trading state")
	}
}
