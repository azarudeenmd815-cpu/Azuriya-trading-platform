// Package httpapi handles protocol validation and delegates domain decisions.
package httpapi

import (
	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/candles"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"azuriya/backend/internal/realtime"
	"azuriya/backend/internal/workspaces"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Config struct {
	WebOrigin      string
	AllowedOrigins []string
	SecureCookies  bool
	Health         func(context.Context) error
	AuditHistory   func(context.Context, string, string, uint64, int) ([]domain.Event, error)
	AdminHistory   func(context.Context, string, uint64, int) ([]domain.Event, error)
	Candles        *candles.Service
	Workspaces     *workspaces.Service
}
type Server struct {
	engine  *engine.Engine
	auth    *auth.Service
	hub     *realtime.Hub
	config  Config
	limiter *limiter
}
type identityKey struct{}

func New(e *engine.Engine, a *auth.Service, h *realtime.Hub, c Config) http.Handler {
	s := &Server{engine: e, auth: a, hub: h, config: c, limiter: &limiter{entries: map[string]bucket{}}}
	m := http.NewServeMux()
	m.HandleFunc("GET /healthz", s.health)
	m.HandleFunc("POST /api/v1/auth/register", s.register)
	m.HandleFunc("POST /api/v1/auth/login", s.login)
	m.Handle("POST /api/v1/auth/logout", s.protect(http.HandlerFunc(s.logout)))
	m.Handle("GET /api/v1/me", s.protect(http.HandlerFunc(s.me)))
	m.Handle("GET /api/v1/accounts", s.protect(http.HandlerFunc(s.accounts)))
	m.Handle("GET /api/v1/accounts/{account}", s.protect(http.HandlerFunc(s.account)))
	m.Handle("GET /api/v1/accounts/{account}/quotes", s.protect(http.HandlerFunc(s.accountQuotes)))
	m.Handle("GET /api/v1/accounts/{account}/effective-settings", s.protect(http.HandlerFunc(s.accountEffective)))
	m.Handle("GET /api/v1/instruments", s.protect(http.HandlerFunc(s.instruments)))
	m.Handle("GET /api/v1/instruments/{symbol}", s.protect(http.HandlerFunc(s.instrument)))
	m.Handle("GET /api/v1/quotes", s.protect(http.HandlerFunc(s.quotes)))
	m.Handle("GET /api/v1/instruments/{symbol}/candles", s.protect(http.HandlerFunc(s.candleHistory)))
	m.Handle("GET /api/v1/workspaces", s.protect(http.HandlerFunc(s.workspaceList)))
	m.Handle("POST /api/v1/workspaces", s.protect(http.HandlerFunc(s.workspaceCreate)))
	m.Handle("GET /api/v1/workspaces/events", s.protect(http.HandlerFunc(s.workspaceEvents)))
	m.Handle("GET /api/v1/workspaces/{workspace}", s.protect(http.HandlerFunc(s.workspaceGet)))
	m.Handle("PATCH /api/v1/workspaces/{workspace}", s.protect(http.HandlerFunc(s.workspaceUpdate)))
	m.Handle("DELETE /api/v1/workspaces/{workspace}", s.protect(http.HandlerFunc(s.workspaceDelete)))
	m.Handle("POST /api/v1/workspaces/{workspace}/duplicate", s.protect(http.HandlerFunc(s.workspaceDuplicate)))
	m.Handle("POST /api/v1/workspaces/{workspace}/reset", s.protect(http.HandlerFunc(s.workspaceReset)))
	for _, resource := range []string{"orders", "positions", "fills", "transactions", "events"} {
		m.Handle("GET /api/v1/accounts/{account}/"+resource, s.protect(http.HandlerFunc(s.resources)))
	}
	m.Handle("POST /api/v1/accounts/{account}/orders", s.protect(http.HandlerFunc(s.submit)))
	m.Handle("POST /api/v1/accounts/{account}/orders/preview", s.protect(http.HandlerFunc(s.previewOrder)))
	m.Handle("PATCH /api/v1/accounts/{account}/orders/{order}", s.protect(http.HandlerFunc(s.modifyOrder)))
	m.Handle("POST /api/v1/accounts/{account}/positions/{position}/close-preview", s.protect(http.HandlerFunc(s.previewClose)))
	m.Handle("POST /api/v1/accounts/{account}/positions/{position}/protection-preview", s.protect(http.HandlerFunc(s.previewProtection)))
	m.Handle("POST /api/v1/accounts/{account}/positions/{position}/breakeven", s.protect(http.HandlerFunc(s.breakeven)))
	m.Handle("POST /api/v1/accounts/{account}/orders/{order}/cancel", s.protect(http.HandlerFunc(s.cancel)))
	m.Handle("POST /api/v1/accounts/{account}/positions/{position}/close", s.protect(http.HandlerFunc(s.close)))
	m.Handle("PATCH /api/v1/accounts/{account}/positions/{position}", s.protect(http.HandlerFunc(s.protection)))
	m.Handle("POST /api/v1/accounts/{account}/margin-preview", s.protect(http.HandlerFunc(s.preview)))
	m.Handle("GET /api/v1/ws", s.protect(http.HandlerFunc(s.websocket)))
	s.adminRoutes(m)
	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "NOT_FOUND", "Endpoint not found") })
	return s.middleware(m)
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Debug("response disconnected", "error", err)
	}
}
func fail(w http.ResponseWriter, status int, code, message string) {
	write(w, status, map[string]any{"code": code, "message": message, "details": map[string]any{}})
}
func domainError(w http.ResponseWriter, err error) {
	var de *domain.Error
	if errors.As(err, &de) {
		status := 422
		switch de.Code {
		case "INVALID_REQUEST", "INVALID_DECIMAL", "INVALID_FILTER", "INVALID_PAGINATION", "INVALID_FORMAT":
			status = 400
		case "PERSISTENCE_FAILED":
			status = 503
		case "NOT_FOUND", "ACCOUNT_NOT_FOUND", "POSITION_NOT_FOUND", "ORDER_NOT_FOUND", "WORKSPACE_NOT_FOUND", "INSTRUMENT_NOT_FOUND":
			status = 404
		case "FORBIDDEN", "ACCOUNT_ACCESS_DENIED", "CLIENT_SUSPENDED":
			status = 403
		case "IDEMPOTENCY_CONFLICT", "WORKSPACE_CONFLICT", "CONFIGURATION_CONFLICT":
			status = 409
		}
		write(w, status, de)
		return
	}
	slog.Error("request failed", "error", err)
	fail(w, 503, "SERVICE_UNAVAILABLE", "The operation could not be committed. Retry using the same idempotency key.")
}

