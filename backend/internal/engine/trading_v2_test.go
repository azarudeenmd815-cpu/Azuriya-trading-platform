package engine_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"github.com/shopspring/decimal"
)

func riskRequest(key, mode string) domain.TradeRequest {
	return domain.TradeRequest{OrderRequest: domain.OrderRequest{ClientOrderID: key, Symbol: "EURUSD", Side: "BUY", Type: "MARKET", StopLoss: ptr("0.00200"), TakeProfit: ptr("0.00500")}, QuantityMode: mode, StopLossMode: "DISTANCE", TakeProfitMode: "DISTANCE"}
}
func eventCount(s domain.State, kind string) int {
	count := 0
	for _, event := range s.Events {
		if event.Type == kind {
			count++
		}
	}
	return count
}

func TestRiskPercentSizingAndDistancePreview(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("risk-percent", "RISK_PERCENT")
	r.RiskPercent = ptr("0.5")
	p, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.EstimatedEntry, "1.08462")
	assertDecimal(t, p.Quantity, "2.5")
	assertDecimal(t, p.RiskAmount, "500")
	assertDecimal(t, p.RiskPercent, "0.5")
	assertDecimal(t, p.PotentialLoss, "500")
	assertDecimal(t, p.PotentialProfit, "1250")
	assertDecimal(t, p.RiskReward, "2.5")
	assertDecimal(t, *p.StopLoss, "1.08262")
	assertDecimal(t, *p.TakeProfit, "1.08962")
	assertDecimal(t, p.EstimatedMargin, "2711.55")
	assertDecimal(t, p.FreeMarginAfter, "97258.45")
	if !p.NonBinding || !p.CanSubmit || len(e.Snapshot().Events) != 0 {
		t.Fatal("preview must be a read-only nonbinding projection")
	}
	o, err := e.SubmitTrade(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, o.Quantity, "2.5")
	assertDecimal(t, *o.StopLoss, "1.08262")
	if eventCount(e.Snapshot(), "ORDER_SIZING_RESOLVED") != 1 {
		t.Fatal("resolved intent not audited")
	}
}

func TestRiskAmountSizingFloorsToStep(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("risk-amount", "RISK_AMOUNT")
	r.RiskAmount = ptr("100")
	r.StopLoss = ptr("0.003")
	p, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.Quantity, "0.33")
	assertDecimal(t, p.PotentialLoss, "99")
	if p.PotentialLoss.GreaterThan(p.RiskAmount) {
		t.Fatal("sizing rounded above risk budget")
	}
	o, err := e.SubmitTrade(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, o.Quantity, "0.33")
}

func TestRiskPreviewSubmitRecomputesCurrentEntry(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("recompute", "RISK_AMOUNT")
	r.RiskAmount = ptr("500")
	r.StopLossMode = "PRICE"
	r.StopLoss = ptr("1.08262")
	p, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.Quantity, "2.5")
	tick(t, e, "EURUSD", "1.08550", "1.08562")
	o, err := e.SubmitTrade(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, o.Quantity, "1.66")
	assertDecimal(t, e.Snapshot().Positions[o.PositionID].OpenPrice, "1.08562")
	tick(t, e, "EURUSD", "1.08560", "1.08572")
	replay, err := e.SubmitTrade(ctx, id, a, r)
	if err != nil || replay.ID != o.ID || len(e.Snapshot().Positions) != 1 {
		t.Fatal("risk replay recomputed economic effects", err)
	}
	r.RiskAmount = ptr("501")
	_, err = e.SubmitTrade(ctx, id, a, r)
	assertCode(t, err, "IDEMPOTENCY_CONFLICT")
}

func TestRiskPercentSubmitRecomputesEquity(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("equity-risk", "RISK_PERCENT")
	r.RiskPercent = ptr("0.5")
	preview, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.Quantity, "2.5")
	submit(t, e, id, a, request("existing", "BUY", "MARKET", "1"))
	o, err := e.SubmitTrade(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, o.Quantity, "2.49")
}

