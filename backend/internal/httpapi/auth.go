package httpapi

import (
	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/domain"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"
)

func (s *Server) cookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: "azuriya_session", Value: token, Path: "/", HttpOnly: true, Secure: s.config.SecureCookies, SameSite: http.SameSiteStrictMode, MaxAge: 43200})
}
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if !decode(w, r, &body) {
		return
	}
	u, err := s.auth.Register(r.Context(), body.Email, body.Password, body.Name)
	if err != nil {
		if errors.Is(err, auth.ErrExists) {
			fail(w, 409, "EMAIL_EXISTS", "This email is already registered")
		} else if errors.Is(err, auth.ErrValidation) {
			fail(w, 400, "REGISTRATION_FAILED", "Use a valid email, a 12–128 character password, and a 2–80 character workspace name")
		} else {
			domainError(w, err)
		}
		return
	}
	if err = s.engine.Bootstrap(r.Context(), u.TenantID, u.ID, "PROP_SIMULATED"); err != nil {
		domainError(w, err)
		return
	}
	_, token, err := s.auth.Login(r.Context(), body.Email, body.Password)
	if err != nil {
		domainError(w, err)
		return
	}
	s.cookie(w, token)
	write(w, 201, u)
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &body) {
		return
	}
	if len(body.Email) > 254 || len(body.Password) > 128 {
		fail(w, 400, "INVALID_REQUEST", "Credentials exceed permitted length")
		return
	}
	u, token, err := s.auth.Login(r.Context(), body.Email, body.Password)
	if err != nil {
		if errors.Is(err, auth.ErrCredentials) {
			fail(w, 401, "INVALID_CREDENTIALS", "Email or password is incorrect")
		} else {
			domainError(w, err)
		}
		return
	}
	if err := s.engine.ClientActive(domain.Identity{UserID: u.ID, TenantID: u.TenantID, Role: u.Role}); err != nil {
		if revokeErr := s.auth.Logout(r.Context(), token); revokeErr != nil {
			slog.Error("Suspended login session could not be revoked")
		}
		domainError(w, err)
		return
	}
	if err = s.engine.Bootstrap(r.Context(), u.TenantID, u.ID, "PROP_SIMULATED"); err != nil {
		domainError(w, err)
		return
	}
	s.cookie(w, token)
	write(w, 200, u)
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	c, _ := r.Cookie("azuriya_session")
	if err := s.auth.Logout(r.Context(), c.Value); err != nil {
		domainError(w, err)
		return
	}
	s.hub.Disconnect(user(r).ID)
	http.SetCookie(w, &http.Cookie{Name: "azuriya_session", Value: "", Path: "/", HttpOnly: true, Secure: s.config.SecureCookies, SameSite: http.SameSiteStrictMode, MaxAge: -1, Expires: time.Unix(0, 0)})
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) me(w http.ResponseWriter, r *http.Request) { write(w, 200, user(r)) }
func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	c, _ := r.Cookie("azuriya_session")
	s.hub.Serve(w, r, identity(r), func(ctx context.Context) bool {
		u, err := s.auth.Authenticate(ctx, c.Value)
		return err == nil && s.engine.ClientActive(domain.Identity{UserID: u.ID, TenantID: u.TenantID, Role: u.Role}) == nil
	})
}
