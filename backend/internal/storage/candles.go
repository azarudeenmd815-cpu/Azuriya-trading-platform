package storage

import (
	"context"
	"encoding/json"
	"errors"

	"azuriya/backend/internal/candles"
	"azuriya/backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CandleRepository struct{ pool *pgxpool.Pool }

func NewCandleRepository(pool *pgxpool.Pool) *CandleRepository { return &CandleRepository{pool: pool} }
func (r *CandleRepository) LoadSeries(ctx context.Context, tenant, symbol string) (candles.Series, bool, error) {
	var payload []byte
	err := r.pool.QueryRow(ctx, "SELECT payload FROM candle_series WHERE tenant_id=$1 AND symbol=$2", tenant, symbol).Scan(&payload)
	if errors.Is(err, pgx.ErrNoRows) {
		return candles.Series{}, false, nil
	}
	if err != nil {
		return candles.Series{}, false, err
	}
	var series candles.Series
	if err = json.Unmarshal(payload, &series); err != nil {
		return series, false, err
	}
	return series, true, nil
}
func (r *CandleRepository) Save(ctx context.Context, series candles.Series, updates []candles.Candle) error {
	encoded, err := json.Marshal(series)
	if err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 732))", "candle:"+series.TenantID+":"+series.Symbol); err != nil {
		return err
	}
	var sequence uint64
	err = tx.QueryRow(ctx, "SELECT last_sequence FROM candle_series WHERE tenant_id=$1 AND symbol=$2 FOR UPDATE", series.TenantID, series.Symbol).Scan(&sequence)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if sequence > series.LastQuote.Sequence {
		return domain.Err("REPLAYED_QUOTE", "Candle storage sequence cannot move backwards")
	}
	batch := &pgx.Batch{}
	for _, c := range updates {
		if c.TenantID != series.TenantID || c.Symbol != series.Symbol {
			return domain.Err("FORBIDDEN", "Candle update escaped its instrument scope")
		}
		batch.Queue(`INSERT INTO candles(tenant_id,symbol,interval,open_time,close_time,open,high,low,close,tick_volume,complete,sequence,source)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
 ON CONFLICT(tenant_id,symbol,interval,open_time) DO UPDATE SET high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,tick_volume=EXCLUDED.tick_volume,complete=EXCLUDED.complete,sequence=EXCLUDED.sequence,source=EXCLUDED.source
 WHERE NOT candles.complete AND candles.sequence<=EXCLUDED.sequence`, c.TenantID, c.Symbol, c.Interval, c.OpenTime, c.CloseTime, c.Open.String(), c.High.String(), c.Low.String(), c.Close.String(), c.TickVolume, c.Complete, c.Sequence, c.Source)
	}
	batch.Queue("INSERT INTO candle_series(tenant_id,symbol,last_sequence,payload) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,symbol) DO UPDATE SET last_sequence=EXCLUDED.last_sequence,payload=EXCLUDED.payload", series.TenantID, series.Symbol, series.LastQuote.Sequence, encoded)
	if err = tx.SendBatch(ctx, batch).Close(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (r *CandleRepository) History(ctx context.Context, tenant, symbol string, q candles.Query) ([]candles.Candle, error) {
	var from, to any
	if !q.From.IsZero() {
		from = q.From
	}
	if !q.To.IsZero() {
		to = q.To
	}
	rows, err := r.pool.Query(ctx, `SELECT tenant_id,symbol,interval,open_time,close_time,open::text,high::text,low::text,close::text,tick_volume,complete,sequence,source FROM candles
 WHERE tenant_id=$1 AND symbol=$2 AND interval=$3 AND ($4::timestamptz IS NULL OR open_time>=$4) AND ($5::timestamptz IS NULL OR open_time<$5)
 ORDER BY open_time DESC LIMIT $6`, tenant, symbol, q.Interval, from, to, q.Limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []candles.Candle{}
	for rows.Next() {
		var c candles.Candle
		var open, high, low, close string
		if err = rows.Scan(&c.TenantID, &c.Symbol, &c.Interval, &c.OpenTime, &c.CloseTime, &open, &high, &low, &close, &c.TickVolume, &c.Complete, &c.Sequence, &c.Source); err != nil {
			return nil, err
		}
		c.Open = domain.D(open)
		c.OpenTime = c.OpenTime.UTC()
		c.CloseTime = c.CloseTime.UTC()
		c.High = domain.D(high)
		c.Low = domain.D(low)
		c.Close = domain.D(close)
		c.Simulated = true
		result = append(result, c)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	for a, b := 0, len(result)-1; a < b; a, b = a+1, b-1 {
		result[a], result[b] = result[b], result[a]
	}
	return result, nil
}
