// Package realtime fans out committed events; REST remains the resync authority.
package realtime

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/permissions"
	"context"
	"encoding/json"
	"github.com/gorilla/websocket"
	"net/http"
	"sync"
	"time"
)

type Envelope struct {
	AccountID string    `json:"account_id,omitempty"`
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	Sequence  uint64    `json:"sequence"`
	Payload   any       `json:"payload"`
}
type client struct {
	identity domain.Identity
	send     chan Envelope
	conn     *websocket.Conn
}
type Hub struct {
	mu      sync.Mutex
	clients map[*client]bool
	origin  string
	origins map[string]bool
}

func New(origin string, additionalOrigins ...string) *Hub {
	origins := map[string]bool{origin: true}
	for _, additional := range additionalOrigins {
		if additional != "" {
			origins[additional] = true
		}
	}
	return &Hub{clients: map[*client]bool{}, origin: origin, origins: origins}
}
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		_ = c.conn.Close()
		delete(h.clients, c)
	}
}
func (h *Hub) Publish(event domain.Event) {
	if event.AggregateType == "broker_admin" {
		h.broadcastCapability(event.TenantID, "audit.read", Envelope{AccountID: event.AccountID, Type: "broker.admin.updated", Timestamp: event.OccurredAt, Sequence: event.Sequence, Payload: event.Payload})
		return
	}
	if event.AccountID != "" && event.UserID == "" {
		return
	}
	names := map[string]string{"QUOTE_UPDATED": "quote.updated", "ORDER_RECEIVED": "order.updated", "ORDER_VALIDATED": "order.updated", "ORDER_ACCEPTED": "order.updated", "ORDER_TRIGGERED": "order.updated", "ORDER_FILLED": "order.updated", "ORDER_REJECTED": "order.updated", "ORDER_CANCELLED": "order.updated", "FILL_CREATED": "fill.created", "POSITION_OPENED": "position.updated", "POSITION_UPDATED": "position.updated", "POSITION_PROTECTION_UPDATED": "position.updated", "POSITION_CLOSED": "position.closed", "ACCOUNT_EQUITY_UPDATED": "account.updated", "MARGIN_WARNING": "margin.warning"}
	name, ok := names[event.Type]
	if event.Type == "ORDER_MODIFIED" {
		name = "order.updated"
		ok = true
	}
	if event.Type == "ACCOUNT_QUOTE_UPDATED" {
		name = "quote.updated"
		ok = true
	}
	if event.Type == "BROKER_CONFIGURATION_UPDATED" {
		var metadata struct {
			Revision uint64 `json:"revision"`
		}
		_ = json.Unmarshal(event.Payload, &metadata)
		if metadata.Revision == 0 {
			metadata.Revision = event.Sequence
		}
		h.Broadcast(event.TenantID, event.UserID, Envelope{AccountID: event.AccountID, Type: "broker.configuration.updated", Timestamp: event.OccurredAt, Sequence: event.Sequence, Payload: metadata})
		return
	}
	if !ok {
		return
	}
	envelope := Envelope{AccountID: event.AccountID, Type: name, Timestamp: event.OccurredAt, Sequence: event.Sequence, Payload: event.Payload}
	h.Broadcast(event.TenantID, event.UserID, envelope)
}

func (h *Hub) broadcastCapability(tenantID, capability string, envelope Envelope) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.identity.TenantID != tenantID || permissions.Require(c.identity, capability) != nil {
			continue
		}
		select {
		case c.send <- envelope:
		default:
			_ = c.conn.Close()
			delete(h.clients, c)
		}
	}
}

// Broadcast enforces tenant and optional owner scope for non-trading projections.
func (h *Hub) Broadcast(tenantID, userID string, envelope Envelope) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.identity.TenantID != tenantID || userID != "" && c.identity.UserID != userID {
			continue
		}
		select {
		case c.send <- envelope:
		default:
			_ = c.conn.Close()
			delete(h.clients, c)
		}
	}
}
func (h *Hub) Disconnect(userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.identity.UserID == userID {
			_ = c.conn.Close()
			delete(h.clients, c)
		}
	}
}

func (h *Hub) DisconnectTenant(tenantID, userID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.identity.TenantID == tenantID && c.identity.UserID == userID {
			_ = c.conn.Close()
			delete(h.clients, c)
		}
	}
}
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, id domain.Identity, valid func(context.Context) bool) {
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return h.origins[r.Header.Get("Origin")] }, HandshakeTimeout: 5 * time.Second}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{identity: id, send: make(chan Envelope, 128), conn: conn}
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
	defer func() { h.mu.Lock(); delete(h.clients, c); h.mu.Unlock(); _ = conn.Close() }()
	conn.SetReadLimit(1024)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(60 * time.Second)) })
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err = conn.WriteJSON(Envelope{Type: "system.resync", Timestamp: time.Now().UTC(), Payload: map[string]string{"reason": "connected", "execution": "SIMULATED"}}); err != nil {
		return
	}
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-r.Context().Done():
			return
		case event := <-c.send:
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if conn.WriteJSON(event) != nil {
				return
			}
		case <-ticker.C:
			if !valid(r.Context()) {
				return
			}
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if conn.WriteMessage(websocket.PingMessage, nil) != nil {
				return
			}
		}
	}
}
