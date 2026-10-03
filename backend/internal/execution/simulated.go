package execution

import (
	"azuriya/backend/internal/domain"
	"github.com/shopspring/decimal"
)

type Profile struct {
	ID            string `json:"id"`
	LatencyMode   string `json:"latency_mode"`
	BaseLatencyMS int64  `json:"base_latency_ms"`
	SlippageMode  string `json:"slippage_mode"`
}

func Default() Profile {
	return Profile{ID: "simulated-deterministic-v1", LatencyMode: "NONE", SlippageMode: "NONE"}
}
func Price(side string, q domain.Quote) decimal.Decimal {
	if side == "BUY" {
		return q.Ask
	}
	return q.Bid
}
func Trigger(o domain.Order, q domain.Quote) bool {
	p := Price(o.Side, q)
	switch o.Type {
	case "MARKET":
		return true
	case "LIMIT":
		return o.LimitPrice != nil && ((o.Side == "BUY" && p.LessThanOrEqual(*o.LimitPrice)) || (o.Side == "SELL" && p.GreaterThanOrEqual(*o.LimitPrice)))
	case "STOP":
		return o.StopPrice != nil && ((o.Side == "BUY" && p.GreaterThanOrEqual(*o.StopPrice)) || (o.Side == "SELL" && p.LessThanOrEqual(*o.StopPrice)))
	}
	return false
}
func Opposite(side string) string {
	if side == "BUY" {
		return "SELL"
	}
	return "BUY"
}
func ProtectionTrigger(p domain.Position, q domain.Quote) string {
	price := Price(Opposite(p.Side), q)
	if p.StopLoss != nil && ((p.Side == "BUY" && price.LessThanOrEqual(*p.StopLoss)) || (p.Side == "SELL" && price.GreaterThanOrEqual(*p.StopLoss))) {
		return "STOP_LOSS"
	}
	if p.TakeProfit != nil && ((p.Side == "BUY" && price.GreaterThanOrEqual(*p.TakeProfit)) || (p.Side == "SELL" && price.LessThanOrEqual(*p.TakeProfit))) {
		return "TAKE_PROFIT"
	}
	return ""
}