func TestRiskSizingValidation(t *testing.T) {
	cases := []struct {
		name, code string
		change     func(*domain.TradeRequest)
	}{
		{"no-stop", "STOP_LOSS_REQUIRED", func(r *domain.TradeRequest) { r.StopLoss = nil }},
		{"wrong-side", "INVALID_STOP_LOSS", func(r *domain.TradeRequest) { r.StopLossMode = "PRICE"; r.StopLoss = ptr("1.09") }},
		{"zero-risk", "INVALID_RISK_AMOUNT", func(r *domain.TradeRequest) { r.RiskAmount = ptr("0") }},
		{"below-min", "RISK_BELOW_MINIMUM", func(r *domain.TradeRequest) { r.RiskAmount = ptr("0.01") }},
		{"unsupported-mode", "INVALID_QUANTITY_MODE", func(r *domain.TradeRequest) { r.QuantityMode = "RISK" }},
		{"pips-unsupported", "INVALID_PROTECTION_MODE", func(r *domain.TradeRequest) { r.StopLossMode = "PIPS" }},
		{"off-tick-distance", "INVALID_PRICE", func(r *domain.TradeRequest) { r.StopLoss = ptr("0.002001") }},
		{"ambiguous-risk", "INVALID_RISK", func(r *domain.TradeRequest) { r.RiskPercent = ptr("1") }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, id, a := fixture(t)
			r := riskRequest(tc.name, "RISK_AMOUNT")
			r.RiskAmount = ptr("100")
			tc.change(&r)
			_, err := e.PreviewOrder(ctx, id, a, r)
			assertCode(t, err, tc.code)
			o, err := e.SubmitTrade(ctx, id, a, r)
			assertCode(t, err, tc.code)
			if o.Status != "REJECTED" || eventCount(e.Snapshot(), "ORDER_REJECTED") != 1 || len(e.Snapshot().Fills) != 0 {
				t.Fatal("invalid sizing must be rejected and audited")
			}
		})
	}
}

func TestPreviewMarginWarningAndSubmitRiskEnforcement(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("margin-warning", "RISK_AMOUNT")
	r.RiskAmount = ptr("1000000")
	p, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.Quantity, "100")
	if p.CanSubmit || len(p.ValidationWarnings) < 2 {
		t.Fatal("nonbinding preview must expose cap and margin warnings")
	}
	_, err = e.SubmitTrade(ctx, id, a, r)
	assertCode(t, err, "INSUFFICIENT_MARGIN")
	if len(e.Snapshot().Positions) != 0 {
		t.Fatal("preview bypassed execution risk")
	}
}

func TestRiskJPYPreviewConversion(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("jpy-risk", "RISK_AMOUNT")
	r.Symbol = "USDJPY"
	r.RiskAmount = ptr("100")
	r.StopLoss = ptr("0.864")
	r.TakeProfit = ptr("1.728")
	p, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.Quantity, "0.17")
	if !p.PotentialLoss.IsPositive() || p.PotentialLoss.GreaterThan(domain.D("100")) {
		t.Fatal("JPY risk conversion exceeded budget", p.PotentialLoss)
	}
	assertDecimal(t, p.EstimatedMargin, "170")
}

func TestLegacyOrderJSONAndReplayRemainCompatible(t *testing.T) {
	e, id, a := fixture(t)
	old := request("legacy", "SELL", "MARKET", "0.1")
	o := submit(t, e, id, a, old)
	encoded, err := json.Marshal(old)
	if err != nil {
		t.Fatal(err)
	}
	var intent domain.TradeRequest
	if err = json.Unmarshal(encoded, &intent); err != nil {
		t.Fatal(err)
	}
	intent.QuantityMode = "LOTS"
	intent.StopLossMode = "PRICE"
	result, err := e.SubmitTrade(ctx, id, a, intent)
	if err != nil || result.ID != o.ID || len(e.Snapshot().Fills) != 1 {
		t.Fatal("legacy placement replay changed", err)
	}
}

func TestPercentageClosePreviewExecutionAndReplay(t *testing.T) {
	for _, percent := range []string{"10", "25", "50", "75", "100"} {
		t.Run(percent, func(t *testing.T) {
			e, id, a := fixture(t)
			o := submit(t, e, id, a, request("open", "BUY", "MARKET", "1"))
			r := domain.CloseRequest{ClientOrderID: "percentage", Percentage: ptr(percent)}
			preview, err := e.PreviewClose(ctx, id, a, o.PositionID, r)
			if err != nil {
				t.Fatal(err)
			}
			want := domain.D(percent).Shift(-2)
			assertDecimal(t, preview.Quantity, want.String())
			p, err := e.Close(ctx, id, a, o.PositionID, r)
			if err != nil {
				t.Fatal(err)
			}
			assertDecimal(t, p.Quantity, domain.D("1").Sub(want).String())
			replay, err := e.Close(ctx, id, a, o.PositionID, r)
			if err != nil || !replay.Quantity.Equal(p.Quantity) || len(e.Snapshot().Fills) != 2 {
				t.Fatal("percent close replay repeated", err)
			}
			if eventCount(e.Snapshot(), "POSITION_PARTIAL_CLOSE_REQUESTED") != 1 {
				t.Fatal("percent close request audit missing")
			}
		})
	}
}

