package engine

import (
	"azuriya/backend/internal/accounts"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/positions"
	"context"
	"github.com/shopspring/decimal"
	"time"
)

func validateCloseNumbers(r domain.CloseRequest) error {
	for _, v := range []*decimal.Decimal{r.Quantity, r.Percentage} {
		if v != nil && !domain.ValidInputDecimal(*v) {
			return domain.Err("INVALID_QUANTITY", "Close quantity or percentage precision is unsupported")
		}
	}
	return nil
}

func (e *Engine) PreviewClose(ctx context.Context, id domain.Identity, accountID, positionID string, r domain.CloseRequest) (domain.ClosePreview, error) {
	if err := ctx.Err(); err != nil {
		return domain.ClosePreview{}, err
	}
	if err := validateCloseNumbers(r); err != nil {
		return domain.ClosePreview{}, err
	}
	s := e.Snapshot()
	a, err := account(&s, id, accountID)
	if err != nil {
		return domain.ClosePreview{}, err
	}
	if err = accounts.CanTrade(a, true); err != nil {
		return domain.ClosePreview{}, err
	}
	p, ok := s.Positions[positionID]
	if !ok || p.AccountID != a.ID || p.TenantID != a.TenantID {
		return domain.ClosePreview{}, domain.Err("POSITION_NOT_FOUND", "Position not found")
	}
	if p.Status != "OPEN" {
		return domain.ClosePreview{}, domain.Err("POSITION_CLOSED", "Position is already closed")
	}
	now := time.Now().UTC()
	i, reference, err := market(&s, a, p.Symbol, now)
	if err != nil {
		return domain.ClosePreview{}, err
	}
	if i.TradingStatus == "DISABLED" || i.TradingStatus == "CLOSED" {
		return domain.ClosePreview{}, domain.Err("INSTRUMENT_NOT_TRADABLE", "Instrument is disabled")
	}
	q, configuration, err := e.quoteFor(&s, a, i, reference, now)
	if err != nil {
		return domain.ClosePreview{}, err
	}
	if err := canOperate(&s, a, i, configuration, true, false); err != nil {
		return domain.ClosePreview{}, err
	}
	return e.closePreview(&s, a, i, p, q, r, now)
}

func (e *Engine) closePreview(s *domain.State, a domain.Account, i domain.Instrument, p domain.Position, q domain.Quote, r domain.CloseRequest, now time.Time) (domain.ClosePreview, error) {
	requested, quantity, err := positions.CloseQuantity(i, p.Quantity, r)
	if err != nil {
		return domain.ClosePreview{}, err
	}
	price := execution.Price(execution.Opposite(p.Side), q)
	i = economicInstrument(i, p)
	profit, err := conversion(s, a, now).Convert(positions.Profit(p.Side, p.OpenPrice, price, quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
	if err != nil {
		return domain.ClosePreview{}, err
	}
	preview := domain.ClosePreview{PositionID: p.ID, PositionQuantity: p.Quantity, RequestedQuantity: requested, Quantity: quantity, RemainingQuantity: p.Quantity.Sub(quantity), ActualPercentage: quantity.Mul(domain.D("100")).DivRound(p.Quantity, 8), EstimatedPrice: price, EstimatedRealizedPnL: profit, Adjusted: !requested.Equal(quantity), ValidationWarnings: []string{}, NonBinding: true}
	if p.Economics != nil {
		preview.EstimatedCommission = broker.Commission(p.Economics.Commission, quantity, true)
	}
	preview.EstimatedNetPnL = profit.Sub(preview.EstimatedCommission)
	if preview.Adjusted {
		preview.ValidationWarnings = append(preview.ValidationWarnings, "Close quantity was adjusted to the nearest valid lot step and residual minimum.")
		if preview.RemainingQuantity.IsZero() {
			preview.ValidationWarnings = append(preview.ValidationWarnings, "This adjustment closes the entire remaining position.")
		}
	}
	return preview, nil
}
