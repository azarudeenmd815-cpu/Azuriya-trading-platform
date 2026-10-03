package engine

import (
	"azuriya/backend/internal/accounts"
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/orders"
	"context"
	"github.com/shopspring/decimal"
	"strings"
	"time"
)

func commandKey(key string) error {
	if len(key) < 1 || len(key) > 128 || strings.TrimSpace(key) != key {
		return domain.Err("INVALID_IDEMPOTENCY_KEY", "A client order ID of 1–128 characters is required")
	}
	return nil
}

// ModifyOrder changes only an unfilled pending order, preserving its identity and
// original client order ID. UpdatedAt resets queue priority. Changes and any
// immediate limit fill are one atomic transition.
func (e *Engine) ModifyOrder(ctx context.Context, id domain.Identity, accountID, orderID string, r domain.ModifyOrderRequest) (domain.Order, error) {
	if err := commandKey(r.ClientOrderID); err != nil {
		return domain.Order{}, err
	}
	for _, v := range []*decimal.Decimal{r.Quantity, r.EntryPrice, r.StopLoss, r.TakeProfit} {
		if v != nil && !domain.ValidInputDecimal(*v) {
			return domain.Order{}, domain.Err("INVALID_DECIMAL", "Modification precision or magnitude is unsupported")
		}
	}
	r.Quantity = domain.CopyDecimal(r.Quantity)
	r.EntryPrice = domain.CopyDecimal(r.EntryPrice)
	r.StopLoss = domain.CopyDecimal(r.StopLoss)
	r.TakeProfit = domain.CopyDecimal(r.TakeProfit)
	if err := e.waitAccountLatency(ctx, id, accountID); err != nil {
		return domain.Order{}, err
	}
	var result domain.Order
	var rejected error
	err := e.change(ctx, func(s *domain.State) error {
		a, err := account(s, id, accountID)
		if err != nil {
			return err
		}
		key := idemKey(accountID, r.ClientOrderID)
		fp := fingerprint("modify-order", orderID, r)
		if found, err := replay(s, key, fp, &result); found {
			rejected = err
			return nil
		}
		o, ok := s.Orders[orderID]
		if !ok || o.AccountID != a.ID || o.TenantID != a.TenantID {
			return domain.Err("ORDER_NOT_FOUND", "Order not found")
		}
		now := time.Now().UTC()
		audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_MODIFICATION_REQUESTED", map[string]any{"order": o, "request": r}, now)
		rejectChange := func(err error) error {
			rejected = err
			result = o
			payload := map[string]any{"order_id": o.ID, "client_order_id": r.ClientOrderID, "message": err.Error()}
			if failure, ok := err.(*domain.Error); ok {
				payload["code"] = failure.Code
			}
			audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_MODIFICATION_REJECTED", payload, now)
			remember(s, key, fp, o.ID, o, err)
			return nil
		}
		if o.Status != "ACCEPTED" || (o.Type != "LIMIT" && o.Type != "STOP") || !o.RemainingQuantity.Equal(o.Quantity) {
			return rejectChange(domain.Err("ORDER_NOT_MODIFIABLE", "Only unfilled pending orders may be modified"))
		}
		if err = accounts.CanTrade(a, false); err != nil {
			return rejectChange(err)
		}
		i, reference, err := market(s, a, o.Symbol, now)
		if err != nil {
			return rejectChange(err)
		}
		q, configuration, err := e.quoteFor(s, a, i, reference, now)
		if err != nil {
			return rejectChange(err)
		}
		if err := canOperate(s, a, i, configuration, false, false); err != nil {
			return rejectChange(err)
		}
		if err = e.revalue(s, a.TenantID, now); err != nil {
			return rejectChange(err)
		}
		a = s.Accounts[a.ID]
		candidate := o.Clone()
		if r.Quantity != nil {
			candidate.Quantity = *r.Quantity
			candidate.RemainingQuantity = *r.Quantity
		}
		if r.EntryPrice != nil {
			if o.Type == "LIMIT" {
				candidate.LimitPrice = r.EntryPrice
			} else {
				candidate.StopPrice = r.EntryPrice
			}
		}
		candidate.StopLoss = r.StopLoss
		candidate.TakeProfit = r.TakeProfit
		request := domain.OrderRequest{ClientOrderID: candidate.ClientOrderID, Symbol: candidate.Symbol, Side: candidate.Side, Type: candidate.Type, Quantity: candidate.Quantity, TimeInForce: candidate.TimeInForce, LimitPrice: candidate.LimitPrice, StopPrice: candidate.StopPrice, StopLoss: candidate.StopLoss, TakeProfit: candidate.TakeProfit}
		if err = orders.Validate(request, i, q); err != nil {
			return rejectChange(err)
		}
		if err = e.pretrade(s, a, i, candidate, q, now); err != nil {
			return rejectChange(err)
		}
		candidate.UpdatedAt = now
		price := execution.Price(candidate.Side, q)
		candidate.RequestedPrice = &price
		s.Orders[orderID] = candidate
		audit.Append(s, a.TenantID, a.ID, "order", candidate.ID, "ORDER_MODIFIED", candidate, now)
		if execution.Trigger(candidate, q) {
			candidate.Status = "TRIGGERED"
			audit.Append(s, a.TenantID, a.ID, "order", candidate.ID, "ORDER_TRIGGERED", candidate, now)
			if err = e.open(s, &candidate, i, reference, q, now); err != nil {
				return err
			}
			accountEvent(s, a.ID, now)
		}
		s.Orders[orderID] = candidate
		result = candidate
		remember(s, key, fp, candidate.ID, result, nil)
		return nil
	})
	if err != nil {
		return domain.Order{}, err
	}
	return result.Clone(), rejected
}
