package storage

import (
	"context"

	"azuriya/backend/internal/auth"
)

func (p *Postgres) TenantMembers(ctx context.Context, tenantID string) ([]auth.User, error) {
	rows, err := p.Pool.Query(ctx, `SELECT u.id,u.email,u.status,u.created_at,u.updated_at,m.tenant_id,m.role
 FROM users u JOIN tenant_memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 ORDER BY u.email,u.id`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []auth.User{}
	for rows.Next() {
		var user auth.User
		if err := rows.Scan(&user.ID, &user.Email, &user.Status, &user.CreatedAt, &user.UpdatedAt, &user.TenantID, &user.Role); err != nil {
			return nil, err
		}
		result = append(result, user)
	}
	return result, rows.Err()
}
