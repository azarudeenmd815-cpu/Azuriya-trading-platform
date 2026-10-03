package realtime

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"azuriya/backend/internal/domain"
	"github.com/gorilla/websocket"
)

func TestBrokerRealtimeScopesAccountQuotesAndAdministrativeAudit(t *testing.T) {
	// Sending account-specific pricing to another owner or raw before/after audit
	// to support would disclose a client's effective commercial terms.
	hub := New("http://localhost:3000")
	clients := map[string]*client{}
	for _, fixture := range []struct{ user, tenant, role string }{{"owner", "tenant", "OWNER"}, {"support", "tenant", "SUPPORT"}, {"trader", "tenant", "TRADER"}, {"foreign", "foreign", "OWNER"}} {
		c := &client{identity: domain.Identity{UserID: fixture.user, TenantID: fixture.tenant, Role: fixture.role}, send: make(chan Envelope, 10)}
		clients[fixture.user] = c
		hub.clients[c] = true
	}
	hub.Publish(domain.Event{TenantID: "tenant", AccountID: "account", UserID: "trader", Type: "ACCOUNT_QUOTE_UPDATED", Sequence: 1, OccurredAt: time.Now(), Payload: json.RawMessage(`{"symbol":"EURUSD","bid":"1.1","ask":"1.2"}`)})
	select {
	case event := <-clients["trader"].send:
		if event.Type != "quote.updated" || event.AccountID != "account" {
			t.Fatal("account quote scope/type")
		}
	default:
		t.Fatal("owned account quote was not delivered")
	}
	for _, name := range []string{"owner", "support", "foreign"} {
		if len(clients[name].send) != 0 {
			t.Fatalf("account quote disclosed to %s", name)
		}
	}
	hub.Publish(domain.Event{TenantID: "tenant", AccountID: "account", UserID: "trader", AggregateType: "broker_admin", Type: "BALANCE_ADJUSTED", Sequence: 2, OccurredAt: time.Now(), Payload: json.RawMessage(`{"before":{"balance":"100"},"after":{"balance":"110"}}`)})
	select {
	case event := <-clients["owner"].send:
		if event.Type != "broker.admin.updated" {
			t.Fatal("admin event type")
		}
	default:
		t.Fatal("authorized audit event missing")
	}
	for _, name := range []string{"support", "trader", "foreign"} {
		if len(clients[name].send) != 0 {
			t.Fatalf("administrative audit disclosed to %s", name)
		}
	}
	hub.Publish(domain.Event{TenantID: "tenant", Type: "BROKER_CONFIGURATION_UPDATED", Sequence: 3, OccurredAt: time.Now(), Payload: json.RawMessage(`{"revision":3}`)})
	for _, name := range []string{"owner", "support", "trader"} {
		select {
		case event := <-clients[name].send:
			if event.Type != "broker.configuration.updated" {
				t.Fatal("configuration invalidation type")
			}
		default:
			t.Fatalf("configuration invalidation missing for %s", name)
		}
	}
	if len(clients["foreign"].send) != 0 {
		t.Fatal("configuration invalidation crossed tenant")
	}
}

func TestBrokerWebSocketAllowsTwoExplicitOriginsAndRejectsForeign(t *testing.T) {
	hub := New("http://localhost:3000", "http://localhost:3001")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hub.Serve(w, r, domain.Identity{TenantID: "tenant", UserID: "owner", Role: "OWNER"}, func(context.Context) bool { return true })
	}))
	defer server.Close()
	defer hub.Close()
	for _, origin := range []string{"http://localhost:3000", "http://localhost:3001", "http://foreign.invalid"} {
		header := http.Header{}
		header.Set("Origin", origin)
		connection, response, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), header)
		if origin == "http://foreign.invalid" {
			if err == nil {
				connection.Close()
				t.Fatal("foreign socket origin accepted")
			}
			if response == nil || response.StatusCode != 403 {
				t.Fatal("foreign socket status")
			}
			response.Body.Close()
			continue
		}
		if err != nil {
			t.Fatal("allowed socket origin rejected", origin, err)
		}
		connection.Close()
	}
}
