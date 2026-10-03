package candles

import (
	"context"
	"sync"

	"azuriya/backend/internal/domain"
)

type Service struct {
	mu     sync.Mutex
	repo   Repository
	seed   int64
	series map[string]Series
	absent map[string]bool
}

func New(repo Repository, seed int64) *Service {
	return &Service{repo: repo, seed: seed, series: map[string]Series{}, absent: map[string]bool{}}
}

// History lazily initializes one instrument across all supported intervals.
// Persisted history is never regenerated on refresh or restart.
func (s *Service) History(ctx context.Context, tenantID string, instrument domain.Instrument, quote domain.Quote, query Query) ([]Candle, error) {
	if err := query.Validate(); err != nil {
		return nil, err
	}
	if tenantID == "" || instrument.TenantID != tenantID || quote.TenantID != tenantID || quote.Symbol != instrument.Symbol {
		return nil, domain.Err("INSTRUMENT_NOT_FOUND", "Instrument history is not available in this tenant")
	}
	s.mu.Lock()
	key := domain.MarketKey(tenantID, instrument.Symbol)
	if _, ok := s.series[key]; !ok {
		series, exists, err := s.repo.LoadSeries(ctx, tenantID, instrument.Symbol)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		if !exists {
			var generated []Candle
			series, generated, err = Generate(instrument, quote, s.seed, SeedHistoryBars)
			if err == nil {
				err = s.repo.Save(ctx, series, generated)
			}
			if err != nil {
				s.mu.Unlock()
				return nil, err
			}
		}
		s.series[key] = series
		delete(s.absent, key)
	}
	s.mu.Unlock()
	return s.repo.History(ctx, tenantID, instrument.Symbol, query)
}

// OnQuote consumes committed quotes only. Returned candle deltas are safe to
// publish after this method succeeds. It never calls into the trading engine.
func (s *Service) OnQuote(ctx context.Context, quote domain.Quote) ([]Candle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := domain.MarketKey(quote.TenantID, quote.Symbol)
	series, ok := s.series[key]
	if !ok {
		if s.absent[key] {
			return []Candle{}, nil
		}
		var err error
		series, ok, err = s.repo.LoadSeries(ctx, quote.TenantID, quote.Symbol)
		if err != nil {
			return nil, err
		}
		if !ok {
			s.absent[key] = true
			return []Candle{}, nil
		}
		s.series[key] = series
	}
	next, updates, err := Aggregate(series, quote)
	if err != nil {
		return nil, err
	}
	if len(updates) == 0 {
		return updates, nil
	}
	if err = s.repo.Save(ctx, next, updates); err != nil {
		return nil, err
	}
	s.series[key] = next
	return updates, nil
}
