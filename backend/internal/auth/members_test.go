package auth

import (
	"context"
	"testing"
)

func TestTenantMemberReaderScopesIdentitiesAndOmitsPasswordMaterial(t *testing.T) {
	// Returning a foreign member or a password hash would disclose credentials
	// through the administrative client directory.
	repository := NewMemoryRepository()
	service := New(repository, false)
	ctx := context.Background()
	owner, err := service.Register(ctx, "directory-owner@example.test", "safe-directory-password", "Owner")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Register(ctx, "directory-other@example.test", "safe-directory-password", "Other"); err != nil {
		t.Fatal(err)
	}
	reader, ok := any(repository).(interface {
		TenantMembers(context.Context, string) ([]User, error)
	})
	if !ok {
		t.Fatal("tenant membership directory is unavailable")
	}
	members, err := reader.TenantMembers(ctx, owner.TenantID)
	if err != nil || len(members) != 1 {
		t.Fatalf("tenant directory: %d %v", len(members), err)
	}
	if members[0].ID != owner.ID || members[0].TenantID != owner.TenantID || members[0].PasswordHash != "" {
		t.Fatal("directory scope or credential boundary failed")
	}
	if members, err = reader.TenantMembers(ctx, "foreign-tenant"); err != nil || len(members) != 0 {
		t.Fatal("foreign directory was disclosed", err)
	}
}