var decimalInput = regexp.MustCompile(`^-?[0-9]{1,18}(\.[0-9]{1,10})?$`)

// The boolean marks nullable trading inputs. Typed policy validation still owns
// sign, range, currency, and tick alignment after the protocol string check.
var financialInputs = map[string]bool{
	"quantity": true, "limit_price": true, "stop_price": true, "stop_loss": true, "take_profit": true,
	"risk_percent": true, "risk_amount": true, "entry_price": true, "percentage": true,
	"amount": false, "initial_balance": false, "balance": false, "leverage": false,
	"max_leverage": false, "max_leverage_override": true, "bid_markup": false, "ask_markup": false,
	"minimum_spread": false, "maximum_spread": false, "long_rate": false, "short_rate": false,
	"margin_call_level": false, "stop_out_level": false, "tick_size": false, "contract_size": false,
	"min_quantity": false, "max_quantity": false, "quantity_step": false, "default_leverage": false,
}

func financialJSON(raw json.RawMessage) bool {
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) == nil && object != nil {
		for key, value := range object {
			if nullable, financial := financialInputs[key]; financial {
				if nullable && string(value) == "null" {
					continue
				}
				var number string
				if json.Unmarshal(value, &number) != nil || !decimalInput.MatchString(number) {
					return false
				}
			} else if !financialJSON(value) {
				return false
			}
		}
		return true
	}
	var items []json.RawMessage
	if json.Unmarshal(raw, &items) == nil {
		for _, value := range items {
			if !financialJSON(value) {
				return false
			}
		}
	}
	return true
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type application/json is required")
		return false
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16384))
	if err != nil {
		fail(w, 400, "INVALID_REQUEST", "Request too large")
		return false
	}
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(raw, &fields); err != nil || fields == nil {
		fail(w, 400, "INVALID_REQUEST", "Expected a JSON object")
		return false
	}
	if !financialJSON(raw) {
		fail(w, 400, "INVALID_DECIMAL", "Financial inputs must be plain decimal strings, up to 18 integer and 10 fractional digits")
		return false
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err = d.Decode(v); err != nil {
		fail(w, 400, "INVALID_REQUEST", "Invalid JSON or unknown fields")
		return false
	}
	return true
}
func user(r *http.Request) auth.User { return r.Context().Value(identityKey{}).(auth.User) }
func identity(r *http.Request) domain.Identity {
	u := user(r)
	return domain.Identity{UserID: u.ID, TenantID: u.TenantID, Role: u.Role}
}
func (s *Server) protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie("azuriya_session")
		if err != nil {
			fail(w, 401, "UNAUTHENTICATED", "Please sign in")
			return
		}
		u, err := s.auth.Authenticate(r.Context(), c.Value)
		if err != nil {
			if !errors.Is(err, auth.ErrSession) {
				slog.Error("session lookup failed", "error", err)
			}
			fail(w, 401, "UNAUTHENTICATED", "Session expired. Please sign in again")
			return
		}
		if r.Method != "GET" && !s.limiter.allow("trading:"+u.ID, 120, time.Minute) {
			fail(w, 429, "RATE_LIMITED", "Too many requests; try again shortly")
			return
		}
		if r.URL.Path != "/api/v1/auth/logout" {
			if err := s.engine.ClientActive(domain.Identity{UserID: u.ID, TenantID: u.TenantID, Role: u.Role}); err != nil {
				domainError(w, err)
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey{}, u)))
	})
}
func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		origin := r.Header.Get("Origin")
		allowedOrigin := origin == s.config.WebOrigin
		for _, allowed := range s.config.AllowedOrigins {
			if origin == allowed {
				allowedOrigin = true
				break
			}
		}
		if origin != "" && !allowedOrigin {
			fail(w, 403, "ORIGIN_DENIED", "Request origin is not allowed")
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key")
			w.WriteHeader(204)
			return
		}
		if r.Method != "GET" && r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			fail(w, 403, "CSRF_REJECTED", "Cross-site requests are not accepted")
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/v1/auth/") {
			ip, _, _ := net.SplitHostPort(r.RemoteAddr)
			if !s.limiter.allow("auth:"+ip, 20, time.Minute) {
				fail(w, 429, "RATE_LIMITED", "Too many authentication attempts; try again shortly")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type bucket struct {
	count int
	until time.Time
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]bucket
}

func (l *limiter) allow(key string, limit int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if len(l.entries) > 10000 {
		for k, v := range l.entries {
			if now.After(v.until) {
				delete(l.entries, k)
			}
		}
		if len(l.entries) > 10000 {
			return false
		}
	}
	b := l.entries[key]
	if now.After(b.until) {
		b = bucket{until: now.Add(window)}
	}
	b.count++
	l.entries[key] = b
	return b.count <= limit
}
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if s.config.Health != nil {
		if err := s.config.Health(r.Context()); err != nil {
			fail(w, 503, "NOT_READY", "A configured dependency is unavailable")
			return
		}
	}
	write(w, 200, map[string]string{"status": "ok", "execution": "SIMULATED"})
}
