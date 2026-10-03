package httpapi

import (
	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"azuriya/backend/internal/permissions"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *Server) adminRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/admin/me", s.protect(http.HandlerFunc(s.adminMe)))
	read := func(path, resource string) {
		mux.Handle("GET /api/v1/admin/"+path, s.protect(s.adminHandler(resource, false)))
	}
	writeRoute := func(method, path, resource string) {
		mux.Handle(method+" /api/v1/admin/"+path, s.protect(s.adminHandler(resource, true)))
	}
	for _, resource := range []string{"clients", "accounts", "symbols", "trading-groups", "symbol-groups", "pricing-profiles", "commission-plans", "swap-plans", "leverage-plans", "margin-profiles", "execution-profiles", "trading-sessions"} {
		read(resource, resource)
		read(resource+"/{target}", resource)
		if resource != "clients" {
			writeRoute("POST", resource, resource)
		}
		writeRoute("PATCH", resource+"/{target}", resource)
	}
	for _, resource := range []string{"dashboard", "transactions", "settings", "audit", "risk/exposure", "risk/accounts", "dealer/positions", "dealer/orders", "dealer/executions"} {
		read(resource, resource)
	}
	writeRoute("PATCH", "settings", "settings")
	writeRoute("POST", "accounts/{target}/balance-operations", "balance-operations")
	read("accounts/{target}/effective-settings", "effective-settings")
	for _, kind := range []string{"accounts", "fills", "transactions", "positions", "exposure"} {
		read("reports/"+kind, "reports/"+kind)
	}
}

func (s *Server) adminMe(w http.ResponseWriter, r *http.Request) {
	if err := permissions.Require(identity(r), "broker.read"); err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, map[string]any{"user": user(r), "capabilities": permissions.Capabilities(user(r).Role), "execution_mode": "SIMULATED_INTERNAL"})
}

func (s *Server) adminMembers(r *http.Request) ([]engine.BrokerMember, error) {
	reader, ok := s.auth.Repo.(auth.TenantMemberReader)
	if !ok {
		return nil, domain.Err("DIRECTORY_UNAVAILABLE", "Tenant membership directory is unavailable")
	}
	users, err := reader.TenantMembers(r.Context(), user(r).TenantID)
	if err != nil {
		return nil, err
	}
	members := make([]engine.BrokerMember, 0, len(users))
	for _, u := range users {
		if u.TenantID != user(r).TenantID {
			return nil, domain.Err("FORBIDDEN", "Membership directory escaped tenant scope")
		}
		name, _, _ := strings.Cut(u.Email, "@")
		members = append(members, engine.BrokerMember{ID: u.ID, TenantID: u.TenantID, Email: u.Email, Name: name, Role: u.Role, Status: u.Status, CreatedAt: u.CreatedAt, UpdatedAt: u.UpdatedAt})
	}
	return members, nil
}

func brokerFilter(r *http.Request) (engine.BrokerFilter, error) {
	query := r.URL.Query()
	filter := engine.BrokerFilter{AccountID: query.Get("account_id"), Symbol: query.Get("symbol"), Side: query.Get("side"), Status: query.Get("status"), Search: query.Get("search"), Sort: query.Get("sort"), Limit: 200}
	if len(filter.AccountID) > 128 || len(filter.Symbol) > 32 || len(filter.Status) > 40 || len(filter.Search) > 200 {
		return filter, domain.Err("INVALID_FILTER", "Administrative filter exceeds its permitted length")
	}
	if filter.Side != "" && filter.Side != "BUY" && filter.Side != "SELL" {
		return filter, domain.Err("INVALID_FILTER", "Side must be BUY or SELL")
	}
	if filter.Sort != "" && filter.Sort != "asc" && filter.Sort != "desc" && filter.Sort != "name" && filter.Sort != "created_at" && filter.Sort != "updated_at" {
		return filter, domain.Err("INVALID_FILTER", "Unsupported report sort")
	}
	if value := query.Get("limit"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 1000 {
			return filter, domain.Err("INVALID_PAGINATION", "limit must be between 1 and 1000")
		}
		filter.Limit = n
	}
	if value := query.Get("before"); value != "" {
		n, err := strconv.ParseUint(value, 10, 63)
		if err != nil || n == 0 {
			return filter, domain.Err("INVALID_PAGINATION", "before must be a positive sequence")
		}
		filter.Before = n
	}
	for key, target := range map[string]*time.Time{"from": &filter.From, "to": &filter.To} {
		if value := query.Get(key); value != "" {
			parsed, err := time.Parse(time.RFC3339, value)
			if err != nil {
				parsed, err = time.Parse("2006-01-02", value)
			}
			if err != nil {
				return filter, domain.Err("INVALID_FILTER", "Date filters must be RFC3339 timestamps or YYYY-MM-DD dates")
			}
			*target = parsed.UTC()
		}
	}
	if !filter.From.IsZero() && !filter.To.IsZero() && !filter.To.After(filter.From) {
		return filter, domain.Err("INVALID_FILTER", "to must be after from")
	}
	return filter, nil
}

