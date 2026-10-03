package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/candles"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"azuriya/backend/internal/httpapi"
	"azuriya/backend/internal/realtime"
	"azuriya/backend/internal/workspaces"
	"github.com/gorilla/websocket"
)

const testOrigin = "http://localhost:3000"

type apiFixture struct {
	t      *testing.T
	server *httptest.Server
	engine *engine.Engine
	auth   *auth.Service
	repo   *auth.MemoryRepository
}

func newFixture(t *testing.T, persist func(context.Context, domain.State) error) *apiFixture {
	t.Helper()
	e := engine.New(domain.EmptyState(), persist)
	repo := auth.NewMemoryRepository()
	a := auth.New(repo, false)
	hub := realtime.New(testOrigin)
	e.SetPublisher(hub.Publish)
	s := httptest.NewServer(httpapi.New(e, a, hub, httpapi.Config{WebOrigin: testOrigin, Candles: candles.New(candles.NewMemoryRepository(), 42), Workspaces: workspaces.New(workspaces.NewMemoryRepository(), e.Snapshot)}))
	t.Cleanup(hub.Close)
	t.Cleanup(s.Close)
	return &apiFixture{t: t, server: s, engine: e, auth: a, repo: repo}
}

func (f *apiFixture) request(method, path, body string, cookie *http.Cookie, key string) (int, []byte, []*http.Cookie) {
	f.t.Helper()
	req, err := http.NewRequest(method, f.server.URL+path, strings.NewReader(body))
	if err != nil {
		f.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", testOrigin)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		f.t.Fatal(err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		f.t.Fatal(err)
	}
	return res.StatusCode, data, res.Cookies()
}

func (f *apiFixture) register(email string) (auth.User, *http.Cookie, domain.Account) {
	f.t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "password": "isolated-test-password-123", "name": "Integration workspace"})
	status, data, cookies := f.request("POST", "/api/v1/auth/register", string(body), nil, "")
	if status != http.StatusCreated {
		f.t.Fatalf("register: %d %s", status, data)
	}
	if bytes.Contains(data, []byte("password_hash")) || bytes.Contains(data, []byte("argon2")) {
		f.t.Fatal("password hash exposed")
	}
	var u auth.User
	if err := json.Unmarshal(data, &u); err != nil {
		f.t.Fatal(err)
	}
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		f.t.Fatalf("unsafe session cookie: %+v", cookies)
	}
	status, data, _ = f.request("GET", "/api/v1/accounts", "", cookies[0], "")
	var accounts []domain.Account
	if err := json.Unmarshal(data, &accounts); err != nil {
		f.t.Fatal(err)
	}
	if status != 200 || len(accounts) != 1 || accounts[0].TenantID != u.TenantID || accounts[0].UserID != u.ID {
		f.t.Fatalf("invalid owned account: %d %s", status, data)
	}
	return u, cookies[0], accounts[0]
}

func orderBody(key, quantity string) string {
	b, _ := json.Marshal(map[string]string{"client_order_id": key, "symbol": "EURUSD", "side": "BUY", "type": "MARKET", "quantity": quantity, "time_in_force": "IOC"})
	return string(b)
}

func TestSessionAuthenticationAndLogout(t *testing.T) {
	f := newFixture(t, nil)
	for _, path := range []string{"/api/v1/me", "/api/v1/accounts", "/api/v1/instruments", "/api/v1/quotes", "/api/v1/ws"} {
		status, _, _ := f.request("GET", path, "", nil, "")
		if status != 401 {
			t.Fatalf("unprotected endpoint %s: %d", path, status)
		}
	}
	u, cookie, _ := f.register("session@example.test")
	status, data, _ := f.request("GET", "/api/v1/me", "", cookie, "")
	if status != 200 || !bytes.Contains(data, []byte(u.ID)) {
		t.Fatalf("session not usable: %d %s", status, data)
	}
	status, data, _ = f.request("POST", "/api/v1/auth/logout", "", cookie, "")
	if status != 200 {
		t.Fatalf("logout: %d %s", status, data)
	}
	status, _, _ = f.request("GET", "/api/v1/me", "", cookie, "")
	if status != 401 {
		t.Fatalf("revoked session accepted: %d", status)
	}
	status, _, _ = f.request("POST", "/api/v1/auth/login", `{"email":"session@example.test","password":"incorrect-password"}`, nil, "")
	if status != 401 {
		t.Fatalf("incorrect password accepted: %d", status)
	}
}

