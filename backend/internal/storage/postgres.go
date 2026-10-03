// Package storage owns durable infrastructure, never trading decisions.
package storage

import (
	"context"

	"azuriya/backend/internal/auth"
	"azuriya/backend/internal/domain"
	"azuriya/backend/migrations"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"sync/atomic"
	"time"
)

type Postgres struct {
	Pool         *pgxpool.Pool
	writer       *pgxpool.Conn
	cached       map[string][]byte
	lastSequence uint64
	uncertain    atomic.Bool
}

// Healthy fails closed after an indeterminate commit. Restart reloads the durable
// canonical state; blindly retrying writes could otherwise replace committed data.
func (p *Postgres) Healthy(ctx context.Context) error {
	if p.uncertain.Load() {
		return errors.New("commit outcome uncertain; restart required to reload canonical state")
	}
	return p.Pool.Ping(ctx)
}

func Open(ctx context.Context, url string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	writer, err := pool.Acquire(ctx)
	if err != nil {
		pool.Close()
		return nil, err
	}
	var ok bool
	if err = writer.QueryRow(ctx, "SELECT pg_try_advisory_lock(782049231)").Scan(&ok); err != nil || !ok {
		writer.Release()
		pool.Close()
		return nil, fmt.Errorf("another engine writer holds this database, or writer lock failed: %v", err)
	}
	return &Postgres{Pool: pool, writer: writer, cached: map[string][]byte{}}, nil
}
func (p *Postgres) Close() {
	if p.writer != nil {
		_, _ = p.writer.Exec(context.Background(), "SELECT pg_advisory_unlock(782049231)")
		p.writer.Release()
	}
	p.Pool.Close()
}
func (p *Postgres) Migrate(ctx context.Context) error {
	if _, err := p.Pool.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	entries, err := migrations.Files.ReadDir(".")
	if err != nil {
		return err
	}
	for _, entry := range entries {
		var exists bool
		if err = p.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)", entry.Name()).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		data, e := migrations.Files.ReadFile(entry.Name())
		if e != nil {
			return e
		}
		tx, e := p.Pool.Begin(ctx)
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, string(data)); e == nil {
			_, e = tx.Exec(ctx, "INSERT INTO schema_migrations(name) VALUES($1)", entry.Name())
		}
		if e != nil {
			_ = tx.Rollback(ctx)
			return e
		}
		if e = tx.Commit(ctx); e != nil {
			return e
		}
	}
	return nil
}
func (p *Postgres) Load(ctx context.Context) (domain.State, error) {
	var payload []byte
	err := p.Pool.QueryRow(ctx, "SELECT payload FROM engine_state WHERE singleton=true").Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.EmptyState(), nil
	}
	if err != nil {
		return domain.State{}, err
	}
	var state domain.State
	err = json.Unmarshal(payload, &state)
	return state, err
}
func (p *Postgres) CreateUser(ctx context.Context, u auth.User, name string) error {
	tx, err := p.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, "INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)", u.TenantID, name, u.TenantID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO users(id,email,password_hash,status) VALUES($1,$2,$3,$4)", u.ID, u.Email, u.PasswordHash, u.Status)
	if err != nil {
		var pgerr *pgconn.PgError
		if errors.As(err, &pgerr) && pgerr.Code == "23505" {
			return auth.ErrExists
		}
		return err
	}
	_, err = tx.Exec(ctx, "INSERT INTO tenant_memberships(user_id,tenant_id,role) VALUES($1,$2,$3)", u.ID, u.TenantID, u.Role)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

const userColumns = "u.id,u.email,u.password_hash,u.status,u.created_at,u.updated_at,m.tenant_id,m.role"

func readUser(row pgx.Row) (auth.User, error) {
	var u auth.User
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Status, &u.CreatedAt, &u.UpdatedAt, &u.TenantID, &u.Role)
	return u, err
}
func (p *Postgres) UserByEmail(ctx context.Context, email string) (auth.User, error) {
	u, err := readUser(p.Pool.QueryRow(ctx, "SELECT "+userColumns+" FROM users u JOIN tenant_memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE u.email=$1 AND t.status='ACTIVE' ORDER BY m.tenant_id LIMIT 1", email))
	if errors.Is(err, pgx.ErrNoRows) {
		err = auth.ErrCredentials
	}
	return u, err
}
func (p *Postgres) PutSession(ctx context.Context, s auth.Session) error {
	_, err := p.Pool.Exec(ctx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", s.Hash, s.UserID, s.ExpiresAt)
	return err
}
func (p *Postgres) SessionUser(ctx context.Context, hash string, now time.Time) (auth.User, error) {
	u, err := readUser(p.Pool.QueryRow(ctx, "SELECT "+userColumns+" FROM sessions s JOIN users u ON u.id=s.user_id JOIN tenant_memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.status='ACTIVE' AND t.status='ACTIVE' ORDER BY m.tenant_id LIMIT 1", hash, now))
	if errors.Is(err, pgx.ErrNoRows) {
		err = auth.ErrSession
	}
	return u, err
}
func (p *Postgres) DeleteSession(ctx context.Context, hash string) error {
	_, err := p.Pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", hash)
	return err
}
