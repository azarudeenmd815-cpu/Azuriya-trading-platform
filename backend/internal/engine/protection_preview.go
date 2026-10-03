package engine

import (
	"azuriya/backend/internal/accounts"
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/instruments"
	"azuriya/backend/internal/orders"
	"azuriya/backend/internal/positions"
	"context"
	"github.com/shopspring/decimal"
	"time"
)

func ownedPosition(s *domain.State, a domain.Account, positionID string) (domain.Position, error) {
	p, ok := s.Positions[positionID]
	if !ok || p.AccountID != a.ID || p.TenantID != a.TenantID {
		return domain.Position{}, domain.Err("POSITION_NOT_FOUND", "Position not found")
	}
	return p, nil
}

func (e *Engine) validateProtection(s *domain.State, a domain.Account, p domain.Position, r domain.ProtectionRequest, now time.Time) (domain.Instrument, domain.Quote, error) {
	var i domain.Instrument
	var q domain.Quote
	if err := accounts.CanTrade(a, true); err != nil {
		return i, q, err
	}
	if p.Status != "OPEN" {
		return i, q, domain.Err("POSITION_CLOSED", "Position is already closed")
	}
	i, reference, err := market(s, a, p.Symbol, now)
	if err != nil {
		return i, q, err
	}
	if i.TradingStatus == "DISABLED" || i.TradingStatus == "CLOSED" {
		return i, q, domain.Err("INSTRUMENT_NOT_TRADABLE", "Instrument does not permit protection modification")
	}
	for _, price := range []*decimal.Decimal{r.StopLoss, r.TakeProfit} {
		if err := instruments.Price(i, price); err != nil {
			return i, q, err
		}
	}
	q, configuration, quoteErr := e.quoteFor(s, a, i, reference, now)
	err = quoteErr
	if err != nil {
		return i, q, err
	}
	if err := canOperate(s, a, i, configuration, true, false); err != nil {
		return i, q, err
	}
	if err := orders.Protection(p.Side, execution.Price(execution.Opposite(p.Side), q), r.StopLoss, r.TakeProfit); err != nil {
		return i, q, err
	}
	return i, q, nil
}

// PreviewProtection estimates outcomes from the original position entry, while
// validating protection against the current executable close-side quote.
func (e *Engine) PreviewProtection(ctx context.Context, id domain.Identity, accountID, positionID string, r domain.ProtectionRequest) (domain.OrderPreview, error) {
	if err := ctx.Err(); err != nil {
		return domain.OrderPreview{}, err
	}
	s := e.Snapshot()
	a, err := account(&s, id, accountID)
	if err != nil {
		return domain.OrderPreview{}, err
	}
	p, err := ownedPosition(&s, a, positionID)
	if err != nil {
		return domain.OrderPreview{}, err
	}
	now := time.Now().UTC()
	i, q, err := e.validateProtection(&s, a, p, r, now)
	if err != nil {
		return domain.OrderPreview{}, err
	}
	if err = e.revalue(&s, a.TenantID, now); err != nil {
		return domain.OrderPreview{}, err
	}
	a = s.Accounts[a.ID]
	p = s.Positions[p.ID]
	i = economicInstrument(i, p)
	converter := conversion(&s, a, now)
	preview := domain.OrderPreview{EstimatedEntry: p.OpenPrice, Quantity: p.Quantity, StopLoss: domain.CopyDecimal(r.StopLoss), TakeProfit: domain.CopyDecimal(r.TakeProfit), EstimatedMargin: p.MarginUsed, FreeMarginAfter: a.MarginFree, CanSubmit: true, NonBinding: true, QuoteSequence: q.Sequence, ValidationWarnings: []string{}}
	if r.StopLoss != nil {
		value, err := converter.Convert(positions.Profit(p.Side, p.OpenPrice, *r.StopLoss, p.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
		if err != nil {
			return domain.OrderPreview{}, err
		}
		preview.PotentialLoss = value.Neg()
		preview.DistanceToSL = p.OpenPrice.Sub(*r.StopLoss).Abs()
		preview.RiskAmount = decimal.Max(preview.PotentialLoss, decimal.Zero)
		if a.Equity.IsPositive() {
			preview.RiskPercent = preview.RiskAmount.Mul(domain.D("100")).DivRound(a.Equity, 8)
		}
	}
	if r.TakeProfit != nil {
		preview.PotentialProfit, err = converter.Convert(positions.Profit(p.Side, p.OpenPrice, *r.TakeProfit, p.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
		if err != nil {
			return domain.OrderPreview{}, err
		}
		preview.DistanceToTP = p.OpenPrice.Sub(*r.TakeProfit).Abs()
	}
	if preview.PotentialLoss.IsPositive() && r.TakeProfit != nil {
		preview.RiskReward = preview.PotentialProfit.DivRound(preview.PotentialLoss, 8)
	}
	if preview.PotentialLoss.IsNegative() {
		preview.ValidationWarnings = append(preview.ValidationWarnings, "Stop loss would lock in an estimated profit; a negative potential_loss represents that protected profit.")
	}
	return preview, nil
}

func (e *Engine) Breakeven(ctx context.Context, id domain.Identity, accountID, positionID string, r domain.BreakevenRequest) (domain.Position, error) {
	if err := commandKey(r.ClientOrderID); err != nil {
		return domain.Position{}, err
	}
	var result domain.Position
	var rejected error
	err := e.change(ctx, func(s *domain.State) error {
		a, err := account(s, id, accountID)
		if err != nil {
			return err
		}
		key := idemKey(accountID, r.ClientOrderID)
		fp := fingerprint("breakeven", positionID, r)
		if found, err := replay(s, key, fp, &result); found {
			rejected = err
			return nil
		}
		p, err := ownedPosition(s, a, positionID)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		audit.Append(s, a.TenantID, a.ID, "position", p.ID, "POSITION_BREAKEVEN_REQUESTED", map[string]any{"position_id": p.ID, "client_order_id": r.ClientOrderID, "stop_loss": p.OpenPrice}, now)
		protection := domain.ProtectionRequest{StopLoss: domain.CopyDecimal(&p.OpenPrice), TakeProfit: domain.CopyDecimal(p.TakeProfit)}
		_, _, err = e.validateProtection(s, a, p, protection, now)
		if err != nil {
			rejected = err
			if failure, ok := err.(*domain.Error); ok && failure.Code == "INVALID_STOP_LOSS" {
				rejected = domain.Err("BREAKEVEN_NOT_AVAILABLE", "The executable close price must be beyond entry before stop loss can move to breakeven")
			}
			result = p
			audit.Append(s, a.TenantID, a.ID, "position", p.ID, "POSITION_BREAKEVEN_REJECTED", map[string]any{"position_id": p.ID, "client_order_id": r.ClientOrderID, "message": rejected.Error()}, now)
			remember(s, key, fp, p.ID, p, rejected)
			return nil
		}
		p.StopLoss = protection.StopLoss
		s.Positions[p.ID] = p
		result = p
		audit.Append(s, a.TenantID, a.ID, "position", p.ID, "POSITION_PROTECTION_UPDATED", p, now)
		remember(s, key, fp, p.ID, p, nil)
		return nil
	})
	if err != nil {
		return domain.Position{}, err
	}
	return result.Clone(), rejected
}
