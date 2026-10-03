package storage

import (
	"azuriya/backend/internal/domain"
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

func nullableID(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func brokerBatch(batch *pgx.Batch, state domain.State, changed func(string, string, any) ([]byte, bool)) error {
	for _, profile := range state.Broker.Profiles {
		payload, dirty := changed("broker-profile/", profile.ID, profile)
		if dirty {
			batch.Queue(`INSERT INTO broker_profiles(id,tenant_id,kind,name,status,revision,payload,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at`, profile.ID, profile.TenantID, profile.Kind, profile.Name, profile.Status, profile.Revision, payload, profile.CreatedAt, profile.UpdatedAt)
		}
	}
	for _, group := range state.Broker.Groups {
		payload, dirty := changed("trading-group/", group.ID, group)
		if dirty {
			batch.Queue(`INSERT INTO trading_groups(id,tenant_id,name,status,revision,payload,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at`, group.ID, group.TenantID, group.Name, group.Status, group.Revision, payload, group.CreatedAt, group.UpdatedAt)
		}
	}
	for _, group := range state.Broker.SymbolGroups {
		payload, dirty := changed("symbol-group/", group.ID, group)
		if dirty {
			batch.Queue(`INSERT INTO symbol_groups(id,tenant_id,name,revision,payload,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at`, group.ID, group.TenantID, group.Name, group.Revision, payload, group.CreatedAt, group.UpdatedAt)
		}
	}
	for _, settings := range state.Broker.Settings {
		payload, dirty := changed("broker-settings/", settings.TenantID, settings)
		if dirty {
			batch.Queue(`INSERT INTO broker_settings(tenant_id,default_trading_group_id,revision,payload,created_at,updated_at)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id) DO UPDATE SET default_trading_group_id=EXCLUDED.default_trading_group_id,revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at`, settings.TenantID, settings.DefaultTradingGroupID, settings.Revision, payload, settings.CreatedAt, settings.UpdatedAt)
		}
	}
	for key, status := range state.Broker.ClientStatuses {
		tenantID, userID, ok := strings.Cut(key, ":")
		if !ok || tenantID == "" || userID == "" {
			return domain.Err("INVALID_STATE", "Client membership status has invalid scope")
		}
		_, dirty := changed("broker-client/", key, status)
		if dirty {
			batch.Queue("INSERT INTO broker_client_statuses(tenant_id,user_id,status) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET status=EXCLUDED.status", tenantID, userID, status)
		}
	}
	for key, checkpoint := range state.Broker.RolloverKeys {
		payload, dirty := changed("broker-rollover/", key, checkpoint)
		if !dirty {
			continue
		}
		position, ok := state.Positions[checkpoint.PositionID]
		if !ok {
			return domain.Err("INVALID_STATE", "Rollover checkpoint position is unavailable")
		}
		batch.Queue(`INSERT INTO broker_rollover_checkpoints(checkpoint_key,tenant_id,position_id,local_date,swap_plan_id,rollover_at,amount,payload)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(checkpoint_key) DO NOTHING`, key, position.TenantID, checkpoint.PositionID, checkpoint.LocalDate, checkpoint.SwapPlanID, checkpoint.RolloverAt, checkpoint.Amount.String(), payload)
	}
	return nil
}

// AdminHistory reads the complete immutable administrative stream, including
// entries older than the aggregate's recent event window.
func (p *Postgres) AdminHistory(ctx context.Context, tenantID string, before uint64, limit int) ([]domain.Event, error) {
	rows, err := p.Pool.Query(ctx, `SELECT id,tenant_id,COALESCE(account_id,''),owner_user_id,actor_user_id,actor_role,aggregate_type,aggregate_id,sequence,event_type,payload,occurred_at
 FROM audit_events WHERE tenant_id=$1 AND aggregate_type='broker_admin' AND ($2::bigint=0 OR sequence<$2) ORDER BY sequence DESC LIMIT $3`, tenantID, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []domain.Event{}
	for rows.Next() {
		var event domain.Event
		if err := rows.Scan(&event.ID, &event.TenantID, &event.AccountID, &event.UserID, &event.ActorUserID, &event.ActorRole, &event.AggregateType, &event.AggregateID, &event.Sequence, &event.Type, &event.Payload, &event.OccurredAt); err != nil {
			return nil, err
		}
		result = append(result, event)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}
	return result, nil
}
