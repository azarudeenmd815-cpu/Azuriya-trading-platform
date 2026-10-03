package httpapi

import (
	"azuriya/backend/internal/candles"
	"azuriya/backend/internal/domain"
	"net/http"
	"strconv"
	"time"
)

func (s *Server) candleHistory(w http.ResponseWriter, r *http.Request) {
	if s.config.Candles == nil {
		fail(w, 503, "CANDLES_UNAVAILABLE", "Candle service is not configured")
		return
	}
	tenant := user(r).TenantID
	key := domain.MarketKey(tenant, r.PathValue("symbol"))
	snapshot := s.engine.Snapshot()
	instrument, ok := snapshot.Instruments[key]
	if !ok {
		fail(w, 404, "INSTRUMENT_NOT_FOUND", "Instrument not found")
		return
	}
	quote, ok := snapshot.Quotes[key]
	if !ok {
		fail(w, 503, "QUOTE_UNAVAILABLE", "Quote unavailable")
		return
	}
	query := candles.Query{Interval: r.URL.Query().Get("interval"), Limit: 500}
	if query.Interval == "" {
		query.Interval = "1m"
	}
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil {
			fail(w, 400, "INVALID_PAGINATION", "Candle limit must be an integer")
			return
		}
		query.Limit = limit
	}
	for _, field := range []struct {
		name  string
		value *time.Time
	}{{"from", &query.From}, {"to", &query.To}} {
		if raw := r.URL.Query().Get(field.name); raw != "" {
			parsed, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				seconds, parseErr := strconv.ParseInt(raw, 10, 64)
				if parseErr != nil {
					fail(w, 400, "INVALID_TIME_RANGE", "Candle times must be RFC3339 or Unix seconds")
					return
				}
				parsed = time.Unix(seconds, 0).UTC()
			}
			*field.value = parsed
		}
	}
	result, err := s.config.Candles.History(r.Context(), tenant, instrument, quote, query)
	if err != nil {
		domainError(w, err)
		return
	}
	write(w, 200, result)
}