func TestPercentageCloseRoundingAndMinimumResidual(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("small", "BUY", "MARKET", "0.03"))
	preview, err := e.PreviewClose(ctx, id, a, o.PositionID, domain.CloseRequest{Percentage: ptr("50")})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.Quantity, "0.01")
	assertDecimal(t, preview.RemainingQuantity, "0.02")
	if !preview.Adjusted {
		t.Fatal("half-step adjustment must be explicit")
	}
	s := e.Snapshot()
	i := s.Instruments[domain.MarketKey(id.TenantID, "EURUSD")]
	i.MinQuantity = domain.D("0.02")
	s.Instruments[domain.MarketKey(id.TenantID, "EURUSD")] = i
	e = engine.New(s, nil)
	preview, err = e.PreviewClose(ctx, id, a, o.PositionID, domain.CloseRequest{Percentage: ptr("25")})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.Quantity, "0.03")
	assertDecimal(t, preview.RemainingQuantity, "0")
	if len(preview.ValidationWarnings) != 2 {
		t.Fatal("full-close adjustment must warn explicitly")
	}
}

func TestPercentageCloseRejectsAmbiguousAndInvalidInputs(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("open", "BUY", "MARKET", "0.1"))
	for _, percent := range []string{"0", "-1", "101"} {
		_, err := e.PreviewClose(ctx, id, a, o.PositionID, domain.CloseRequest{Percentage: ptr(percent)})
		assertCode(t, err, "INVALID_PERCENTAGE")
	}
	_, err := e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "ambiguous", Percentage: ptr("50"), Quantity: ptr("0.05")})
	assertCode(t, err, "INVALID_CLOSE_REQUEST")
}

func TestBreakevenValidationAuditAndReplay(t *testing.T) {
	for _, side := range []string{"BUY", "SELL"} {
		t.Run(side, func(t *testing.T) {
			e, id, a := fixture(t)
			o := submit(t, e, id, a, request("open", side, "MARKET", "1"))
			failed := domain.BreakevenRequest{ClientOrderID: "too-early"}
			_, err := e.Breakeven(ctx, id, a, o.PositionID, failed)
			assertCode(t, err, "BREAKEVEN_NOT_AVAILABLE")
			if side == "BUY" {
				tick(t, e, "EURUSD", "1.08562", "1.08574")
			} else {
				tick(t, e, "EURUSD", "1.08338", "1.08350")
			}
			_, err = e.Breakeven(ctx, id, a, o.PositionID, failed)
			assertCode(t, err, "BREAKEVEN_NOT_AVAILABLE")
			if eventCount(e.Snapshot(), "POSITION_BREAKEVEN_REJECTED") != 1 {
				t.Fatal("failed breakeven replay was not idempotent")
			}
			r := domain.BreakevenRequest{ClientOrderID: "now-valid"}
			p, err := e.Breakeven(ctx, id, a, o.PositionID, r)
			if err != nil {
				t.Fatal(err)
			}
			assertDecimal(t, *p.StopLoss, p.OpenPrice.String())
			_, err = e.Breakeven(ctx, id, a, o.PositionID, r)
			if err != nil {
				t.Fatal(err)
			}
			s := e.Snapshot()
			if eventCount(s, "POSITION_BREAKEVEN_REQUESTED") != 2 || eventCount(s, "POSITION_PROTECTION_UPDATED") != 1 {
				t.Fatal("breakeven events incorrect")
			}
			for _, event := range s.Events {
				if event.AccountID == a && event.UserID != id.UserID {
					t.Fatal("audit actor missing")
				}
			}
		})
	}
}

func TestProtectionPreviewUsesOriginalEntryAndCloseValidation(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("open", "BUY", "MARKET", "1"))
	r := domain.ProtectionRequest{StopLoss: ptr("1.08262"), TakeProfit: ptr("1.08962")}
	preview, err := e.PreviewProtection(ctx, id, a, o.PositionID, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.PotentialLoss, "200")
	assertDecimal(t, preview.PotentialProfit, "500")
	assertDecimal(t, preview.RiskReward, "2.5")
	tick(t, e, "EURUSD", "1.08562", "1.08574")
	preview, err = e.PreviewProtection(ctx, id, a, o.PositionID, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.PotentialLoss, "200")
	_, err = e.PreviewProtection(ctx, id, a, o.PositionID, domain.ProtectionRequest{StopLoss: ptr("1.08570")})
	assertCode(t, err, "INVALID_STOP_LOSS")
}

