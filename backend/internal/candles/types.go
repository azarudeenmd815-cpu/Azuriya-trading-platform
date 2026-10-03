// Package candles owns simulated BID-price history and incremental aggregation.
// Its prices are display data, never substitutes for executable server quotes.
package candles

import (
	"context"
	"time"

	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
)

type Interval struct {
	Name     string
	Duration time.Duration
}

var Supported = []Interval{{"1s", time.Second}, {"5s", 5 * time.Second}, {"15s", 15 * time.Second}, {"30s", 30 * time.Second}, {"1m", time.Minute}, {"3m", 3 * time.Minute}, {"5m", 5 * time.Minute}, {"15m", 15 * time.Minute}, {"30m", 30 * time.Minute}, {"1h", time.Hour}, {"4h", 4 * time.Hour}, {"1D", 24 * time.Hour}}

func ParseInterval(name string) (Interval, error) {
	for _, interval := range Supported {
		if interval.Name == name {
			return interval, nil
		}
	}
	return Interval{}, domain.Err("INVALID_INTERVAL", "Use 1s, 5s, 15s, 30s, 1m, 3m, 5m, 15m, 30m, 1h, 4h, or 1D")
}
func (i Interval) Open(at time.Time) time.Time {
	seconds := int64(i.Duration / time.Second)
	stamp := at.UTC().Unix()
	return time.Unix(stamp-stamp%seconds, 0).UTC()
}

type Candle struct {
	TenantID   string          `json:"tenant_id"`
	Symbol     string          `json:"symbol"`
	Interval   string          `json:"interval"`
	OpenTime   time.Time       `json:"open_time"`
	CloseTime  time.Time       `json:"close_time"`
	Open       decimal.Decimal `json:"open"`
	High       decimal.Decimal `json:"high"`
	Low        decimal.Decimal `json:"low"`
	Close      decimal.Decimal `json:"close"`
	TickVolume uint64          `json:"tick_volume"`
	Complete   bool            `json:"complete"`
	Sequence   uint64          `json:"sequence"`
	Simulated  bool            `json:"simulated"`
	Source     string          `json:"source"`
}
type Series struct {
	TenantID  string            `json:"tenant_id"`
	Symbol    string            `json:"symbol"`
	LastQuote domain.Quote      `json:"last_quote"`
	Current   map[string]Candle `json:"current"`
}

func (s Series) Clone() Series {
	next := s
	next.Current = make(map[string]Candle, len(s.Current))
	for key, c := range s.Current {
		next.Current[key] = c
	}
	return next
}

type Query struct {
	Interval string
	From     time.Time
	To       time.Time
	Limit    int
}

func (q Query) Validate() error {
	if _, err := ParseInterval(q.Interval); err != nil {
		return err
	}
	if q.Limit < 1 || q.Limit > 2000 {
		return domain.Err("INVALID_PAGINATION", "Candle limit must be between 1 and 2000")
	}
	if !q.From.IsZero() && !q.To.IsZero() && !q.From.Before(q.To) {
		return domain.Err("INVALID_TIME_RANGE", "from must be earlier than to")
	}
	if (!q.From.IsZero() && q.From.Unix() < 0) || (!q.To.IsZero() && q.To.Unix() < 0) {
		return domain.Err("INVALID_TIME_RANGE", "Candle times must be after the Unix epoch")
	}
	return nil
}

type Repository interface {
	LoadSeries(context.Context, string, string) (Series, bool, error)
	Save(context.Context, Series, []Candle) error
	History(context.Context, string, string, Query) ([]Candle, error)
}
