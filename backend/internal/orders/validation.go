package orders

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/instruments"
	"github.com/shopspring/decimal"
	"strings"
)

func Validate(r domain.OrderRequest, i domain.Instrument, q domain.Quote) error {
	if len(r.ClientOrderID) < 1 || len(r.ClientOrderID) > 128 || strings.TrimSpace(r.ClientOrderID) != r.ClientOrderID {
		return domain.Err("INVALID_IDEMPOTENCY_KEY", "A client order ID of 1–128 characters is required")
	}
	if r.Side != "BUY" && r.Side != "SELL" {
		return domain.Err("INVALID_SIDE", "Side must be BUY or SELL")
	}
	if r.Type != "MARKET" && r.Type != "LIMIT" && r.Type != "STOP" {
		return domain.Err("INVALID_ORDER_TYPE", "Order type must be MARKET, LIMIT, or STOP")
	}
	if i.TradingStatus != "OPEN" {
		return domain.Err("INSTRUMENT_NOT_TRADABLE", "Instrument does not permit opening orders")
	}
	if err := instruments.Quantity(i, r.Quantity); err != nil {
		return err
	}
	for _, p := range []*decimal.Decimal{r.LimitPrice, r.StopPrice, r.StopLoss, r.TakeProfit} {
		if err := instruments.Price(i, p); err != nil {
			return err
		}
	}
	if r.Type == "MARKET" && (r.LimitPrice != nil || r.StopPrice != nil) {
		return domain.Err("INVALID_PRICE", "Market orders cannot specify a limit or stop entry price")
	}
	if r.Type == "LIMIT" && (r.LimitPrice == nil || r.StopPrice != nil) {
		return domain.Err("INVALID_PRICE", "Limit orders require only limit_price")
	}
	if r.Type == "STOP" && (r.StopPrice == nil || r.LimitPrice != nil) {
		return domain.Err("INVALID_PRICE", "Stop orders require only stop_price")
	}
	if r.TimeInForce != "" && r.TimeInForce != "IOC" && r.TimeInForce != "GTC" {
		return domain.Err("INVALID_TIME_IN_FORCE", "Time in force must be IOC or GTC")
	}
	if r.Type != "MARKET" && r.TimeInForce == "IOC" {
		return domain.Err("INVALID_TIME_IN_FORCE", "Pending orders require GTC")
	}
	entry := q.Ask
	closePrice := q.Bid
	if r.Side == "SELL" {
		entry = q.Bid
		closePrice = q.Ask
	}
	pending := false
	if r.Type == "LIMIT" {
		pending = (r.Side == "BUY" && r.LimitPrice.LessThan(q.Ask)) || (r.Side == "SELL" && r.LimitPrice.GreaterThan(q.Bid))
		if pending {
			entry = *r.LimitPrice
		}
	}
	if r.Type == "STOP" {
		entry = *r.StopPrice
		pending = true
	}
	if r.Type == "STOP" && ((r.Side == "BUY" && entry.LessThanOrEqual(q.Ask)) || (r.Side == "SELL" && entry.GreaterThanOrEqual(q.Bid))) {
		return domain.Err("INVALID_STOP_PRICE", "Stop entry must be beyond the current executable price")
	}
	if err := Protection(r.Side, entry, r.StopLoss, r.TakeProfit); err != nil {
		return err
	}
	// An immediate entry may not place its stop inside the spread, where the
	// executable close-side quote would already have breached it.
	if !pending {
		return Protection(r.Side, closePrice, r.StopLoss, nil)
	}
	return nil
}
func Protection(side string, reference decimal.Decimal, sl, tp *decimal.Decimal) error {
	if sl != nil && ((side == "BUY" && sl.GreaterThanOrEqual(reference)) || (side == "SELL" && sl.LessThanOrEqual(reference))) {
		return domain.Err("INVALID_STOP_LOSS", "Stop loss must be on the loss side of the reference price")
	}
	if tp != nil && ((side == "BUY" && tp.LessThanOrEqual(reference)) || (side == "SELL" && tp.GreaterThanOrEqual(reference))) {
		return domain.Err("INVALID_TAKE_PROFIT", "Take profit must be on the profit side of the reference price")
	}
	return nil
}