func TestTenantAndSameTenantAccountOwnership(t *testing.T) {
	f := newFixture(t, nil)
	u, ownerCookie, owned := f.register("owner@example.test")
	_, otherCookie, other := f.register("other-tenant@example.test")
	// Give a second real user an ADMIN role in the owner's tenant. Ownership must
	// still restrict access; a shared tenant or broad role is insufficient.
	peerHash, err := auth.HashPassword("isolated-peer-password")
	if err != nil {
		t.Fatal(err)
	}
	peer := auth.User{ID: domain.NewID(), TenantID: u.TenantID, Email: "peer-login@example.test", Role: "ADMIN", Status: "ACTIVE", PasswordHash: peerHash}
	if err := f.repo.CreateUser(context.Background(), peer, "same tenant"); err != nil {
		t.Fatal(err)
	}
	_, token, err := f.auth.Login(context.Background(), peer.Email, "isolated-peer-password")
	if err != nil {
		t.Fatal(err)
	}
	peerCookie := &http.Cookie{Name: "azuriya_session", Value: token}
	if err := f.engine.Bootstrap(context.Background(), peer.TenantID, peer.ID, "PROP_SIMULATED"); err != nil {
		t.Fatal(err)
	}
	for label, cookie := range map[string]*http.Cookie{"other tenant": otherCookie, "same tenant different owner": peerCookie} {
		t.Run(label, func(t *testing.T) {
			for _, resource := range []string{"", "/orders", "/positions", "/fills", "/transactions", "/events"} {
				status, data, _ := f.request("GET", "/api/v1/accounts/"+owned.ID+resource, "", cookie, "")
				if status != 404 {
					t.Fatalf("foreign %s exposed: %d %s", resource, status, data)
				}
			}
			status, data, _ := f.request("POST", "/api/v1/accounts/"+owned.ID+"/orders", orderBody("foreign-submit", "0.10"), cookie, "foreign-submit")
			if status != 403 && status != 404 {
				t.Fatalf("foreign trade not denied: %d %s", status, data)
			}
		})
	}
	status, data, _ := f.request("GET", "/api/v1/accounts", "", ownerCookie, "")
	if status != 200 || bytes.Contains(data, []byte(other.ID)) || bytes.Contains(data, []byte(peer.ID)) {
		t.Fatalf("account list leaks foreign scope: %d %s", status, data)
	}
	status, _, _ = f.request("POST", "/api/v1/accounts/"+owned.ID+"/orders", orderBody("legitimate", "0.10"), ownerCookie, "legitimate")
	if status != 201 {
		t.Fatalf("legitimate owner rejected: %d", status)
	}
}

func TestConcurrentOrderAndCloseReplayIsExactlyOnce(t *testing.T) {
	f := newFixture(t, nil)
	_, cookie, account := f.register("replay@example.test")
	path := "/api/v1/accounts/" + account.ID
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			status, data, _ := f.request("POST", path+"/orders", orderBody("concurrent-order", "0.10"), cookie, "concurrent-order")
			if status != 201 {
				t.Errorf("replayed submit: %d %s", status, data)
			}
		}()
	}
	wg.Wait()
	state := f.engine.Snapshot()
	if len(state.Orders) != 1 || len(state.Fills) != 1 || len(state.Positions) != 1 {
		t.Fatalf("duplicate economic effect: orders=%d fills=%d positions=%d", len(state.Orders), len(state.Fills), len(state.Positions))
	}
	status, data, _ := f.request("POST", path+"/orders", orderBody("concurrent-order", "0.20"), cookie, "concurrent-order")
	if status != 409 || !bytes.Contains(data, []byte("IDEMPOTENCY_CONFLICT")) {
		t.Fatalf("conflicting replay: %d %s", status, data)
	}
	var position domain.Position
	for _, p := range state.Positions {
		position = p
	}
	closeBody := `{"client_order_id":"partial-close","quantity":"0.04"}`
	for range 2 {
		status, data, _ = f.request("POST", path+"/positions/"+position.ID+"/close", closeBody, cookie, "partial-close")
		if status != 200 {
			t.Fatalf("close replay: %d %s", status, data)
		}
	}
	state = f.engine.Snapshot()
	if !state.Positions[position.ID].Quantity.Equal(domain.D("0.06")) || len(state.Fills) != 2 || len(state.Transactions) != 2 {
		t.Fatal("partial close replay duplicated position, fill, or ledger effects")
	}
	status, data, _ = f.request("GET", path+"/events", "", cookie, "")
	if status != 200 || !bytes.Contains(data, []byte("ORDER_FILLED")) || !bytes.Contains(data, []byte("POSITION_UPDATED")) {
		t.Fatalf("audit events missing: %d %s", status, data)
	}
	status, data, _ = f.request("GET", path, "", cookie, "")
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"balance", "equity", "margin_used", "margin_free", "margin_level", "leverage"} {
		if len(raw[field]) == 0 || raw[field][0] != '"' {
			t.Fatalf("financial field %s is not a decimal string: %s", field, raw[field])
		}
	}
}

func TestRequestValidationAndOriginBoundary(t *testing.T) {
	f := newFixture(t, nil)
	_, cookie, account := f.register("validation@example.test")
	path := "/api/v1/accounts/" + account.ID + "/orders"
	for _, body := range []string{
		`{"client_order_id":"bad","symbol":"EURUSD","side":"BUY","type":"MARKET","quantity":"0.1","tenant_id":"forged"}`,
		`{"client_order_id":"bad","symbol":"EURUSD","side":"BUY","type":"MARKET","quantity":0.1}`,
		`{"client_order_id":"bad","symbol":"EURUSD","side":"BUY","type":"MARKET","quantity":"1e1000000"}`,
		`{} {}`,
		`{"client_order_id":"` + strings.Repeat("x", 17000) + `"}`,
	} {
		status, data, _ := f.request("POST", path, body, cookie, "")
		if status != 400 {
			t.Fatalf("malformed request not rejected: %d %s", status, data)
		}
	}
	status, _, _ := f.request("POST", path, orderBody("body-key", "0.1"), cookie, "header-key")
	if status != 400 {
		t.Fatalf("conflicting idempotency keys accepted: %d", status)
	}
	req, _ := http.NewRequest("POST", f.server.URL+path, strings.NewReader(orderBody("csrf", "0.1")))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://attacker.example")
	req.AddCookie(cookie)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatalf("foreign origin accepted: %d", res.StatusCode)
	}
	if len(f.engine.Snapshot().Fills) != 0 {
		t.Fatal("invalid request created a fill")
	}
}