func TestPendingOrderModificationPreservesIdentityAndAudit(t *testing.T) {
	e, id, a := fixture(t)
	r := request("pending", "BUY", "LIMIT", "0.1")
	r.LimitPrice = ptr("1.08300")
	r.StopLoss = ptr("1.08200")
	o := submit(t, e, id, a, r)
	change := domain.ModifyOrderRequest{ClientOrderID: "modify", Quantity: ptr("0.2"), EntryPrice: ptr("1.08350"), StopLoss: ptr("1.08250"), TakeProfit: ptr("1.08550")}
	modified, err := e.ModifyOrder(ctx, id, a, o.ID, change)
	if err != nil {
		t.Fatal(err)
	}
	if modified.ID != o.ID || modified.ClientOrderID != o.ClientOrderID || !modified.CreatedAt.Equal(o.CreatedAt) || modified.UpdatedAt.Before(o.UpdatedAt) {
		t.Fatal("pending order identity or creation changed")
	}
	assertDecimal(t, modified.Quantity, "0.2")
	assertDecimal(t, *modified.LimitPrice, "1.0835")
	_, err = e.ModifyOrder(ctx, id, a, o.ID, change)
	if err != nil {
		t.Fatal(err)
	}
	if eventCount(e.Snapshot(), "ORDER_MODIFIED") != 1 {
		t.Fatal("modified retry emitted duplicate event")
	}
	change.Quantity = ptr("0.3")
	_, err = e.ModifyOrder(ctx, id, a, o.ID, change)
	assertCode(t, err, "IDEMPOTENCY_CONFLICT")
	tick(t, e, "EURUSD", "1.08338", "1.08350")
	s := e.Snapshot()
	if s.Orders[o.ID].Status != "FILLED" {
		t.Fatal("modified pending order did not trigger")
	}
	assertDecimal(t, s.Positions[s.Orders[o.ID].PositionID].Quantity, "0.2")
}

func TestPendingModificationFailureKeepsAcceptedOrder(t *testing.T) {
	e, id, a := fixture(t)
	r := request("pending", "BUY", "STOP", "0.1")
	r.StopPrice = ptr("1.08600")
	o := submit(t, e, id, a, r)
	bad := domain.ModifyOrderRequest{ClientOrderID: "bad", EntryPrice: ptr("1.08400")}
	_, err := e.ModifyOrder(ctx, id, a, o.ID, bad)
	assertCode(t, err, "INVALID_STOP_PRICE")
	_, err = e.ModifyOrder(ctx, id, a, o.ID, bad)
	assertCode(t, err, "INVALID_STOP_PRICE")
	s := e.Snapshot()
	if s.Orders[o.ID].Status != "ACCEPTED" || eventCount(s, "ORDER_MODIFICATION_REJECTED") != 1 {
		t.Fatal("failed modification changed canonical order")
	}
	assertDecimal(t, *s.Orders[o.ID].StopPrice, "1.086")
	_, err = e.ModifyOrder(ctx, id, a, o.ID, domain.ModifyOrderRequest{ClientOrderID: "too-large", Quantity: ptr("100")})
	assertCode(t, err, "INSUFFICIENT_MARGIN")
}

func TestMarketableLimitModificationFillsAtomically(t *testing.T) {
	e, id, a := fixture(t)
	r := request("pending", "BUY", "LIMIT", "0.1")
	r.LimitPrice = ptr("1.083")
	o := submit(t, e, id, a, r)
	modified, err := e.ModifyOrder(ctx, id, a, o.ID, domain.ModifyOrderRequest{ClientOrderID: "marketable", EntryPrice: ptr("1.085")})
	if err != nil {
		t.Fatal(err)
	}
	if modified.Status != "FILLED" || len(e.Snapshot().Positions) != 1 {
		t.Fatal("marketable changed limit must fill in same transition")
	}
	_, err = e.ModifyOrder(ctx, id, a, o.ID, domain.ModifyOrderRequest{ClientOrderID: "after-fill", EntryPrice: ptr("1.086")})
	assertCode(t, err, "ORDER_NOT_MODIFIABLE")
}

