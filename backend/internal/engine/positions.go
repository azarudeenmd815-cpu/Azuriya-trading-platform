package engine

import (
	"azuriya/backend/internal/accounts"
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/instruments"
	"azuriya/backend/internal/marketdata"
	"azuriya/backend/internal/positions"
	"context"
	"github.com/shopspring/decimal"
	"strings"
	"time"
)

func (e *Engine) Close(ctx context.Context, id domain.Identity, accountID, positionID string, r domain.CloseRequest) (domain.Position, error) {
	if err := validateCloseNumbers(r); err != nil {
		return domain.Position{}, err
	}
	r.Quantity = domain.CopyDecimal(r.Quantity)
	r.Percentage = domain.CopyDecimal(r.Percentage)
	if err := e.waitAccountLatency(ctx, id, accountID); err != nil {
		return domain.Position{}, err
	}
	var result domain.Position
	var rejection error
	err := e.change(ctx, func(s *domain.State) error {
		a, err := account(s, id, accountID)
		if err != nil {
			return err
		}
		if len(r.ClientOrderID) < 1 || len(r.ClientOrderID) > 128 || strings.TrimSpace(r.ClientOrderID) != r.ClientOrderID {
			return domain.Err("INVALID_IDEMPOTENCY_KEY", "A client order ID of 1–128 characters is required")
		}
		key := idemKey(accountID, r.ClientOrderID)
		fp := fingerprint("close", positionID, r)
		if found, err := replay(s, key, fp, &result); found {
			rejection = err
			return nil
		}
		p, ok := s.Positions[positionID]
		if !ok || p.AccountID != accountID || p.TenantID != a.TenantID {
			return domain.Err("POSITION_NOT_FOUND", "Position not found")
		}
		if p.Status != "OPEN" {
			return domain.Err("POSITION_CLOSED", "Position is already closed")
		}
		if err := accounts.CanTrade(a, true); err != nil {
			return err
		}
		now := time.Now().UTC()
		if err := e.accrueRollover(s, a.TenantID, now); err != nil {
			return err
		}
		p = s.Positions[positionID]
		a = s.Accounts[a.ID]
		i, reference, err := market(s, a, p.Symbol, now)
		if err != nil {
			return err
		}
		if i.TradingStatus == "DISABLED" || i.TradingStatus == "CLOSED" {
			return domain.Err("INSTRUMENT_NOT_TRADABLE", "Instrument is disabled")
		}
		q, configuration, err := e.quoteFor(s, a, i, reference, now)
		if err != nil {
			return err
		}
		if err := canOperate(s, a, i, configuration, true, false); err != nil {
			return err
		}
		preview, err := e.closePreview(s, a, i, p, q, r, now)
		if err != nil {
			return err
		}
		quantity := preview.Quantity
		if r.Percentage != nil || quantity.LessThan(p.Quantity) {
			audit.Append(s, a.TenantID, a.ID, "position", p.ID, "POSITION_PARTIAL_CLOSE_REQUESTED", map[string]any{"client_order_id": r.ClientOrderID, "request": r, "preview": preview}, now)
		}
		result, err = e.closePosition(s, p, quantity, reference, q, "MANUAL_CLOSE", r.ClientOrderID, now)
		if err != nil {
			return err
		}
		accountEvent(s, a.ID, now)
		remember(s, key, fp, p.ID, result, nil)
		return nil
	})
	if err != nil {
		return domain.Position{}, err
	}
	return result.Clone(), rejection
}

