package engine

import (
	"azuriya/backend/internal/accounts"
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

func validateTradeNumbers(r domain.TradeRequest) error {
	if !domain.ValidInputDecimal(r.Quantity) {
		return domain.Err("INVALID_QUANTITY", "Quantity precision or magnitude is unsupported")
	}
	for _, v := range []*decimal.Decimal{r.LimitPrice, r.StopPrice, r.StopLoss, r.TakeProfit, r.RiskPercent, r.RiskAmount} {
		if v != nil && !domain.ValidInputDecimal(*v) {
			return domain.Err("INVALID_DECIMAL", "Price or risk precision or magnitude is unsupported")
		}
	}
	return nil
}
func cloneTrade(r domain.TradeRequest) domain.TradeRequest {
	r.LimitPrice = domain.CopyDecimal(r.LimitPrice)
	r.StopPrice = domain.CopyDecimal(r.StopPrice)
	r.StopLoss = domain.CopyDecimal(r.StopLoss)
	r.TakeProfit = domain.CopyDecimal(r.TakeProfit)
	r.RiskPercent = domain.CopyDecimal(r.RiskPercent)
	r.RiskAmount = domain.CopyDecimal(r.RiskAmount)
	return r
}
func advancedTrade(r domain.TradeRequest) bool {
	return (r.QuantityMode != "" && r.QuantityMode != "LOTS") || r.RiskAmount != nil || r.RiskPercent != nil || (r.StopLossMode != "" && r.StopLossMode != "PRICE") || (r.TakeProfitMode != "" && r.TakeProfitMode != "PRICE")
}

func (e *Engine) PreviewOrder(ctx context.Context, id domain.Identity, accountID string, r domain.TradeRequest) (domain.OrderPreview, error) {
	if err := ctx.Err(); err != nil {
		return domain.OrderPreview{}, err
	}
	if err := validateTradeNumbers(r); err != nil {
		return domain.OrderPreview{}, err
	}
	s := e.Snapshot()
	a, err := account(&s, id, accountID)
	if err != nil {
		return domain.OrderPreview{}, err
	}
	if err = accounts.CanTrade(a, false); err != nil {
		return domain.OrderPreview{}, err
	}
	now := time.Now().UTC()
	i, reference, err := market(&s, a, r.Symbol, now)
	if err != nil {
		return domain.OrderPreview{}, err
	}
	q, configuration, err := e.quoteFor(&s, a, i, reference, now)
	if err != nil {
		return domain.OrderPreview{}, err
	}
	if err := canOperate(&s, a, i, configuration, false, false); err != nil {
		return domain.OrderPreview{}, err
	}
	if err = e.revalue(&s, a.TenantID, now); err != nil {
		return domain.OrderPreview{}, err
	}
	r = cloneTrade(r)
	r.ClientOrderID = "preview"
	_, preview, err := e.resolveTrade(&s, s.Accounts[a.ID], i, q, r, now)
	return preview, err
}

// resolveTrade uses the caller's one state/quote snapshot for all authoritative
// estimates. Submit invokes it again inside the serialized trading transition.
func (e *Engine) resolveTrade(s *domain.State, a domain.Account, i domain.Instrument, q domain.Quote, input domain.TradeRequest, now time.Time) (domain.OrderRequest, domain.OrderPreview, error) {
	r := input.OrderRequest
	p := domain.OrderPreview{ValidationWarnings: []string{}, NonBinding: true, CanSubmit: true, QuoteSequence: q.Sequence}
	configuration, configurationErr := broker.Resolve(s, a, i, now)
	if configurationErr != nil {
		return r, p, configurationErr
	}
	if err := canOperate(s, a, i, configuration, false, false); err != nil {
		return r, p, err
	}
	p.EffectiveLeverage = configuration.EffectiveLeverage
	p.SessionStatus = configuration.SessionStatus
	if r.Side != "BUY" && r.Side != "SELL" {
		return r, p, domain.Err("INVALID_SIDE", "Side must be BUY or SELL")
	}
	entry := execution.Price(r.Side, q)
	switch r.Type {
	case "MARKET":
	case "LIMIT":
		if r.LimitPrice == nil {
			return r, p, domain.Err("INVALID_PRICE", "Limit orders require limit_price")
		}
		if (r.Side == "BUY" && r.LimitPrice.LessThan(entry)) || (r.Side == "SELL" && r.LimitPrice.GreaterThan(entry)) {
			entry = *r.LimitPrice
		}
	case "STOP":
		if r.StopPrice == nil {
			return r, p, domain.Err("INVALID_PRICE", "Stop orders require stop_price")
		}
		entry = *r.StopPrice
	default:
		return r, p, domain.Err("INVALID_ORDER_TYPE", "Order type must be MARKET, LIMIT, or STOP")
	}
	var err error
	r.StopLoss, err = resolveProtection(entry, r.Side, input.StopLossMode, input.StopLoss, true)
	if err != nil {
		return r, p, err
	}
	r.TakeProfit, err = resolveProtection(entry, r.Side, input.TakeProfitMode, input.TakeProfit, false)
	if err != nil {
		return r, p, err
	}
	if err = orders.Protection(r.Side, entry, r.StopLoss, r.TakeProfit); err != nil {
		return r, p, err
	}
	mode := input.QuantityMode
	if mode == "" {
		mode = "LOTS"
	}
	converter := conversion(s, a, now)
	lossPerLot := decimal.Zero
	if r.StopLoss != nil {
		value, err := converter.Convert(positions.Profit(r.Side, entry, *r.StopLoss, domain.D("1"), i.ContractSize), i.QuoteCurrency, a.Currency)
		if err != nil {
			return r, p, err
		}
		lossPerLot = value.Neg().Add(broker.Commission(configuration.Commission, domain.D("1"), false)).Add(broker.Commission(configuration.Commission, domain.D("1"), true))
	}
	if mode != "LOTS" {
		if r.StopLoss == nil || !lossPerLot.IsPositive() {
			return r, p, domain.Err("STOP_LOSS_REQUIRED", "Risk sizing requires a valid stop loss")
		}
		if !a.Equity.IsPositive() {
			return r, p, domain.Err("INVALID_EQUITY", "Risk sizing requires positive account equity")
		}
		switch mode {
		case "RISK_PERCENT":
			if input.RiskPercent == nil || !input.RiskPercent.IsPositive() || input.RiskPercent.GreaterThan(domain.D("100")) {
				return r, p, domain.Err("INVALID_RISK_PERCENT", "Risk percentage must be greater than zero and at most 100")
			}
			if input.RiskAmount != nil {
				return r, p, domain.Err("INVALID_RISK", "Provide only risk_percent in percentage mode")
			}
			p.RiskPercent = *input.RiskPercent
			p.RiskAmount = a.Equity.Mul(*input.RiskPercent).Shift(-2)
		case "RISK_AMOUNT":
			if input.RiskAmount == nil || !input.RiskAmount.IsPositive() {
				return r, p, domain.Err("INVALID_RISK_AMOUNT", "Risk amount must be positive")
			}
			if input.RiskPercent != nil {
				return r, p, domain.Err("INVALID_RISK", "Provide only risk_amount in amount mode")
			}
			p.RiskAmount = *input.RiskAmount
			p.RiskPercent = p.RiskAmount.Mul(domain.D("100")).DivRound(a.Equity, 8)
		default:
			return r, p, domain.Err("INVALID_QUANTITY_MODE", "Quantity mode must be LOTS, RISK_PERCENT, or RISK_AMOUNT")
		}
		var capped bool
		r.Quantity, capped, err = risk.Size(p.RiskAmount, lossPerLot, i)
		if err != nil {
			return r, p, err
		}
		if capped {
			p.ValidationWarnings = append(p.ValidationWarnings, "Quantity was capped at the instrument maximum; estimated risk is below the requested budget.")
		}
		// Currency conversion rounds at ledger precision. Check the total loss,
		// not only rounded per-lot loss, before accepting a risk-sized quantity.
		total, err := converter.Convert(positions.Profit(r.Side, entry, *r.StopLoss, r.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
		if err != nil {
			return r, p, err
		}
		knownCosts := broker.Commission(configuration.Commission, r.Quantity, false).Add(broker.Commission(configuration.Commission, r.Quantity, true))
		if total.Neg().Add(knownCosts).GreaterThan(p.RiskAmount) {
			r.Quantity = r.Quantity.Sub(i.QuantityStep)
			if r.Quantity.LessThan(i.MinQuantity) {
				return r, p, domain.Err("RISK_BELOW_MINIMUM", "Risk budget is too small after currency-conversion rounding")
			}
			total, err = converter.Convert(positions.Profit(r.Side, entry, *r.StopLoss, r.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
			if err != nil {
				return r, p, err
			}
			knownCosts = broker.Commission(configuration.Commission, r.Quantity, false).Add(broker.Commission(configuration.Commission, r.Quantity, true))
			if total.Neg().Add(knownCosts).GreaterThan(p.RiskAmount) {
				return r, p, domain.Err("RISK_PRECISION_UNSUPPORTED", "Risk sizing cannot meet the budget at available conversion precision")
			}
			p.ValidationWarnings = append(p.ValidationWarnings, "Quantity was reduced one lot step to keep converted loss within the risk budget.")
		}
	} else if input.RiskPercent != nil || input.RiskAmount != nil {
		return r, p, domain.Err("INVALID_RISK", "LOTS mode cannot specify a risk budget")
	}
	if err = orders.Validate(r, i, q); err != nil {
		return r, p, err
	}
	p.EstimatedEntry = entry
	p.Quantity = r.Quantity
	p.StopLoss = domain.CopyDecimal(r.StopLoss)
	p.TakeProfit = domain.CopyDecimal(r.TakeProfit)
	p.EstimatedCommission = broker.Commission(configuration.Commission, r.Quantity, false)
	p.EstimatedCloseCommission = broker.Commission(configuration.Commission, r.Quantity, true)
	if r.StopLoss != nil {
		p.DistanceToSL = entry.Sub(*r.StopLoss).Abs()
		value, err := converter.Convert(positions.Profit(r.Side, entry, *r.StopLoss, r.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
		if err != nil {
			return r, p, err
		}
		p.PotentialLoss = value.Neg().Add(p.EstimatedCommission).Add(p.EstimatedCloseCommission)
	}
	if r.TakeProfit != nil {
		p.DistanceToTP = entry.Sub(*r.TakeProfit).Abs()
		p.PotentialProfit, err = converter.Convert(positions.Profit(r.Side, entry, *r.TakeProfit, r.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
		if err != nil {
			return r, p, err
		}
		p.PotentialProfit = p.PotentialProfit.Sub(p.EstimatedCommission).Sub(p.EstimatedCloseCommission)
	}
	if mode == "LOTS" {
		p.RiskAmount = p.PotentialLoss
		if a.Equity.IsPositive() {
			p.RiskPercent = p.RiskAmount.Mul(domain.D("100")).DivRound(a.Equity, 8)
		}
	}
	if p.PotentialLoss.IsPositive() && r.TakeProfit != nil {
		p.RiskReward = p.PotentialProfit.DivRound(p.PotentialLoss, 8)
	}
	p.EstimatedMargin, err = requiredMargin(s, a, i, configuration, r.Quantity, entry, now)
	if err != nil {
		return r, p, err
	}
	spreadPnL, err := converter.Convert(positions.Profit(r.Side, execution.Price(r.Side, q), execution.Price(execution.Opposite(r.Side), q), r.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
	if err != nil {
		return r, p, err
	}
	p.FreeMarginAfter = a.MarginFree.Add(spreadPnL).Sub(p.EstimatedMargin).Sub(p.EstimatedCommission)
	if err = risk.Check(a, p.EstimatedMargin, spreadPnL.Sub(p.EstimatedCommission)); err != nil {
		p.CanSubmit = false
		p.ValidationWarnings = append(p.ValidationWarnings, err.Error())
	}
	if r.Type != "MARKET" {
		p.ValidationWarnings = append(p.ValidationWarnings, "Pending orders do not reserve margin. Risk and margin are checked again when the order triggers.")
	}
	if r.StopLoss != nil {
		p.ValidationWarnings = append(p.ValidationWarnings, "Stop-loss estimates use the specified price and current conversion rates. Gaps can increase realized losses.")
	}
	return r, p, nil
}

func resolveProtection(entry decimal.Decimal, side, mode string, value *decimal.Decimal, stopLoss bool) (*decimal.Decimal, error) {
	if mode == "" {
		mode = "PRICE"
	}
	if mode != "PRICE" && mode != "DISTANCE" {
		return nil, domain.Err("INVALID_PROTECTION_MODE", "Protection mode must be PRICE or DISTANCE")
	}
	if value == nil {
		return nil, nil
	}
	if !value.IsPositive() {
		return nil, domain.Err("INVALID_PRICE", "Protection value must be positive")
	}
	if mode == "PRICE" {
		return domain.CopyDecimal(value), nil
	}
	price := entry.Add(*value)
	if (side == "BUY" && stopLoss) || (side == "SELL" && !stopLoss) {
		price = entry.Sub(*value)
	}
	return &price, nil
}
