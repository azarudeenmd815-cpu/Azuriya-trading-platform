package auth

import (
	"context"
	"testing"
)

func TestPasswordAndSessions(t *testing.T) {
	s := New(NewMemoryRepository(), false)
	ctx := context.Background()
	u, e := s.Register(ctx, "test@example.test", "secure-test-password", "Test tenant")
	if e != nil {
		t.Fatal(e)
	}
	if VerifyPassword(u.PasswordHash, "wrong") {
		t.Fatal("incorrect password accepted")
	}
	_, token, e := s.Login(ctx, u.Email, "secure-test-password")
	if e != nil {
		t.Fatal(e)
	}
	got, e := s.Authenticate(ctx, token)
	if e != nil || got.TenantID != u.TenantID {
		t.Fatal("session context mismatch", e)
	}
	if e = s.Logout(ctx, token); e != nil {
		t.Fatal(e)
	}
	if _, e = s.Authenticate(ctx, token); e == nil {
		t.Fatal("revoked session accepted")
	}
}
