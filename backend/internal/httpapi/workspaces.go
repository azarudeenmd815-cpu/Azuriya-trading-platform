package httpapi

import (
	"azuriya/backend/internal/workspaces"
	"net/http"
	"strconv"
)

func (s *Server) workspaceReady(w http.ResponseWriter) bool {
	if s.config.Workspaces == nil {
		fail(w, 503, "WORKSPACES_UNAVAILABLE", "Workspace service is not configured")
		return false
	}
	return true
}
func (s *Server) workspaceList(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	v, err := s.config.Workspaces.List(r.Context(), identity(r))
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) workspaceGet(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	v, err := s.config.Workspaces.Get(r.Context(), identity(r), r.PathValue("workspace"))
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) workspaceCreate(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	var req workspaces.Patch
	if !decode(w, r, &req) {
		return
	}
	v, err := s.config.Workspaces.Create(r.Context(), identity(r), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 201, v)
}
func (s *Server) workspaceUpdate(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	var req workspaces.Patch
	if !decode(w, r, &req) {
		return
	}
	v, err := s.config.Workspaces.Update(r.Context(), identity(r), r.PathValue("workspace"), req)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) workspaceDelete(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	v, err := s.config.Workspaces.Delete(r.Context(), identity(r), r.PathValue("workspace"))
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) workspaceDuplicate(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &req) {
		return
	}
	v, err := s.config.Workspaces.Duplicate(r.Context(), identity(r), r.PathValue("workspace"), req.Name)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 201, v)
}
func (s *Server) workspaceReset(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	v, err := s.config.Workspaces.Reset(r.Context(), identity(r), r.PathValue("workspace"))
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
func (s *Server) workspaceEvents(w http.ResponseWriter, r *http.Request) {
	if !s.workspaceReady(w) {
		return
	}
	limit := 100
	if raw := r.URL.Query().Get("limit"); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 500 {
			fail(w, 400, "INVALID_PAGINATION", "limit must be 1 to 500")
			return
		}
		limit = v
	}
	v, err := s.config.Workspaces.Events(r.Context(), identity(r), limit)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, v)
}
