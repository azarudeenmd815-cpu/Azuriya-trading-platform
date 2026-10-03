package marketdata

import (
	"azuriya/backend/internal/domain"
	"context"
	"github.com/shopspring/decimal"
	"math/rand"
	"sync"
	"time"
)

type MarketDataProvider interface {
	Next(context.Context, domain.Instrument, domain.Quote) (domain.Quote, error)
}
type Simulator struct {
	mu          sync.Mutex
	random      *rand.Rand
	SpreadTicks int64
}

func NewSimulator(seed int64) *Simulator { return &Simulator{random: rand.New(rand.NewSource(seed))} }

// Next uses integer random steps and decimal arithmetic; seed fixes the price path.
func (s *Simulator) Next(ctx context.Context, i domain.Instrument, previous domain.Quote) (domain.Quote, error) {
	if err := ctx.Err(); err != nil {
		return domain.Quote{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// Tick amplitudes express instrument-specific development volatility using
	// integer steps. No generated historical candle is an executable price.
	amplitude := map[string]int{"EURUSD": 7, "GBPUSD": 10, "USDJPY": 9, "XAUUSD": 120, "US100": 160, "BTCUSD": 6000}[i.Symbol]
	if amplitude == 0 {
		amplitude = 7
	}
	step := i.TickSize.Mul(decimal.NewFromInt(int64(s.random.Intn(2*amplitude+1) - amplitude)))
	spread := previous.Ask.Sub(previous.Bid)
	if s.SpreadTicks > 0 {
		spread = i.TickSize.Mul(decimal.NewFromInt(s.SpreadTicks))
	}
	bid := previous.Bid.Add(step)
	if !bid.IsPositive() {
		bid = i.TickSize
	}
	return domain.Quote{TenantID: i.TenantID, Symbol: i.Symbol, Bid: bid, Ask: bid.Add(spread), Timestamp: time.Now().UTC(), Sequence: previous.Sequence + 1, Simulated: true}, nil
}

func Validate(i domain.Instrument, q domain.Quote, previous *domain.Quote, now time.Time) error {
	if !domain.ValidInputDecimal(q.Bid) || !domain.ValidInputDecimal(q.Ask) || !i.TickSize.IsPositive() {
		return domain.Err("INVALID_QUOTE", "Quote precision or instrument tick size is unsupported")
	}
	if q.Symbol != i.Symbol || !q.Bid.IsPositive() || q.Ask.LessThan(q.Bid) || q.Sequence == 0 || q.Timestamp.IsZero() {
		return domain.Err("INVALID_QUOTE", "Quote must have a valid symbol, positive bid/ask, timestamp, and sequence")
	}
	if !q.Bid.Mod(i.TickSize).IsZero() || !q.Ask.Mod(i.TickSize).IsZero() {
		return domain.Err("INVALID_QUOTE", "Quote prices are not aligned to tick size")
	}
	if q.Ask.Sub(q.Bid).GreaterThan(q.Bid.Mul(domain.D("0.05"))) {
		return domain.Err("INVALID_QUOTE", "Quote spread exceeds the 5% feed guard")
	}
	if q.Timestamp.Before(now.Add(-30*time.Second)) || q.Timestamp.After(now.Add(5*time.Second)) {
		return domain.Err("STALE_QUOTE", "Quote timestamp is stale or in the future")
	}
	if previous != nil {
		if q.Sequence <= previous.Sequence || q.Timestamp.Before(previous.Timestamp) {
			return domain.Err("REPLAYED_QUOTE", "Quote sequence and timestamp must be monotonic")
		}
		if q.Bid.Sub(previous.Bid).Abs().GreaterThan(previous.Bid.Mul(domain.D("0.20"))) {
			return domain.Err("INVALID_QUOTE", "Quote change exceeds the 20% feed guard")
		}
	}
	return nil
}
func Fresh(q domain.Quote, now time.Time) error {
	if q.Timestamp.Before(now.Add(-30*time.Second)) || q.Timestamp.After(now.Add(5*time.Second)) {
		return domain.Err("STALE_QUOTE", "Executable quote is stale")
	}
	return nil
}
