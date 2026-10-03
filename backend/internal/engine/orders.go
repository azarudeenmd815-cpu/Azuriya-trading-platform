package engine

import (
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/orders"
	"azuriya/backend/internal/positions"
	"azuriya/backend/internal/risk"
	"context"
	"github.com/shopspring/decimal"
	"time"
)

func (e *Engine) Submit(ctx context.Context, id domain.Identity, accountID string, r domain.OrderRequest) (domain.Order, error) {
	return e.submit(ctx, id, accountID, r, nil)
}

func (e *Engine) SubmitTrade(ctx context.Context, id domain.Identity, accountID string, input domain.TradeRequest) (domain.Order, error) {
	if err := validateTradeNumbers(input); err != nil {
		return domain.Order{}, err
	}
	input = cloneTrade(input)
	return e.submit(ctx, id, accountID, input.OrderRequest, &input)
}

func (e *Engine) submit(ctx context.Context, id domain.Identity, accountID string, r domain.OrderRequest, intent *domain.TradeRequest) (domain.Order, error) {
	if !domain.ValidInputDecimal(r.Quantity) {
		return domain.Order{}, domain.Err("INVALID_QUANTITY", "Quantity precision or magnitude is unsupported")
	}
	for _, value := range []*decimal.Decimal{r.LimitPrice, r.StopPrice, r.StopLoss, r.TakeProfit} {
		if value != nil && !domain.ValidInputDecimal(*value) {
			return domain.Order{}, domain.Err("INVALID_PRICE", "Price precision or magnitude is unsupported")
		}
	}
	r.LimitPrice = domain.CopyDecimal(r.LimitPrice)
	r.StopPrice = domain.CopyDecimal(r.StopPrice)
	r.StopLoss = domain.CopyDecimal(r.StopLoss)
	r.TakeProfit = domain.CopyDecimal(r.TakeProfit)
	if err := e.waitAccountLatency(ctx, id, accountID); err != nil {
		return domain.Order{}, err
	}
	var result domain.Order
	var rejection error
	err := e.change(ctx, func(s *domain.State) error {
		a, err := account(s, id, accountID)
		if err != nil {
			return err
		}
		key := idemKey(accountID, r.ClientOrderID)
		fp := fingerprint("submit", accountID, r)
		if intent != nil && advancedTrade(*intent) {
			fp = fingerprint("submit", accountID, *intent)
		}
		if r.ClientOrderID != "" {
			if found, err := replay(s, key, fp, &result); found {
				rejection = err
				return nil
			}
		}
		now := time.Now().UTC()
		tif := r.TimeInForce
		if tif == "" {
			if r.Type == "MARKET" {
				tif = "IOC"
			} else {
				tif = "GTC"
			}
		}
		o := domain.Order{ID: domain.NewID(), ClientOrderID: r.ClientOrderID, TenantID: a.TenantID, AccountID: a.ID, Symbol: r.Symbol, Side: r.Side, Type: r.Type, Status: "CREATED", TimeInForce: tif, Quantity: r.Quantity, RemainingQuantity: r.Quantity, LimitPrice: r.LimitPrice, StopPrice: r.StopPrice, StopLoss: r.StopLoss, TakeProfit: r.TakeProfit, CreatedAt: now, UpdatedAt: now}
		audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_RECEIVED", o, now)
		i, reference, validationErr := market(s, a, r.Symbol, now)
		var q domain.Quote
		var configuration domain.EffectiveConfiguration
		if validationErr == nil {
			q, configuration, validationErr = e.quoteFor(s, a, i, reference, now)
		}
		if validationErr == nil {
			validationErr = canOperate(s, a, i, configuration, false, false)
		}
		if validationErr == nil {
			validationErr = e.accrueRollover(s, a.TenantID, now)
		}
		if validationErr == nil {
			validationErr = e.revalue(s, a.TenantID, now)
			a = s.Accounts[a.ID]
		}
		if validationErr == nil && intent != nil {
			var preview domain.OrderPreview
			r, preview, validationErr = e.resolveTrade(s, a, i, q, *intent, now)
			if validationErr == nil {
				o.Quantity = r.Quantity
				o.RemainingQuantity = r.Quantity
				o.StopLoss = r.StopLoss
				o.TakeProfit = r.TakeProfit
				if advancedTrade(*intent) {
					audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_SIZING_RESOLVED", map[string]any{"order": o, "request": intent, "preview": preview}, now)
				}
			}
		}
		if validationErr == nil {
			validationErr = orders.Validate(r, i, q)
		}
		if validationErr == nil {
			validationErr = e.pretrade(s, a, i, o, q, now)
		}
		if validationErr != nil {
			reject(s, &o, validationErr, now)
			rejection = validationErr
		} else {
			requested := execution.Price(o.Side, q)
			o.RequestedPrice = &requested
			o.Status = "VALIDATED"
			audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_VALIDATED", o, now)
			o.Status = "ACCEPTED"
			audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_ACCEPTED", o, now)
			if execution.Trigger(o, q) {
				if o.Type != "MARKET" {
					o.Status = "TRIGGERED"
					audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_TRIGGERED", o, now)
				}
				if err := e.open(s, &o, i, reference, q, now); err != nil {
					return err
				}
				if err := e.applyRisk(s, a.TenantID, now); err != nil {
					return err
				}
				accountEvent(s, a.ID, now)
			}
			s.Orders[o.ID] = o
		}
		result = o
		if len(r.ClientOrderID) > 0 && len(r.ClientOrderID) <= 128 {
			remember(s, key, fp, o.ID, o, rejection)
		}
		return nil
	})
	if err != nil {
		return domain.Order{}, err
	}
	return result.Clone(), rejection
}

