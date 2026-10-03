package engine

import (
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"context"
	"github.com/shopspring/decimal"
	"time"
)

func (e *Engine) ProcessRollover(ctx context.Context, now time.Time) error {
	if now.IsZero() {
		return domain.Err("INVALID_ROLLOVER_TIME", "Rollover time is required")
	}
	return e.change(ctx, func(s *domain.State) error {
		tenants := map[string]bool{}
		for _, a := range s.Accounts {
			tenants[a.TenantID] = true
		}
		for _, tenant := range sortedKeys(tenants) {
			if err := e.accrueRollover(s, tenant, now); err != nil {
				return err
			}
			if err := e.revalue(s, tenant, now); err != nil {
				return err
			}
			if err := e.applyRisk(s, tenant, now); err != nil {
				return err
			}
			for _, accountID := range sortedKeys(s.Accounts) {
				if s.Accounts[accountID].TenantID == tenant {
					accountEvent(s, accountID, now)
				}
			}
		}
		return nil
	})
}
func (e *Engine) accrueRollover(s *domain.State, tenantID string, now time.Time) error {
	changed := false
	for _, positionID := range sortedKeys(s.Positions) {
		p := s.Positions[positionID]
		if p.TenantID != tenantID || p.Status != "OPEN" {
			continue
		}
		a := s.Accounts[p.AccountID]
		i := s.Instruments[domain.MarketKey(tenantID, p.Symbol)]
		c, err := broker.Resolve(s, a, i, now)
		if err != nil {
			return err
		}
		policy := c.Swap
		if !policy.Enabled {
			continue
		}
		location, err := time.LoadLocation(policy.Timezone)
		if err != nil {
			return err
		}
		local := now.In(location)
		for offset := policy.CatchUpDays - 1; offset >= 0; offset-- {
			date := local.AddDate(0, 0, -offset)
			boundary, err := broker.RolloverAt(policy, date)
			if err != nil {
				return err
			}
			if boundary.After(now) || !p.OpenedAt.Before(boundary) {
				continue
			}
			localDate := boundary.In(location).Format("2006-01-02")
			key := p.ID + ":" + localDate
			if _, ok := s.Broker.RolloverKeys[key]; ok {
				continue
			}
			rate := policy.LongRate
			if p.Side == "SELL" {
				rate = policy.ShortRate
			}
			multiplier := int64(1)
			if int(boundary.In(location).Weekday()) == policy.TripleSwapDay {
				multiplier = 3
			}
			amount := p.Quantity.Mul(rate).Mul(decimal.NewFromInt(multiplier))
			a = s.Accounts[p.AccountID]
			a.Balance = a.Balance.Add(amount)
			a.UpdatedAt = now
			s.Accounts[a.ID] = a
			p.SwapAccrued = p.SwapAccrued.Add(amount)
			s.Positions[p.ID] = p
			s.Broker.RolloverKeys[key] = domain.RolloverCheckpoint{PositionID: p.ID, LocalDate: localDate, SwapPlanID: c.SwapPlanID, RolloverAt: boundary.UTC(), Amount: amount}
			tx := domain.Transaction{ID: domain.NewID(), TenantID: tenantID, AccountID: a.ID, PositionID: p.ID, Type: "SWAP", Amount: amount, Currency: a.Currency, BalanceAfter: a.Balance, CreatedAt: now, ProfileID: c.SwapPlanID, RolloverDate: localDate, Reference: key, Reason: "Simulated money-per-lot rollover"}
			s.Transactions = append(s.Transactions, tx)
			audit.Append(s, tenantID, a.ID, "transaction", tx.ID, "SWAP_ACCRUED", map[string]any{"transaction": tx, "rollover_at": boundary, "multiplier": multiplier, "swap_plan_revision": c.ProfileRevisions["swap_plan_id"]}, now)
			changed = true
		}
	}
	if changed {
		return e.revalue(s, tenantID, now)
	}
	return nil
}
