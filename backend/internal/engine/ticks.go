package engine

import (
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/marketdata"
	"context"
	"sort"
	"time"
)

func (e *Engine) Tick(ctx context.Context, tenantID string, quote domain.Quote) error {
	if err := e.waitLatency(ctx); err != nil {
		return err
	}
	return e.change(ctx, func(s *domain.State) error {
		key := domain.MarketKey(tenantID, quote.Symbol)
		i, ok := s.Instruments[key]
		if !ok {
			return domain.Err("INSTRUMENT_NOT_FOUND", "Instrument not found")
		}
		if quote.TenantID != "" && quote.TenantID != tenantID {
			return domain.Err("INVALID_QUOTE", "Quote tenant does not match instrument tenant")
		}
		previous, exists := s.Quotes[key]
		var previousPtr *domain.Quote
		if exists {
			previousPtr = &previous
		}
		now := time.Now().UTC()
		if err := marketdata.Validate(i, quote, previousPtr, now); err != nil {
			return err
		}
		quote.TenantID = tenantID
		quote.Simulated = true
		s.Quotes[key] = quote
		q, _, err := e.quoteFor(s, domain.Account{TenantID: tenantID, Leverage: domain.D("100"), Currency: "USD"}, i, quote, now)
		if err != nil {
			return err
		}
		audit.Append(s, tenantID, "", "quote", quote.Symbol, "QUOTE_UPDATED", q, now)
		if err := e.revalue(s, tenantID, now); err != nil {
			return err
		}
		if err := e.accrueRollover(s, tenantID, now); err != nil {
			return err
		}
		// Existing protective exits run before new entries, releasing margin first.
		for _, positionID := range sortedKeys(s.Positions) {
			p := s.Positions[positionID]
			if p.TenantID != tenantID || p.Symbol != quote.Symbol || p.Status != "OPEN" {
				continue
			}
			accountQuote, configuration, err := e.quoteFor(s, s.Accounts[p.AccountID], i, quote, now)
			if err != nil {
				return err
			}
			reason := execution.ProtectionTrigger(p, accountQuote)
			if reason != "" {
				if err := e.validateSystemExit(s, s.Accounts[p.AccountID], i, p, configuration); err == nil {
					if _, err := e.closePosition(s, p, p.Quantity, quote, accountQuote, reason, "system:"+domain.NewID(), now); err != nil {
						return err
					}
					continue
				}
			}
			audit.Append(s, tenantID, p.AccountID, "position", p.ID, "POSITION_UPDATED", s.Positions[p.ID], now)
		}
		if err := e.applyRisk(s, tenantID, now); err != nil {
			return err
		}
		pending := []domain.Order{}
		for _, o := range s.Orders {
			if o.TenantID == tenantID && o.Symbol == quote.Symbol && o.Status == "ACCEPTED" {
				accountQuote, configuration, err := e.quoteFor(s, s.Accounts[o.AccountID], i, quote, now)
				if err != nil {
					return err
				}
				if configuration.SessionStatus != "OPEN" {
					continue
				}
				if !execution.Trigger(o, accountQuote) {
					continue
				}
				pending = append(pending, o)
			}
		}
		sort.Slice(pending, func(a, b int) bool {
			if pending[a].UpdatedAt.Equal(pending[b].UpdatedAt) {
				return pending[a].ID < pending[b].ID
			}
			return pending[a].UpdatedAt.Before(pending[b].UpdatedAt)
		})
		for _, o := range pending {
			accountQuote, _, err := e.quoteFor(s, s.Accounts[o.AccountID], i, quote, now)
			if err != nil {
				return err
			}
			o.Status = "TRIGGERED"
			o.UpdatedAt = now
			audit.Append(s, tenantID, o.AccountID, "order", o.ID, "ORDER_TRIGGERED", o, now)
			if err := e.pretrade(s, s.Accounts[o.AccountID], i, o, accountQuote, now); err != nil {
				reject(s, &o, err, now)
				continue
			}
			if err := e.open(s, &o, i, quote, accountQuote, now); err != nil {
				return err
			}
		}
		if err := e.applyRisk(s, tenantID, now); err != nil {
			return err
		}
		// JPY conversion changes also revalue other instruments' account totals.
		for _, accountID := range sortedKeys(s.Accounts) {
			if s.Accounts[accountID].TenantID == tenantID {
				a := s.Accounts[accountID]
				accountQuote, _, err := e.quoteFor(s, a, i, quote, now)
				if err != nil {
					return err
				}
				audit.Append(s, tenantID, a.ID, "quote", quote.Symbol, "ACCOUNT_QUOTE_UPDATED", accountQuote, now)
				accountEvent(s, accountID, now)
			}
		}
		return nil
	})
}