func reject(s *domain.State, o *domain.Order, err error, now time.Time) {
	o.Status = "REJECTED"
	o.RejectCode = "ORDER_REJECTED"
	o.RejectReason = err.Error()
	if failure, ok := err.(*domain.Error); ok {
		o.RejectCode = failure.Code
	}
	o.UpdatedAt = now
	s.Orders[o.ID] = *o
	audit.Append(s, o.TenantID, o.AccountID, "order", o.ID, "ORDER_REJECTED", *o, now)
}

func (e *Engine) pretrade(s *domain.State, a domain.Account, i domain.Instrument, o domain.Order, q domain.Quote, now time.Time) error {
	configuration, err := broker.Resolve(s, a, i, now)
	if err != nil {
		return err
	}
	if err := canOperate(s, a, i, configuration, false, false); err != nil {
		return err
	}
	price := execution.Price(o.Side, q)
	if o.Type == "LIMIT" && !execution.Trigger(o, q) && o.LimitPrice != nil {
		price = *o.LimitPrice
	}
	if o.Type == "STOP" && !execution.Trigger(o, q) && o.StopPrice != nil {
		price = *o.StopPrice
	}
	converter := conversion(s, a, now)
	required, err := requiredMargin(s, a, i, configuration, o.Quantity, price, now)
	if err != nil {
		return err
	}
	// Include the spread cost of the proposed fill in the free-margin check.
	openingPnL, err := converter.Convert(positions.Profit(o.Side, execution.Price(o.Side, q), execution.Price(execution.Opposite(o.Side), q), o.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
	if err != nil {
		return err
	}
	return risk.Check(a, required, openingPnL.Sub(broker.Commission(configuration.Commission, o.Quantity, false)))
}

func (e *Engine) open(s *domain.State, o *domain.Order, i domain.Instrument, reference, q domain.Quote, now time.Time) error {
	a := s.Accounts[o.AccountID]
	configuration, err := broker.Resolve(s, a, i, now)
	if err != nil {
		return err
	}
	price := execution.Price(o.Side, q)
	p := domain.Position{ID: domain.NewID(), TenantID: o.TenantID, AccountID: o.AccountID, Symbol: o.Symbol, Side: o.Side, Status: "OPEN", Quantity: o.Quantity, InitialQuantity: o.Quantity, OpenPrice: price, CurrentPrice: execution.Price(execution.Opposite(o.Side), q), StopLoss: o.StopLoss, TakeProfit: o.TakeProfit, OpenedAt: now}
	p.Economics = &domain.PositionEconomics{ContractSize: i.ContractSize, QuoteCurrency: i.QuoteCurrency, CommissionPlanID: configuration.CommissionPlanID, CommissionPlanRevision: configuration.ProfileRevisions["commission_plan_id"], Commission: configuration.Commission}
	s.Positions[p.ID] = p
	o.PositionID = p.ID
	o.Status = "FILLED"
	o.RemainingQuantity = decimal.Zero
	o.UpdatedAt = now
	s.Orders[o.ID] = *o
	fee := broker.Commission(configuration.Commission, o.Quantity, false)
	fill := e.fillWithPolicy(*o, p.ID, o.Quantity, price, reference, q, configuration, fee, now)
	fill.ExecutionReason = "SIMULATED_" + o.Type
	s.Fills[fill.ID] = fill
	chargeCommission(s, &p, fill, fee, now)
	audit.Append(s, o.TenantID, a.ID, "fill", fill.ID, "FILL_CREATED", fill, now)
	audit.Append(s, o.TenantID, a.ID, "order", o.ID, "ORDER_FILLED", *o, now)
	if err := e.revalue(s, a.TenantID, now); err != nil {
		return err
	}
	p = s.Positions[p.ID]
	audit.Append(s, o.TenantID, a.ID, "position", p.ID, "POSITION_OPENED", p, now)
	// Gaps can cross protection attached to pending entries; close immediately at
	// the same quote after opening instead of leaving an already-breached stop.
	if reason := execution.ProtectionTrigger(p, q); reason != "" {
		if _, err := e.closePosition(s, p, p.Quantity, reference, q, reason, "system:"+domain.NewID(), now); err != nil {
			return err
		}
	}
	return nil
}
func (e *Engine) fill(o domain.Order, positionID string, quantity, price decimal.Decimal, reference, q domain.Quote, reason string, now time.Time) domain.Fill {
	return domain.Fill{ID: domain.NewID(), TenantID: o.TenantID, OrderID: o.ID, AccountID: o.AccountID, PositionID: positionID, Symbol: o.Symbol, Side: o.Side, Quantity: quantity, Price: price, ReferenceBid: reference.Bid, ReferenceAsk: reference.Ask, ClientBid: q.Bid, ClientAsk: q.Ask, ExecutionReason: reason, ExecutionMode: "SIMULATED", ExecutionLatencyMS: e.profile.BaseLatencyMS, ExecutionProfileID: e.profile.ID, LatencyMode: e.profile.LatencyMode, SlippageMode: e.profile.SlippageMode, PricingProfileID: e.pricing.ID, QuoteSequence: reference.Sequence, CreatedAt: now}
}

func (e *Engine) Cancel(ctx context.Context, id domain.Identity, accountID, orderID string) (domain.Order, error) {
	var result domain.Order
	err := e.change(ctx, func(s *domain.State) error {
		a, err := account(s, id, accountID)
		if err != nil {
			return err
		}
		o, ok := s.Orders[orderID]
		if !ok || o.AccountID != a.ID || o.TenantID != a.TenantID {
			return domain.Err("ORDER_NOT_FOUND", "Order not found")
		}
		if o.Status == "CANCELLED" {
			result = o
			return nil
		}
		if o.Status != "ACCEPTED" {
			return domain.Err("ORDER_NOT_CANCELLABLE", "Only pending accepted orders can be cancelled")
		}
		o.Status = "CANCELLED"
		o.UpdatedAt = time.Now().UTC()
		s.Orders[o.ID] = o
		result = o
		audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_CANCELLED", o, o.UpdatedAt)
		return nil
	})
	return result.Clone(), err
}
