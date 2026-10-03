package engine

import (
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"sort"
	"time"
)

// applyRisk runs within the candidate transition; callers revalue before it.
// System exits cannot create exposure and remain deferred without executable markets.
func (e *Engine) applyRisk(s *domain.State, tenantID string, now time.Time) error {
	for _, accountID := range sortedKeys(s.Accounts) {
		a := s.Accounts[accountID]
		if a.TenantID != tenantID {
			continue
		}
		c, err := broker.ResolveAccount(s, a, now)
		if err != nil {
			return err
		}
		if !c.Margin.StopOutEnabled {
			continue
		}
		breached := func(a domain.Account) bool {
			return a.MarginUsed.IsPositive() && (!a.Equity.IsPositive() || a.Equity.Mul(domain.D("100")).LessThanOrEqual(a.MarginUsed.Mul(c.Margin.StopOutLevel)))
		}
		if !breached(a) {
			continue
		}
		accountEvent(s, a.ID, now)
		audit.Append(s, tenantID, a.ID, "account", a.ID, "STOP_OUT_STARTED", map[string]any{"account": a, "policy": c.Margin}, now)
		pending := []domain.Position{}
		for _, p := range s.Positions {
			if p.AccountID == accountID && p.TenantID == tenantID && p.Status == "OPEN" {
				pending = append(pending, p)
			}
		}
		sort.Slice(pending, func(i, j int) bool {
			if !pending[i].UnrealizedPnL.Equal(pending[j].UnrealizedPnL) {
				return pending[i].UnrealizedPnL.LessThan(pending[j].UnrealizedPnL)
			}
			if !pending[i].OpenedAt.Equal(pending[j].OpenedAt) {
				return pending[i].OpenedAt.Before(pending[j].OpenedAt)
			}
			return pending[i].ID < pending[j].ID
		})
		for _, candidate := range pending {
			a = s.Accounts[accountID]
			if !breached(a) {
				break
			}
			p := s.Positions[candidate.ID]
			i, reference, err := market(s, a, p.Symbol, now)
			if err != nil {
				continue
			}
			q, configuration, err := e.quoteFor(s, a, i, reference, now)
			if err != nil {
				continue
			}
			if err := e.validateSystemExit(s, a, i, p, configuration); err != nil {
				continue
			}
			audit.Append(s, tenantID, a.ID, "position", p.ID, "STOP_OUT_POSITION_SELECTED", map[string]any{"position": p, "policy": c.Margin}, now)
			if _, err := e.closePosition(s, p, p.Quantity, reference, q, "STOP_OUT", "system:"+domain.NewID(), now); err != nil {
				return err
			}
		}
		a = s.Accounts[accountID]
		event := "STOP_OUT_COMPLETED"
		if breached(a) {
			event = "STOP_OUT_DEFERRED"
		}
		audit.Append(s, tenantID, a.ID, "account", a.ID, event, a, now)
		accountEvent(s, a.ID, now)
	}
	return nil
}
