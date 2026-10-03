package candles

import (
	"hash/fnv"
	"time"

	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
)

const SeedHistoryBars = 300

// Historical development data samples a deterministic, continuous multi-scale
// BID path. All intervals use the same timestamp function and latest-quote anchor;
// the generator never changes the trading simulator or its executable quotes.
// Backfill is synthetic sampled history, not a claim of historical market ticks.
type pricePath struct {
	seed      uint64
	amplitude int64
	anchor    int64
	bid, tick decimal.Decimal
}

func mix(value uint64) uint64 {
	value += 0x9e3779b97f4a7c15
	value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9
	value = (value ^ (value >> 27)) * 0x94d049bb133111eb
	return value ^ (value >> 31)
}
func (p pricePath) wave(timestamp, period, amplitude int64, salt uint64) int64 {
	index := timestamp / period
	offset := timestamp % period
	left := int64(mix(p.seed^uint64(index)^salt)%uint64(2*amplitude+1)) - amplitude
	right := int64(mix(p.seed^uint64(index+1)^salt)%uint64(2*amplitude+1)) - amplitude
	return left + (right-left)*offset/period
}
func (p pricePath) displacement(timestamp int64) int64 {
	return p.wave(timestamp, 7*86400, p.amplitude, 11) + p.wave(timestamp, 86400, max(1, p.amplitude/3), 29) + p.wave(timestamp, 3600, max(1, p.amplitude/12), 47) + p.wave(timestamp, 60, max(1, p.amplitude/240), 71) + p.wave(timestamp, 5, max(1, p.amplitude/1600), 97)
}
func (p pricePath) at(timestamp int64) decimal.Decimal {
	value := p.bid.Add(p.tick.Mul(decimal.NewFromInt(p.displacement(timestamp) - p.displacement(p.anchor))))
	if !value.IsPositive() {
		return p.tick
	}
	return value
}

func Generate(instrument domain.Instrument, anchor domain.Quote, seed int64, count int) (Series, []Candle, error) {
	if instrument.TenantID == "" || anchor.TenantID != instrument.TenantID || anchor.Symbol != instrument.Symbol || !anchor.Bid.IsPositive() || anchor.Ask.LessThan(anchor.Bid) || anchor.Timestamp.IsZero() || anchor.Sequence == 0 || !instrument.TickSize.IsPositive() {
		return Series{}, nil, domain.Err("INVALID_QUOTE", "History generation requires a valid instrument and quote anchor")
	}
	if count < 1 || count > 2000 {
		return Series{}, nil, domain.Err("INVALID_PAGINATION", "Seed history count must be between 1 and 2000")
	}
	amplitude := map[string]int64{"EURUSD": 480, "GBPUSD": 650, "USDJPY": 500, "XAUUSD": 14000, "US100": 14000, "BTCUSD": 500000}[instrument.Symbol]
	if amplitude == 0 {
		amplitude = 500
	}
	hash := fnv.New64a()
	_, _ = hash.Write([]byte(instrument.TenantID + ":" + instrument.Symbol))
	path := pricePath{seed: uint64(seed) ^ hash.Sum64(), amplitude: amplitude, anchor: anchor.Timestamp.Unix(), bid: anchor.Bid, tick: instrument.TickSize}
	series := Series{TenantID: instrument.TenantID, Symbol: instrument.Symbol, LastQuote: anchor, Current: map[string]Candle{}}
	result := make([]Candle, 0, (count+1)*len(Supported))
	for _, interval := range Supported {
		currentOpen := interval.Open(anchor.Timestamp)
		for offset := count; offset >= 0; offset-- {
			open := currentOpen.Add(-time.Duration(offset) * interval.Duration)
			closeTime := open.Add(interval.Duration)
			sampleEnd := closeTime.Unix()
			if offset == 0 {
				sampleEnd = anchor.Timestamp.Unix()
			}
			price := path.at(open.Unix())
			candle := Candle{TenantID: instrument.TenantID, Symbol: instrument.Symbol, Interval: interval.Name, OpenTime: open, CloseTime: closeTime, Open: price, High: price, Low: price, Close: price, Complete: offset > 0, Simulated: true, Source: "SIMULATED_BACKFILL"}
			// At most 32 observations per historical candle keeps initialization
			// bounded even for daily bars. OHLC is exact over these sampled prices.
			steps := min(int64(32), max(int64(1), sampleEnd-open.Unix()))
			for step := int64(0); step <= steps; step++ {
				timestamp := open.Unix() + (sampleEnd-open.Unix())*step/steps
				value := path.at(timestamp)
				if value.GreaterThan(candle.High) {
					candle.High = value
				}
				if value.LessThan(candle.Low) {
					candle.Low = value
				}
				candle.Close = value
				candle.TickVolume++
			}
			if offset == 0 {
				candle.Close = anchor.Bid
				candle.Sequence = anchor.Sequence
				series.Current[interval.Name] = candle
			}
			result = append(result, candle)
		}
	}
	return series, result, nil
}
