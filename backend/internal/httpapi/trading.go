package httpapi

import (
	"azuriya/backend/internal/domain"
	"net/http"
)

func requestKey(w http.ResponseWriter, r *http.Request, bodyKey *string) bool {
	k := r.Header.Get("Idempotency-Key")
	if k == "" {
		k = *bodyKey
	}
	if len(k) < 1 || len(k) > 128 {
		fail(w, 400, "IDEMPOTENCY_REQUIRED", "Provide a unique Idempotency-Key up to 128 characters")
		return false
	}
	if *bodyKey != "" && *bodyKey != k {
		fail(w, 400, "IDEMPOTENCY_MISMATCH", "Header and client_order_id must match")
		return false
	}
	*bodyKey = k
	return true
}
func (s *Server) submit(w http.ResponseWriter, r *http.Request) {
	var req domain.TradeRequest
	if !decode(w, r, &req) || !requestKey(w, r, &req.ClientOrderID) {
		return
	}
	v, err := s.engine.SubmitTrade(r.Context(), identity(r), r.PathValue("account"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 201, v)
}
func (s *Server) cancel(w http.ResponseWriter, r *http.Request) {
	v, err := s.engine.Cancel(r.Context(), identity(r), r.PathValue("account"), r.PathValue("order"))
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) close(w http.ResponseWriter, r *http.Request) {
	var req domain.CloseRequest
	if !decode(w, r, &req) || !requestKey(w, r, &req.ClientOrderID) {
		return
	}
	v, err := s.engine.Close(r.Context(), identity(r), r.PathValue("account"), r.PathValue("position"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) protection(w http.ResponseWriter, r *http.Request) {
	var req domain.ProtectionRequest
	if !decode(w, r, &req) {
		return
	}
	v, err := s.engine.SetProtection(r.Context(), identity(r), r.PathValue("account"), r.PathValue("position"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) preview(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Symbol   string `json:"symbol"`
		Side     string `json:"side"`
		Quantity string `json:"quantity"`
	}
	if !decode(w, r, &req) {
		return
	}
	v, err := s.engine.Preview(r.Context(), identity(r), r.PathValue("account"), req.Symbol, req.Side, req.Quantity)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, map[string]string{"required_margin": v})
}
