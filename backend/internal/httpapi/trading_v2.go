package httpapi

import (
	"azuriya/backend/internal/domain"
	"net/http"
)

func (s *Server) previewOrder(w http.ResponseWriter, r *http.Request) {
	var req domain.TradeRequest
	if !decode(w, r, &req) {
		return
	}
	v, err := s.engine.PreviewOrder(r.Context(), identity(r), r.PathValue("account"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) modifyOrder(w http.ResponseWriter, r *http.Request) {
	var req domain.ModifyOrderRequest
	if !decode(w, r, &req) || !requestKey(w, r, &req.ClientOrderID) {
		return
	}
	v, err := s.engine.ModifyOrder(r.Context(), identity(r), r.PathValue("account"), r.PathValue("order"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) previewClose(w http.ResponseWriter, r *http.Request) {
	var req domain.CloseRequest
	if !decode(w, r, &req) {
		return
	}
	v, err := s.engine.PreviewClose(r.Context(), identity(r), r.PathValue("account"), r.PathValue("position"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) previewProtection(w http.ResponseWriter, r *http.Request) {
	var req domain.ProtectionRequest
	if !decode(w, r, &req) {
		return
	}
	v, err := s.engine.PreviewProtection(r.Context(), identity(r), r.PathValue("account"), r.PathValue("position"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) breakeven(w http.ResponseWriter, r *http.Request) {
	var req domain.BreakevenRequest
	if !decode(w, r, &req) || !requestKey(w, r, &req.ClientOrderID) {
		return
	}
	v, err := s.engine.Breakeven(r.Context(), identity(r), r.PathValue("account"), r.PathValue("position"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
