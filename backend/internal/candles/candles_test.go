package candles

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"azuriya/backend/internal/domain"
)

func fixture() (domain.Instrument, domain.Quote) {
	state := domain.Seed("tenant-candles", "owner-candles")
	key := domain.MarketKey("tenant-candles", "EURUSD")
	q := state.Quotes[key]
	q.Timestamp = time.Date(2026, 9, 27, 12, 0, 15, 0, time.UTC)
	return state.Instruments[key], q
}
func TestGenerateDeterministicPositiveBidHistoryAcrossAllIntervals(t *testing.T) {
	i, q := fixture()
	a, bars, err := Generate(i, q, 42, 8)
	if err != nil {
		t.Fatal(err)
	}
	other, same, err := Generate(i, q, 42, 8)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(bars)
	again, _ := json.Marshal(same)
	if string(encoded) != string(again) {
		t.Fatal("same seed/anchor rewrote history")
	}
	if len(bars) != len(Supported)*9 || len(a.Current) != 12 || len(other.Current) != 12 {
		t.Fatal("missing supported intervals")
	}
	for _, interval := range Supported {
		var previous *Candle
		count := 0
		for index := range bars {
			c := bars[index]
			if c.Interval != interval.Name {
				continue
			}
			count++
			if !c.Open.IsPositive() || !c.Close.IsPositive() || c.High.LessThan(c.Open) || c.High.LessThan(c.Close) || c.Low.GreaterThan(c.Open) || c.Low.GreaterThan(c.Close) {
				t.Fatalf("invalid OHLC: %+v", c)
			}
			if !c.Simulated || !c.CloseTime.Equal(c.OpenTime.Add(interval.Duration)) {
				t.Fatal("bad candle metadata")
			}
			if previous != nil {
				if !previous.OpenTime.Before(c.OpenTime) || !previous.Close.Equal(c.Open) {
					t.Fatalf("history continuity/order invalid for %s", interval.Name)
				}
			}
			copy := c
			previous = &copy
		}
		if count != 9 {
			t.Fatalf("interval %s count %d", interval.Name, count)
		}
		if !a.Current[interval.Name].Close.Equal(q.Bid) {
			t.Fatalf("%s history does not join executable reference BID", interval.Name)
		}
	}
	q2 := q
	q2.Ask = q.Ask.Add(domain.D("0.00010"))
	_, askChanged, _ := Generate(i, q2, 42, 8)
	encoded2, _ := json.Marshal(askChanged)
	if string(encoded) != string(encoded2) {
		t.Fatal("BID history changed when only ASK changed")
	}
}
func TestAggregateExactOHLCVolumeAndRollover(t *testing.T) {
	i, q := fixture()
	series := Series{TenantID: i.TenantID, Symbol: i.Symbol, Current: map[string]Candle{}}
	prices := []string{"1.08450", "1.08480", "1.08430", "1.08460"}
	for index, price := range prices {
		tick := q
		tick.Sequence = uint64(index + 1)
		tick.Timestamp = q.Timestamp.Add(time.Duration(index) * time.Second)
		tick.Bid = domain.D(price)
		tick.Ask = tick.Bid.Add(domain.D("0.00012"))
		next, updates, err := Aggregate(series, tick)
		if err != nil {
			t.Fatal(err)
		}
		if len(updates) < 12 || len(updates) > 24 {
			t.Fatal("update payload is not bounded incremental candles")
		}
		series = next
	}
	c := series.Current["1m"]
	if !c.Open.Equal(domain.D(prices[0])) || !c.High.Equal(domain.D(prices[1])) || !c.Low.Equal(domain.D(prices[2])) || !c.Close.Equal(domain.D(prices[3])) || c.TickVolume != 4 || c.Complete {
		t.Fatalf("incorrect aggregate: %+v", c)
	}
	replay := series.LastQuote
	next, updates, err := Aggregate(series, replay)
	if err != nil || len(updates) != 0 || next.Current["1m"].TickVolume != 4 {
		t.Fatal("duplicate event counted twice")
	}
	replay.Sequence++
	replay.Timestamp = time.Date(2026, 9, 27, 12, 1, 0, 0, time.UTC)
	next, updates, err = Aggregate(series, replay)
	if err != nil {
		t.Fatal(err)
	}
	complete := false
	for _, update := range updates {
		if update.Interval == "1m" && update.Complete {
			complete = true
			if update.TickVolume != 4 || !update.Close.Equal(c.Close) {
				t.Fatal("completed candle changed economic prices")
			}
		}
	}
	if !complete || next.Current["1m"].TickVolume != 1 {
		t.Fatal("rollover did not finalize old and start current candle")
	}
}
func TestAggregationRejectsMalformedScopeAndOutOfOrderTicks(t *testing.T) {
	i, q := fixture()
	series, _, err := Generate(i, q, 1, 1)
	if err != nil {
		t.Fatal(err)
	}
	cases := []domain.Quote{q, q, q, q}
	cases[0].TenantID = "foreign"
	cases[1].Bid = domain.D("-1")
	cases[2].Ask = q.Bid.Sub(domain.D("0.0001"))
	cases[3].Sequence++
	cases[3].Timestamp = q.Timestamp.Add(-time.Second)
	for _, bad := range cases {
		if _, _, err := Aggregate(series, bad); err == nil {
			t.Fatalf("invalid quote accepted: %+v", bad)
		}
	}
}
func TestHistoryStableOrderingQueryBoundsAndTenantIsolation(t *testing.T) {
	ctx := context.Background()
	i, q := fixture()
	repo := NewMemoryRepository()
	service := New(repo, 42)
	query := Query{Interval: "1m", Limit: 10}
	first, err := service.History(ctx, i.TenantID, i, q, query)
	if err != nil {
		t.Fatal(err)
	}
	q.Bid = q.Bid.Add(domain.D("0.00001"))
	q.Ask = q.Ask.Add(domain.D("0.00001"))
	q.Sequence++
	q.Timestamp = q.Timestamp.Add(time.Second)
	updates, err := service.OnQuote(ctx, q)
	if err != nil || len(updates) == 0 {
		t.Fatal("realtime candle update missing", err)
	}
	current, err := service.History(ctx, i.TenantID, i, q, query)
	if err != nil {
		t.Fatal(err)
	}
	if len(current) != 10 || !current[9].Close.Equal(q.Bid) {
		t.Fatal("current candle not updated")
	}
	for index := range first[:9] {
		if !first[index].Close.Equal(current[index].Close) {
			t.Fatal("refresh rewrote complete history")
		}
	}
	restarted := New(repo, 999)
	afterRestart, err := restarted.History(ctx, i.TenantID, i, q, query)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(current)
	b, _ := json.Marshal(afterRestart)
	if string(a) != string(b) {
		t.Fatal("restart regenerated persisted candles")
	}
	query.From = first[3].OpenTime
	query.To = first[7].OpenTime
	window, err := repo.History(ctx, i.TenantID, i.Symbol, query)
	if err != nil || len(window) != 4 {
		t.Fatalf("from-inclusive/to-exclusive query: %d %v", len(window), err)
	}
	if _, err = service.History(ctx, "foreign", i, q, query); err == nil {
		t.Fatal("foreign tenant history accepted")
	}
	foreign, err := repo.History(ctx, "foreign", i.Symbol, query)
	if err != nil || len(foreign) != 0 {
		t.Fatal("repository leaked history")
	}
	for _, invalid := range []Query{{Interval: "1W", Limit: 10}, {Interval: "1m", Limit: 2001}, {Interval: "1m", Limit: 0}, {Interval: "1m", Limit: 10, From: q.Timestamp, To: q.Timestamp}} {
		if invalid.Validate() == nil {
			t.Fatal("invalid query accepted")
		}
	}
}