func (e *Engine) closePosition(s *domain.State, p domain.Position, quantity decimal.Decimal, reference, q domain.Quote, reason, clientOrderID string, now time.Time) (domain.Position, error) {
	a := s.Accounts[p.AccountID]
	i := s.Instruments[domain.MarketKey(p.TenantID, p.Symbol)]
	if p.Status != "OPEN" || !quantity.IsPositive() || quantity.GreaterThan(p.Quantity) {
		return domain.Position{}, domain.Err("INVALID_QUANTITY", "Close quantity does not match open exposure")
	}
	if err := instruments.Quantity(i, quantity); err != nil {
		return domain.Position{}, err
	}
	if err := marketdata.Fresh(reference, now); err != nil {
		return domain.Position{}, err
	}
	configuration, err := broker.Resolve(s, a, i, now)
	if err != nil {
		return domain.Position{}, err
	}
	if err := canOperate(s, a, i, configuration, true, true); err != nil {
		return domain.Position{}, err
	}
	i = economicInstrument(i, p)
	if p.Economics != nil {
		configuration.Commission = p.Economics.Commission
		configuration.CommissionPlanID = p.Economics.CommissionPlanID
		configuration.ProfileRevisions["commission_plan_id"] = p.Economics.CommissionPlanRevision
	}
	price := execution.Price(execution.Opposite(p.Side), q)
	realized, err := conversion(s, a, now).Convert(positions.Profit(p.Side, p.OpenPrice, price, quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
	if err != nil {
		return domain.Position{}, err
	}
	o := domain.Order{ID: domain.NewID(), ClientOrderID: clientOrderID, TenantID: p.TenantID, AccountID: p.AccountID, Symbol: p.Symbol, Side: execution.Opposite(p.Side), Type: "MARKET", Status: "CREATED", TimeInForce: "IOC", Quantity: quantity, RemainingQuantity: quantity, PositionID: p.ID, RequestedPrice: &price, CreatedAt: now, UpdatedAt: now}
	audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_RECEIVED", o, now)
	o.Status = "VALIDATED"
	audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_VALIDATED", o, now)
	o.Status = "ACCEPTED"
	audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_ACCEPTED", o, now)
	p.Quantity = p.Quantity.Sub(quantity)
	p.RealizedPnL = p.RealizedPnL.Add(realized)
	p.CurrentPrice = price
	if p.Quantity.IsZero() {
		p.Status = "CLOSED"
		p.ClosedAt = &now
		p.UnrealizedPnL = decimal.Zero
		p.MarginUsed = decimal.Zero
	}
	s.Positions[p.ID] = p
	a.Balance = a.Balance.Add(realized)
	a.UpdatedAt = now
	s.Accounts[a.ID] = a
	s.Transactions = append(s.Transactions, domain.Transaction{ID: domain.NewID(), TenantID: a.TenantID, AccountID: a.ID, PositionID: p.ID, Type: "REALIZED_PNL", Amount: realized, Currency: a.Currency, BalanceAfter: a.Balance, CreatedAt: now})
	o.Status = "FILLED"
	o.RemainingQuantity = decimal.Zero
	s.Orders[o.ID] = o
	fee := broker.Commission(configuration.Commission, quantity, true)
	fill := e.fillWithPolicy(o, p.ID, quantity, price, reference, q, configuration, fee, now)
	fill.ExecutionReason = "SIMULATED_" + reason
	s.Fills[fill.ID] = fill
	chargeCommission(s, &p, fill, fee, now)
	audit.Append(s, a.TenantID, a.ID, "fill", fill.ID, "FILL_CREATED", fill, now)
	audit.Append(s, a.TenantID, a.ID, "order", o.ID, "ORDER_FILLED", o, now)
	if err := e.revalue(s, a.TenantID, now); err != nil {
		return domain.Position{}, err
	}
	p = s.Positions[p.ID]
	eventType := "POSITION_UPDATED"
	if p.Status == "CLOSED" {
		eventType = "POSITION_CLOSED"
	}
	audit.Append(s, a.TenantID, a.ID, "position", p.ID, eventType, p, now)
	return p, nil
}

func (e *Engine) SetProtection(ctx context.Context, id domain.Identity, accountID, positionID string, r domain.ProtectionRequest) (domain.Position, error) {
	r.StopLoss = domain.CopyDecimal(r.StopLoss)
	r.TakeProfit = domain.CopyDecimal(r.TakeProfit)
	var result domain.Position
	var rejected error
	err := e.change(ctx, func(s *domain.State) error {
		a, err := account(s, id, accountID)
		if err != nil {
			return err
		}
		p, ok := s.Positions[positionID]
		if !ok || p.AccountID != accountID || p.TenantID != a.TenantID {
			return domain.Err("POSITION_NOT_FOUND", "Position not found")
		}
		now := time.Now().UTC()
		for _, price := range []*decimal.Decimal{r.StopLoss, r.TakeProfit} {
			if price != nil && !domain.ValidInputDecimal(*price) {
				return domain.Err("INVALID_PRICE", "Protection precision or magnitude is unsupported")
			}
		}
		audit.Append(s, a.TenantID, a.ID, "position", p.ID, "POSITION_PROTECTION_MODIFICATION_REQUESTED", map[string]any{"position_id": p.ID, "request": r}, now)
		if _, _, err := e.validateProtection(s, a, p, r, now); err != nil {
			rejected = err
			result = p
			audit.Append(s, a.TenantID, a.ID, "position", p.ID, "POSITION_PROTECTION_MODIFICATION_REJECTED", map[string]any{"position_id": p.ID, "message": err.Error()}, now)
			return nil
		}
		p.StopLoss = r.StopLoss
		p.TakeProfit = r.TakeProfit
		s.Positions[p.ID] = p
		result = p
		audit.Append(s, a.TenantID, a.ID, "position", p.ID, "POSITION_PROTECTION_UPDATED", p, now)
		return nil
	})
	if err != nil {
		return domain.Position{}, err
	}
	return result.Clone(), rejected
}
