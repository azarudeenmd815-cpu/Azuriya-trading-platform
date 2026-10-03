package engine

import (
	"azuriya/backend/internal/accounts"
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/instruments"
	"azuriya/backend/internal/margin"
	"context"
	"github.com/shopspring/decimal"
	"time"
)

func (e *Engine) ClientActive(id domain.Identity) error {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return broker.ClientStatus(&e.state, id)
}
func (e *Engine) EffectiveConfiguration(ctx context.Context, id domain.Identity, accountID, symbol string) (domain.EffectiveConfiguration, error) {
	if err := ctx.Err(); err != nil {
		return domain.EffectiveConfiguration{}, err
	}
	s := e.Snapshot()
	a, err := account(&s, id, accountID)
	if err != nil {
		return domain.EffectiveConfiguration{}, err
	}
	i, ok := s.Instruments[domain.MarketKey(a.TenantID, symbol)]
	if !ok {
		return domain.EffectiveConfiguration{}, domain.Err("INSTRUMENT_NOT_FOUND", "Instrument not found")
	}
	return broker.Resolve(&s, a, i, time.Now().UTC())
}
func (e *Engine) AccountQuotes(ctx context.Context, id domain.Identity, accountID string) ([]domain.Quote, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s := e.Snapshot()
	a, err := account(&s, id, accountID)
	if err != nil {
		return nil, err
	}
	quotes := []domain.Quote{}
	now := time.Now().UTC()
	for _, key := range sortedKeys(s.Instruments) {
		i := s.Instruments[key]
		if i.TenantID != a.TenantID {
			continue
		}
		ref, ok := s.Quotes[key]
		if !ok {
			continue
		}
		q, _, err := e.quoteFor(&s, a, i, ref, now)
		if err != nil {
			return nil, err
		}
		quotes = append(quotes, q)
	}
	return quotes, nil
}
func (e *Engine) quoteFor(s *domain.State, a domain.Account, i domain.Instrument, reference domain.Quote, now time.Time) (domain.Quote, domain.EffectiveConfiguration, error) {
	c, err := broker.Resolve(s, a, i, now)
	if err != nil {
		return domain.Quote{}, c, err
	}
	q, err := broker.Price(reference, i, c)
	return q, c, err
}
func canOperate(s *domain.State, a domain.Account, i domain.Instrument, c domain.EffectiveConfiguration, closing, system bool) error {
	if !system {
		if err := broker.ClientStatus(s, domain.Identity{TenantID: a.TenantID, UserID: a.UserID}); err != nil {
			return err
		}
		if err := accounts.CanTrade(a, closing); err != nil {
			return err
		}
	} else {
		copy := a
		copy.Status = "ACTIVE"
		if err := accounts.CanTrade(copy, true); err != nil {
			return err
		}
	}
	if closing {
		if i.TradingStatus == "DISABLED" || i.TradingStatus == "CLOSED" {
			return domain.Err("INSTRUMENT_NOT_TRADABLE", "Instrument does not permit execution")
		}
	} else {
		if !s.Broker.Settings[a.TenantID].TradingEnabled {
			return domain.Err("TRADING_DISABLED", "Tenant trading is disabled")
		}
		if i.TradingStatus != "OPEN" {
			return domain.Err("INSTRUMENT_NOT_TRADABLE", "Instrument does not permit opening orders")
		}
	}
	return broker.SessionAllows(c.SessionStatus, closing)
}
func (e *Engine) waitAccountLatency(ctx context.Context, id domain.Identity, accountID string) error {
	s := e.Snapshot()
	a, err := account(&s, id, accountID)
	if err != nil {
		return err
	}
	c, err := broker.ResolveAccount(&s, a, time.Now().UTC())
	if err != nil {
		return err
	}
	duration := time.Duration(c.Execution.BaseLatencyMS) * time.Millisecond
	if c.ExecutionProfileID == broker.DefaultProfileID(a.TenantID, "EXECUTION") {
		e.mu.RLock()
		duration = time.Duration(e.profile.BaseLatencyMS) * time.Millisecond
		e.mu.RUnlock()
	}
	if duration == 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
func requiredMargin(s *domain.State, a domain.Account, i domain.Instrument, c domain.EffectiveConfiguration, quantity, price decimal.Decimal, now time.Time) (decimal.Decimal, error) {
	i.DefaultLeverage = c.EffectiveLeverage
	return margin.Required(i, quantity, price, c.EffectiveLeverage, a.Currency, conversion(s, a, now))
}
func economicInstrument(i domain.Instrument, p domain.Position) domain.Instrument {
	if p.Economics != nil {
		i.ContractSize = p.Economics.ContractSize
		i.QuoteCurrency = p.Economics.QuoteCurrency
	}
	return i
}
func (e *Engine) fillWithPolicy(o domain.Order, positionID string, quantity, price decimal.Decimal, reference, q domain.Quote, c domain.EffectiveConfiguration, commission decimal.Decimal, now time.Time) domain.Fill {
	f := e.fill(o, positionID, quantity, price, reference, q, "", now)
	f.PricingProfileID = c.PricingProfileID
	f.TradingGroupID = c.TradingGroupID
	f.ConfigurationRevision = c.ConfigurationRevision
	f.Commission = commission
	f.CommissionPlanID = c.CommissionPlanID
	f.CommissionPlanRevision = c.ProfileRevisions["commission_plan_id"]
	if c.ExecutionProfileID != broker.DefaultProfileID(o.TenantID, "EXECUTION") {
		f.ExecutionProfileID = c.ExecutionProfileID
		f.ExecutionLatencyMS = c.Execution.BaseLatencyMS
		f.LatencyMode = c.Execution.LatencyMode
		f.SlippageMode = c.Execution.SlippageMode
	}
	return f
}
func chargeCommission(s *domain.State, p *domain.Position, fill domain.Fill, amount decimal.Decimal, now time.Time) {
	if amount.IsZero() {
		return
	}
	a := s.Accounts[p.AccountID]
	a.Balance = a.Balance.Sub(amount)
	a.UpdatedAt = now
	s.Accounts[a.ID] = a
	p.CommissionPaid = p.CommissionPaid.Add(amount)
	s.Positions[p.ID] = *p
	tx := domain.Transaction{ID: domain.NewID(), TenantID: a.TenantID, AccountID: a.ID, PositionID: p.ID, FillID: fill.ID, ProfileID: fill.CommissionPlanID, Type: "COMMISSION", Amount: amount.Neg(), Currency: a.Currency, BalanceAfter: a.Balance, CreatedAt: now, Reference: fill.OrderID, Reason: "Simulated execution commission"}
	s.Transactions = append(s.Transactions, tx)
	audit.Append(s, a.TenantID, a.ID, "transaction", tx.ID, "COMMISSION_CHARGED", tx, now)
}
func (e *Engine) publishAccountQuotes(s *domain.State, tenantID string, now time.Time) error {
	for _, aid := range sortedKeys(s.Accounts) {
		a := s.Accounts[aid]
		if a.TenantID != tenantID {
			continue
		}
		for _, key := range sortedKeys(s.Instruments) {
			i := s.Instruments[key]
			if i.TenantID != tenantID {
				continue
			}
			ref, ok := s.Quotes[key]
			if !ok {
				continue
			}
			q, _, err := e.quoteFor(s, a, i, ref, now)
			if err != nil {
				return err
			}
			audit.Append(s, tenantID, aid, "quote", i.Symbol, "ACCOUNT_QUOTE_UPDATED", q, now)
		}
	}
	return nil
}
func (e *Engine) validateSystemExit(s *domain.State, a domain.Account, i domain.Instrument, p domain.Position, c domain.EffectiveConfiguration) error {
	if err := canOperate(s, a, i, c, true, true); err != nil {
		return err
	}
	return instruments.Quantity(i, p.Quantity)
}