type failingRepo struct {
	*MemoryRepository
	fail bool
}

func (r *failingRepo) Save(ctx context.Context, s Series, c []Candle) error {
	if r.fail {
		return errors.New("candle disk unavailable")
	}
	return r.MemoryRepository.Save(ctx, s, c)
}
func TestPersistenceBeforeCandlePublicationAndSafeRetry(t *testing.T) {
	ctx := context.Background()
	i, q := fixture()
	repo := &failingRepo{MemoryRepository: NewMemoryRepository()}
	service := New(repo, 1)
	if _, err := service.History(ctx, i.TenantID, i, q, Query{Interval: "1m", Limit: 1}); err != nil {
		t.Fatal(err)
	}
	repo.fail = true
	q.Sequence++
	q.Timestamp = q.Timestamp.Add(time.Second)
	q.Bid = q.Bid.Add(domain.D("0.00001"))
	q.Ask = q.Ask.Add(domain.D("0.00001"))
	if updates, err := service.OnQuote(ctx, q); err == nil || len(updates) > 0 {
		t.Fatal("failed persistence returned publishable candle")
	}
	repo.fail = false
	updates, err := service.OnQuote(ctx, q)
	if err != nil || len(updates) == 0 {
		t.Fatal("same quote could not be safely retried", err)
	}
	if duplicate, err := service.OnQuote(ctx, q); err != nil || len(duplicate) > 0 {
		t.Fatal("replayed quote republished")
	}
}
