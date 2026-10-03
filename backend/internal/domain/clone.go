package domain

import "github.com/shopspring/decimal"

func CopyDecimal(value *decimal.Decimal) *decimal.Decimal {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
func (o Order) Clone() Order {
	o.RequestedPrice = CopyDecimal(o.RequestedPrice)
	o.LimitPrice = CopyDecimal(o.LimitPrice)
	o.StopPrice = CopyDecimal(o.StopPrice)
	o.StopLoss = CopyDecimal(o.StopLoss)
	o.TakeProfit = CopyDecimal(o.TakeProfit)
	return o
}
func (p Position) Clone() Position {
	if p.Economics != nil {
		v := *p.Economics
		p.Economics = &v
	}
	p.StopLoss = CopyDecimal(p.StopLoss)
	p.TakeProfit = CopyDecimal(p.TakeProfit)
	if p.ClosedAt != nil {
		closed := *p.ClosedAt
		p.ClosedAt = &closed
	}
	return p
}

// Clone isolates transaction candidates and callers without JSON encoding the
// complete append-only history on every quote. Decimal values are immutable.
func (s State) Clone() State {
	c := EmptyState()
	c.Sequence = s.Sequence
	c.Broker = s.Broker.Clone()
	for k, v := range s.Accounts {
		v.MaxLeverageOverride = CopyDecimal(v.MaxLeverageOverride)
		c.Accounts[k] = v
	}
	for k, v := range s.Instruments {
		c.Instruments[k] = v
	}
	for k, v := range s.Quotes {
		c.Quotes[k] = v
	}
	for k, v := range s.Orders {
		c.Orders[k] = v.Clone()
	}
	for k, v := range s.Fills {
		c.Fills[k] = v
	}
	for k, v := range s.Positions {
		c.Positions[k] = v.Clone()
	}
	c.Transactions = append(c.Transactions, s.Transactions...)
	for _, v := range s.Events {
		v.Payload = append([]byte(nil), v.Payload...)
		c.Events = append(c.Events, v)
	}
	for k, v := range s.Idempotency {
		v.Result = append([]byte(nil), v.Result...)
		c.Idempotency[k] = v
	}
	return c
}
