package storage

import (
	"azuriya/backend/internal/domain"
	"context"
)

// Events reads committed history independently of the bounded aggregate cache.
// The account has already been authorized, and SQL still scopes by tenant/account.
func (p *Postgres) Events(ctx context.Context, tenantID, accountID string, before uint64, limit int) ([]domain.Event, error) {
	rows, err := p.Pool.Query(ctx, `SELECT id,tenant_id,account_id,aggregate_type,aggregate_id,sequence,event_type,payload,occurred_at,owner_user_id,actor_user_id,actor_role
 FROM audit_events WHERE tenant_id=$1 AND account_id=$2 AND ($3::bigint=0 OR sequence<$3) ORDER BY sequence DESC LIMIT $4`, tenantID, accountID, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []domain.Event{}
	for rows.Next() {
		var event domain.Event
		if err = rows.Scan(&event.ID, &event.TenantID, &event.AccountID, &event.AggregateType, &event.AggregateID, &event.Sequence, &event.Type, &event.Payload, &event.OccurredAt, &event.UserID, &event.ActorUserID, &event.ActorRole); err != nil {
			return nil, err
		}
		result = append(result, event)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	// Preserve the API's ascending chronological order within each newest page.
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result, nil
}
