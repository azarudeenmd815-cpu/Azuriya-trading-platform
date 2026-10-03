package storage

import (
	"azuriya/backend/internal/domain"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"log/slog"
)

// Save commits authoritative state, materialized resources, ledger, and event log
// together on the advisory-lock connection. Cache changes only follow commit.
func (p *Postgres) Save(ctx context.Context, s domain.State) (err error) {
	defer func() {
		if err != nil {
			slog.Error("PostgreSQL trading transaction failed", "error", err)
		}
	}()
	if p.uncertain.Load() {
		return errors.New("storage is unavailable after an uncertain commit; restart required")
	}
	snapshot := s
	if len(snapshot.Events) > domain.RecentEventLimit {
		snapshot.Events = snapshot.Events[len(snapshot.Events)-domain.RecentEventLimit:]
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	tx, err := p.writer.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	batch := &pgx.Batch{}
	next := make(map[string][]byte, len(p.cached))
	for k, v := range p.cached {
		next[k] = v
	}
	changed := func(prefix, id string, value any) ([]byte, bool) {
		b, e := json.Marshal(value)
		if e != nil {
			panic(e)
		}
		key := prefix + id
		different := !bytes.Equal(p.cached[key], b)
		next[key] = b
		return b, different
	}
	if err = brokerBatch(batch, s, changed); err != nil {
		return err
	}
	for _, a := range s.Accounts {
		b, d := changed("account/", a.ID, a)
		if !d {
			continue
		}
		var leverageOverride any
		if a.MaxLeverageOverride != nil {
			leverageOverride = a.MaxLeverageOverride.String()
		}
		batch.Queue(`INSERT INTO trading_accounts(id,tenant_id,user_id,account_number,mode,status,currency,balance,equity,margin_used,margin_free,margin_level,leverage,position_mode,payload,trading_group_id,max_leverage_override)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
 ON CONFLICT(id) DO UPDATE SET account_number=EXCLUDED.account_number,mode=EXCLUDED.mode,status=EXCLUDED.status,currency=EXCLUDED.currency,balance=EXCLUDED.balance,equity=EXCLUDED.equity,margin_used=EXCLUDED.margin_used,margin_free=EXCLUDED.margin_free,margin_level=EXCLUDED.margin_level,leverage=EXCLUDED.leverage,position_mode=EXCLUDED.position_mode,payload=EXCLUDED.payload,trading_group_id=EXCLUDED.trading_group_id,max_leverage_override=EXCLUDED.max_leverage_override`, a.ID, a.TenantID, a.UserID, a.AccountNumber, a.Mode, a.Status, a.Currency, a.Balance.String(), a.Equity.String(), a.MarginUsed.String(), a.MarginFree.String(), a.MarginLevel.String(), a.Leverage.String(), a.PositionMode, b, nullableID(a.TradingGroupID), leverageOverride)
	}
	for _, i := range s.Instruments {
		b, d := changed("instrument/", i.ID, i)
		if d {
			batch.Queue("INSERT INTO instruments(id,tenant_id,symbol,trading_status,payload,symbol_group_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET trading_status=EXCLUDED.trading_status,payload=EXCLUDED.payload,symbol_group_id=EXCLUDED.symbol_group_id", i.ID, i.TenantID, i.Symbol, i.TradingStatus, b, nullableID(i.SymbolGroupID))
		}
	}
	for _, o := range s.Orders {
		b, d := changed("order/", o.ID, o)
		if d {
			batch.Queue("INSERT INTO orders(id,tenant_id,account_id,client_order_id,status,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload", o.ID, o.TenantID, o.AccountID, o.ClientOrderID, o.Status, b)
		}
	}
	for _, v := range s.Positions {
		b, d := changed("position/", v.ID, v)
		if d {
			batch.Queue("INSERT INTO positions(id,tenant_id,account_id,status,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload", v.ID, v.TenantID, v.AccountID, v.Status, b)
		}
	}
	for _, f := range s.Fills {
		b, d := changed("fill/", f.ID, f)
		if d {
			batch.Queue("INSERT INTO fills(id,tenant_id,account_id,order_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING", f.ID, f.TenantID, f.AccountID, f.OrderID, b)
		}
	}
	for _, v := range s.Transactions {
		b, d := changed("transaction/", v.ID, v)
		if d {
			batch.Queue("INSERT INTO account_transactions(id,tenant_id,account_id,type,amount,created_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING", v.ID, v.TenantID, v.AccountID, v.Type, v.Amount.String(), v.CreatedAt, b)
		}
	}
	for _, ev := range s.Events {
		if ev.Sequence > p.lastSequence {
			batch.Queue("INSERT INTO audit_events(id,tenant_id,account_id,aggregate_type,aggregate_id,sequence,event_type,payload,occurred_at,owner_user_id,actor_user_id,actor_role) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO NOTHING", ev.ID, ev.TenantID, ev.AccountID, ev.AggregateType, ev.AggregateID, ev.Sequence, ev.Type, ev.Payload, ev.OccurredAt, ev.UserID, ev.ActorUserID, ev.ActorRole)
		}
	}
	batch.Queue("INSERT INTO engine_state(singleton,payload) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET version=engine_state.version+1,payload=EXCLUDED.payload,updated_at=now()", raw)
	results := tx.SendBatch(ctx, batch)
	if err = results.Close(); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		p.uncertain.Store(true)
		return err
	}
	p.cached = next
	p.lastSequence = s.Sequence
	return nil
}
