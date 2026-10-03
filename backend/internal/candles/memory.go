package candles

import (
	"azuriya/backend/internal/domain"
	"context"
	"sort"
	"sync"
)

type MemoryRepository struct {
	mu      sync.Mutex
	series  map[string]Series
	candles map[string]map[string]Candle
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{series: map[string]Series{}, candles: map[string]map[string]Candle{}}
}
func (m *MemoryRepository) LoadSeries(ctx context.Context, tenant, symbol string) (Series, bool, error) {
	if err := ctx.Err(); err != nil {
		return Series{}, false, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.series[domain.MarketKey(tenant, symbol)]
	return s.Clone(), ok, nil
}
func (m *MemoryRepository) Save(ctx context.Context, series Series, updates []Candle) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	key := domain.MarketKey(series.TenantID, series.Symbol)
	if old, exists := m.series[key]; exists && old.LastQuote.Sequence > series.LastQuote.Sequence {
		return domain.Err("REPLAYED_QUOTE", "Candle storage sequence cannot move backwards")
	}
	if m.candles[key] == nil {
		m.candles[key] = map[string]Candle{}
	}
	for _, c := range updates {
		candleKey := c.Interval + ":" + c.OpenTime.String()
		old, exists := m.candles[key][candleKey]
		if !exists || (!old.Complete && old.Sequence <= c.Sequence) {
			m.candles[key][candleKey] = c
		}
	}
	m.series[key] = series.Clone()
	return nil
}
func (m *MemoryRepository) History(ctx context.Context, tenant, symbol string, q Query) ([]Candle, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	result := []Candle{}
	for _, c := range m.candles[domain.MarketKey(tenant, symbol)] {
		if c.Interval == q.Interval && (q.From.IsZero() || !c.OpenTime.Before(q.From)) && (q.To.IsZero() || c.OpenTime.Before(q.To)) {
			result = append(result, c)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].OpenTime.Before(result[j].OpenTime) })
	if len(result) > q.Limit {
		result = result[len(result)-q.Limit:]
	}
	return result, nil
}
