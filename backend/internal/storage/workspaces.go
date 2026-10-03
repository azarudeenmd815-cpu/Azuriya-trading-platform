package storage

import (
	"context"
	"encoding/json"

	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/workspaces"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WorkspaceRepository struct{ pool *pgxpool.Pool }

func NewWorkspaceRepository(pool *pgxpool.Pool) *WorkspaceRepository {
	return &WorkspaceRepository{pool: pool}
}
func workspaceRows(rows pgx.Rows) ([]workspaces.Workspace, error) {
	defer rows.Close()
	result := []workspaces.Workspace{}
	for rows.Next() {
		var payload []byte
		if err := rows.Scan(&payload); err != nil {
			return nil, err
		}
		var w workspaces.Workspace
		if err := json.Unmarshal(payload, &w); err != nil {
			return nil, err
		}
		result = append(result, w)
	}
	return result, rows.Err()
}
func (r *WorkspaceRepository) List(ctx context.Context, id domain.Identity) ([]workspaces.Workspace, error) {
	rows, err := r.pool.Query(ctx, "SELECT payload FROM trading_workspaces WHERE tenant_id=$1 AND user_id=$2 ORDER BY updated_at DESC,id", id.TenantID, id.UserID)
	if err != nil {
		return nil, err
	}
	return workspaceRows(rows)
}
func (r *WorkspaceRepository) Mutate(ctx context.Context, id domain.Identity, change workspaces.Mutation) ([]workspaces.Workspace, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	// Serializes creation and deletion even when an owner currently has no rows.
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 731))", "workspace:"+id.TenantID+":"+id.UserID); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, "SELECT payload FROM trading_workspaces WHERE tenant_id=$1 AND user_id=$2 ORDER BY updated_at DESC,id FOR UPDATE", id.TenantID, id.UserID)
	if err != nil {
		return nil, err
	}
	before, err := workspaceRows(rows)
	if err != nil {
		return nil, err
	}
	after, events, err := change(before)
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	for _, w := range after {
		if w.TenantID != id.TenantID || w.UserID != id.UserID || ids[w.ID] {
			return nil, domain.Err("FORBIDDEN", "Workspace mutation escaped authenticated ownership")
		}
		ids[w.ID] = true
		payload, err := json.Marshal(w)
		if err != nil {
			return nil, err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO trading_workspaces(id,tenant_id,user_id,selected_account,revision,payload,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
 ON CONFLICT(id) DO UPDATE SET selected_account=EXCLUDED.selected_account,revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at
 WHERE trading_workspaces.tenant_id=EXCLUDED.tenant_id AND trading_workspaces.user_id=EXCLUDED.user_id`, w.ID, w.TenantID, w.UserID, w.SelectedAccount, w.Revision, payload, w.CreatedAt, w.UpdatedAt); err != nil {
			return nil, err
		}
	}
	for _, w := range before {
		if !ids[w.ID] {
			if _, err = tx.Exec(ctx, "DELETE FROM trading_workspaces WHERE id=$1 AND tenant_id=$2 AND user_id=$3", w.ID, id.TenantID, id.UserID); err != nil {
				return nil, err
			}
		}
	}
	for _, event := range events {
		if event.TenantID != id.TenantID || event.UserID != id.UserID {
			return nil, domain.Err("FORBIDDEN", "Workspace audit actor does not match authenticated owner")
		}
		if _, err = tx.Exec(ctx, "INSERT INTO workspace_events(id,tenant_id,user_id,workspace_id,event_type,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)", event.ID, event.TenantID, event.UserID, event.WorkspaceID, event.Type, event.Payload, event.OccurredAt); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return workspaces.Clone(after), nil
}
func (r *WorkspaceRepository) Events(ctx context.Context, id domain.Identity, limit int) ([]workspaces.Event, error) {
	rows, err := r.pool.Query(ctx, "SELECT id,tenant_id,user_id,workspace_id,event_type,payload,occurred_at FROM workspace_events WHERE tenant_id=$1 AND user_id=$2 ORDER BY sequence DESC LIMIT $3", id.TenantID, id.UserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []workspaces.Event{}
	for rows.Next() {
		var event workspaces.Event
		if err = rows.Scan(&event.ID, &event.TenantID, &event.UserID, &event.WorkspaceID, &event.Type, &event.Payload, &event.OccurredAt); err != nil {
			return nil, err
		}
		result = append(result, event)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	for a, b := 0, len(result)-1; a < b; a, b = a+1, b-1 {
		result[a], result[b] = result[b], result[a]
	}
	return result, nil
}