func TestFailedPersistenceDoesNotExposeSuccessfulTrade(t *testing.T) {
	var fail bool
	f := newFixture(t, func(context.Context, domain.State) error {
		if fail {
			return errors.New("database unavailable")
		}
		return nil
	})
	_, cookie, account := f.register("persistence@example.test")
	fail = true
	path := "/api/v1/accounts/" + account.ID + "/orders"
	status, _, _ := f.request("POST", path, orderBody("retry-after-failure", "0.1"), cookie, "retry-after-failure")
	if status < 400 {
		t.Fatalf("failed commit returned success: %d", status)
	}
	state := f.engine.Snapshot()
	if len(state.Fills) != 0 || len(state.Positions) != 0 || len(state.Orders) != 0 {
		t.Fatal("failed commit leaked trading state")
	}
	fail = false
	status, data, _ := f.request("POST", path, orderBody("retry-after-failure", "0.1"), cookie, "retry-after-failure")
	if status != 201 || len(f.engine.Snapshot().Fills) != 1 {
		t.Fatalf("safe retry failed: %d %s", status, data)
	}
}

func TestAuditHistoryPaginationAndInputBounds(t *testing.T) {
	f := newFixture(t, nil)
	_, cookie, account := f.register("audit-pages@example.test")
	base := "/api/v1/accounts/" + account.ID
	status, data, _ := f.request("POST", base+"/orders", orderBody("audit-page-order", "0.1"), cookie, "audit-page-order")
	if status != 201 {
		t.Fatalf("submit: %d %s", status, data)
	}
	status, data, _ = f.request("GET", base+"/events?limit=2", "", cookie, "")
	var newest []domain.Event
	if err := json.Unmarshal(data, &newest); err != nil {
		t.Fatal(err)
	}
	if status != 200 || len(newest) != 2 || newest[0].Sequence >= newest[1].Sequence {
		t.Fatalf("newest page: %d %s", status, data)
	}
	cursor, _ := json.Marshal(newest[0].Sequence)
	status, data, _ = f.request("GET", base+"/events?limit=2&before="+string(cursor), "", cookie, "")
	var older []domain.Event
	if err := json.Unmarshal(data, &older); err != nil {
		t.Fatal(err)
	}
	if status != 200 || len(older) != 2 || older[1].Sequence >= newest[0].Sequence {
		t.Fatalf("exclusive older page: %d %s", status, data)
	}
	for _, query := range []string{"limit=0", "limit=1001", "limit=invalid", "before=-1", "before=999999999999999999999999999999999"} {
		status, data, _ = f.request("GET", base+"/events?"+query, "", cookie, "")
		if status != 400 || !bytes.Contains(data, []byte("INVALID_PAGINATION")) {
			t.Fatalf("invalid pagination accepted: %s: %d %s", query, status, data)
		}
	}
}

func TestWebSocketTenantFiltering(t *testing.T) {
	f := newFixture(t, nil)
	_, cookieA, accountA := f.register("socket-a@example.test")
	_, cookieB, _ := f.register("socket-b@example.test")
	connect := func(cookie *http.Cookie) *websocket.Conn {
		headers := http.Header{"Origin": []string{testOrigin}, "Cookie": []string{cookie.String()}}
		conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(f.server.URL, "http")+"/api/v1/ws", headers)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.Close() })
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		var event realtime.Envelope
		if err := conn.ReadJSON(&event); err != nil {
			t.Fatal(err)
		}
		if event.Type != "system.resync" {
			t.Fatalf("missing canonical resync: %s", event.Type)
		}
		return conn
	}
	a, b := connect(cookieA), connect(cookieB)
	status, data, _ := f.request("POST", "/api/v1/accounts/"+accountA.ID+"/orders", orderBody("socket-fill", "0.1"), cookieA, "socket-fill")
	if status != 201 {
		t.Fatalf("submit: %d %s", status, data)
	}
	seenFill := false
	for range 12 {
		var event realtime.Envelope
		if err := a.ReadJSON(&event); err != nil {
			t.Fatal(err)
		}
		if event.Type == "fill.created" {
			seenFill = true
			break
		}
	}
	if !seenFill {
		t.Fatal("owner did not receive fill")
	}
	b.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	var foreign realtime.Envelope
	if err := b.ReadJSON(&foreign); err == nil {
		t.Fatalf("foreign tenant received event: %+v", foreign)
	}
}
