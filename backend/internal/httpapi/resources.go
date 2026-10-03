package httpapi

import (
	"azuriya/backend/internal/domain"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

func (s *Server) owned(w http.ResponseWriter, r *http.Request, state domain.State) (domain.Account, bool) {
	a, ok := state.Accounts[r.PathValue("account")]
	u := user(r)
	if !ok || a.UserID != u.ID || a.TenantID != u.TenantID {
		fail(w, 404, "NOT_FOUND", "Account not found")
		return domain.Account{}, false
	}
	return a, true
}
func (s *Server) accounts(w http.ResponseWriter, r *http.Request) {
	result := []domain.Account{}
	u := user(r)
	for _, a := range s.engine.Snapshot().Accounts {
		if a.UserID == u.ID && a.TenantID == u.TenantID {
			result = append(result, a)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].AccountNumber < result[j].AccountNumber })
	write(w, 200, result)
}
func (s *Server) account(w http.ResponseWriter, r *http.Request) {
	a, ok := s.owned(w, r, s.engine.Snapshot())
	if ok {
		write(w, 200, a)
	}
}
func (s *Server) instruments(w http.ResponseWriter, r *http.Request) {
	result := []domain.Instrument{}
	for _, i := range s.engine.Snapshot().Instruments {
		if i.TenantID == user(r).TenantID {
			result = append(result, i)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Symbol < result[j].Symbol })
	write(w, 200, result)
}
func (s *Server) instrument(w http.ResponseWriter, r *http.Request) {
	i, ok := s.engine.Snapshot().Instruments[domain.MarketKey(user(r).TenantID, r.PathValue("symbol"))]
	if !ok {
		fail(w, 404, "NOT_FOUND", "Instrument not found")
		return
	}
	write(w, 200, i)
}
func (s *Server) quotes(w http.ResponseWriter, r *http.Request) {
	result, err := s.engine.ClientQuotes(user(r).TenantID)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, result)
}
func (s *Server) resources(w http.ResponseWriter, r *http.Request) {
	state := s.engine.Snapshot()
	a, ok := s.owned(w, r, state)
	if !ok {
		return
	}
	parts := strings.Split(r.URL.Path, "/")
	resource := parts[len(parts)-1]
	switch resource {
	case "orders":
		result := []domain.Order{}
		for _, v := range state.Orders {
			if v.TenantID == a.TenantID && v.AccountID == a.ID {
				result = append(result, v)
			}
		}
		sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
		write(w, 200, result)
	case "positions":
		result := []domain.Position{}
		for _, v := range state.Positions {
			if v.TenantID == a.TenantID && v.AccountID == a.ID {
				result = append(result, v)
			}
		}
		sort.Slice(result, func(i, j int) bool { return result[i].OpenedAt.After(result[j].OpenedAt) })
		write(w, 200, result)
	case "fills":
		result := []domain.Fill{}
		for _, v := range state.Fills {
			if v.TenantID == a.TenantID && v.AccountID == a.ID {
				result = append(result, v)
			}
		}
		sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
		write(w, 200, result)
	case "transactions":
		result := []domain.Transaction{}
		for _, v := range state.Transactions {
			if v.TenantID == a.TenantID && v.AccountID == a.ID {
				result = append(result, v)
			}
		}
		sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt.After(result[j].CreatedAt) })
		write(w, 200, result)
	case "events":
		limit := 500
		if value := r.URL.Query().Get("limit"); value != "" {
			parsed, err := strconv.Atoi(value)
			if err != nil || parsed < 1 || parsed > 1000 {
				fail(w, 400, "INVALID_PAGINATION", "limit must be between 1 and 1000")
				return
			}
			limit = parsed
		}
		var before uint64
		if value := r.URL.Query().Get("before"); value != "" {
			parsed, err := strconv.ParseUint(value, 10, 63)
			if err != nil {
				fail(w, 400, "INVALID_PAGINATION", "before must be a positive sequence")
				return
			}
			before = parsed
		}
		if s.config.AuditHistory != nil {
			result, err := s.config.AuditHistory(r.Context(), a.TenantID, a.ID, before, limit)
			if err != nil {
				domainError(w, err)
				return
			}
			write(w, 200, result)
			return
		}
		result := []domain.Event{}
		for _, v := range state.Events {
			if v.TenantID == a.TenantID && v.AccountID == a.ID && (before == 0 || v.Sequence < before) {
				result = append(result, v)
			}
		}
		if len(result) > limit {
			result = result[len(result)-limit:]
		}
		write(w, 200, result)
	}
}