func TestV2OwnershipAllAccountOperations(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("open", "BUY", "MARKET", "0.1"))
	r := riskRequest("risk", "RISK_AMOUNT")
	r.RiskAmount = ptr("100")
	for _, intruder := range []domain.Identity{{UserID: "other", TenantID: id.TenantID}, {UserID: id.UserID, TenantID: "other"}} {
		_, err := e.PreviewOrder(ctx, intruder, a, r)
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.SubmitTrade(ctx, intruder, a, r)
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.PreviewClose(ctx, intruder, a, o.PositionID, domain.CloseRequest{Percentage: ptr("50")})
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.PreviewProtection(ctx, intruder, a, o.PositionID, domain.ProtectionRequest{})
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.Breakeven(ctx, intruder, a, o.PositionID, domain.BreakevenRequest{ClientOrderID: "attack"})
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.ModifyOrder(ctx, intruder, a, o.ID, domain.ModifyOrderRequest{ClientOrderID: "attack-mod"})
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
	}
}

func TestProtectionDisabledStatusAndFailureAudit(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("open", "BUY", "MARKET", "0.1"))
	s := e.Snapshot()
	i := s.Instruments[domain.MarketKey(id.TenantID, "EURUSD")]
	i.TradingStatus = "DISABLED"
	s.Instruments[domain.MarketKey(id.TenantID, "EURUSD")] = i
	e = engine.New(s, nil)
	r := domain.ProtectionRequest{StopLoss: ptr("1.08300")}
	_, err := e.PreviewProtection(ctx, id, a, o.PositionID, r)
	assertCode(t, err, "INSTRUMENT_NOT_TRADABLE")
	_, err = e.SetProtection(ctx, id, a, o.PositionID, r)
	assertCode(t, err, "INSTRUMENT_NOT_TRADABLE")
	if eventCount(e.Snapshot(), "POSITION_PROTECTION_MODIFICATION_REJECTED") != 1 {
		t.Fatal("protection rejection not audited")
	}
}

func TestV2PersistenceFailureDoesNotCommitModification(t *testing.T) {
	e, id, a := fixture(t)
	r := request("pending", "BUY", "LIMIT", "0.1")
	r.LimitPrice = ptr("1.083")
	o := submit(t, e, id, a, r)
	s := e.Snapshot()
	e = engine.New(s, func(context.Context, domain.State) error { return errors.New("database down") })
	published := 0
	e.SetPublisher(func(domain.Event) { published++ })
	_, err := e.ModifyOrder(ctx, id, a, o.ID, domain.ModifyOrderRequest{ClientOrderID: "change", Quantity: ptr("0.2")})
	assertCode(t, err, "PERSISTENCE_FAILED")
	assertDecimal(t, e.Snapshot().Orders[o.ID].Quantity, "0.1")
	if published != 0 || eventCount(e.Snapshot(), "ORDER_MODIFIED") != 0 {
		t.Fatal("failed modification escaped transaction")
	}
}

func TestPreviewFinancialJSONUsesStrings(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("json", "RISK_AMOUNT")
	r.RiskAmount = ptr("100")
	preview, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(preview)
	if err != nil {
		t.Fatal(err)
	}
	var values map[string]any
	if err = json.Unmarshal(data, &values); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"estimated_entry", "quantity", "risk_amount", "risk_percent", "potential_loss", "potential_profit", "risk_reward", "estimated_margin", "free_margin_after", "distance_to_sl", "distance_to_tp"} {
		if _, ok := values[key].(string); !ok {
			t.Fatalf("%s must be a decimal JSON string", key)
		}
	}
}

func TestRiskExtremeInputAndCancelledPreview(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("large", "RISK_AMOUNT")
	bad := decimal.New(1, 1000000)
	r.RiskAmount = &bad
	_, err := e.PreviewOrder(ctx, id, a, r)
	assertCode(t, err, "INVALID_DECIMAL")
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = e.PreviewClose(cancelled, id, a, "missing", domain.CloseRequest{})
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestRiskTotalConversionRoundingNeverExceedsBudget(t *testing.T) {
	e, id, a := fixture(t)
	r := riskRequest("jpy-boundary", "RISK_AMOUNT")
	r.Symbol = "USDJPY"
	r.Type = "LIMIT"
	r.LimitPrice = ptr("149.000")
	r.StopLoss = ptr("0.001")
	r.TakeProfit = nil
	// 100 JPY loss per lot converted at current bid rounds down per lot;
	// multiplying that result by 100 differs from converting the total loss.
	r.RiskAmount = ptr("66.7334000667")
	preview, err := e.PreviewOrder(ctx, id, a, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.Quantity, "99.99")
	if preview.PotentialLoss.GreaterThan(*r.RiskAmount) {
		t.Fatal("total conversion rounding exceeded requested risk budget")
	}
}