func adminBody(w http.ResponseWriter, r *http.Request) (json.RawMessage, bool) {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type application/json is required")
		return nil, false
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
	if err != nil {
		fail(w, 400, "INVALID_REQUEST", "Administrative request is limited to 64 KiB")
		return nil, false
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		fail(w, 400, "INVALID_REQUEST", "Expected a JSON object")
		return nil, false
	}
	if !financialJSON(raw) {
		fail(w, 400, "INVALID_DECIMAL", "Financial inputs must be bounded plain decimal strings")
		return nil, false
	}
	if err = engine.ValidateBrokerPayload(raw); err != nil {
		var de *domain.Error
		if errors.As(err, &de) {
			fail(w, 400, de.Code, de.Message)
		} else {
			domainError(w, err)
		}
		return nil, false
	}
	return raw, true
}

func (s *Server) adminHandler(resource string, mutation bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capability := permissions.Capability(resource, mutation)
		if mutation && resource == "accounts" && r.PathValue("target") == "" {
			capability = "accounts.create"
		}
		if err := permissions.Require(identity(r), capability); err != nil {
			domainError(w, err)
			return
		}
		if mutation {
			body, ok := adminBody(w, r)
			if !ok {
				return
			}
			if resource == "balance-operations" {
				var fields map[string]json.RawMessage
				_ = json.Unmarshal(body, &fields)
				var operationID string
				_ = json.Unmarshal(fields["client_operation_id"], &operationID)
				if !requestKey(w, r, &operationID) {
					return
				}
				fields["client_operation_id"], _ = json.Marshal(operationID)
				body, _ = json.Marshal(fields)
			}
			members, err := s.adminMembers(r)
			if err != nil {
				domainError(w, err)
				return
			}
			result, err := s.engine.BrokerWrite(r.Context(), identity(r), resource, r.PathValue("target"), body, members)
			if err != nil {
				domainError(w, err)
				return
			}
			if resource == "clients" {
				var request struct {
					Status string `json:"status"`
				}
				_ = json.Unmarshal(body, &request)
				if request.Status == "SUSPENDED" {
					s.hub.DisconnectTenant(user(r).TenantID, r.PathValue("target"))
				}
			}
			status := 200
			if r.Method == "POST" {
				status = 201
			}
			write(w, status, result)
			return
		}
		filter, err := brokerFilter(r)
		if err != nil {
			var de *domain.Error
			_ = errors.As(err, &de)
			fail(w, 400, de.Code, de.Message)
			return
		}
		if resource == "effective-settings" && filter.Symbol == "" {
			filter.Symbol = "EURUSD"
		}
		format := r.URL.Query().Get("format")
		if format != "" && format != "json" && format != "csv" {
			fail(w, 400, "INVALID_FORMAT", "Report format must be json or csv")
			return
		}
		if format == "csv" && !strings.HasPrefix(resource, "reports/") {
			fail(w, 400, "INVALID_FORMAT", "CSV is available on report endpoints")
			return
		}
		members, err := s.adminMembers(r)
		if err != nil {
			domainError(w, err)
			return
		}
		if format == "csv" {
			kind := strings.TrimPrefix(resource, "reports/")
			body, err := s.engine.BrokerCSV(identity(r), kind, filter, members)
			if err != nil {
				domainError(w, err)
				return
			}
			w.Header().Set("Content-Type", "text/csv; charset=utf-8")
			w.Header().Set("Content-Disposition", `attachment; filename="azuriya-`+kind+`.csv"`)
			w.WriteHeader(200)
			_, _ = w.Write(body)
			return
		}
		if resource == "audit" && s.config.AdminHistory != nil {
			events, err := s.config.AdminHistory(r.Context(), user(r).TenantID, filter.Before, filter.Limit)
			if err != nil {
				domainError(w, err)
				return
			}
			result := []domain.Event{}
			for _, event := range events {
				if event.TenantID != user(r).TenantID {
					domainError(w, domain.Err("FORBIDDEN", "Audit query escaped tenant scope"))
					return
				}
				if filter.AccountID != "" && event.AccountID != filter.AccountID || !filter.From.IsZero() && event.OccurredAt.Before(filter.From) || !filter.To.IsZero() && !event.OccurredAt.Before(filter.To) || filter.Search != "" && !strings.Contains(strings.ToLower(string(event.Payload)+event.Type), strings.ToLower(filter.Search)) {
					continue
				}
				result = append(result, event)
			}
			write(w, 200, result)
			return
		}
		result, err := s.engine.BrokerRead(identity(r), resource, r.PathValue("target"), filter, members)
		if err != nil {
			domainError(w, err)
			return
		}
		write(w, 200, result)
	})
}

func (s *Server) accountEffective(w http.ResponseWriter, r *http.Request) {
	symbol := r.URL.Query().Get("symbol")
	if symbol == "" {
		symbol = "EURUSD"
	}
	value, err := s.engine.EffectiveConfiguration(r.Context(), identity(r), r.PathValue("account"), symbol)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, value)
}

func (s *Server) accountQuotes(w http.ResponseWriter, r *http.Request) {
	value, err := s.engine.AccountQuotes(r.Context(), identity(r), r.PathValue("account"))
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, value)
}
