package engine_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
	"azuriya/backend/internal/execution"
	"github.com/shopspring/decimal"
)

var ctx = context.Background()

func ptr(value string) *decimal.Decimal { d := domain.D(value); return &d }
func fixture(t *testing.T) (*engine.Engine, domain.Identity, string) {
	t.Helper()
	s := domain.Seed("tenant-a", "user-a")
	var accountID string
	for id := range s.Accounts {
		accountID = id
	}
	return engine.New(s, nil), domain.Identity{TenantID: "tenant-a", UserID: "user-a", Role: "TRADER"}, accountID
}
func request(key, side, kind, qty string) domain.OrderRequest {
	return domain.OrderRequest{ClientOrderID: key, Symbol: "EURUSD", Side: side, Type: kind, Quantity: domain.D(qty)}
}
func submit(t *testing.T, e *engine.Engine, id domain.Identity, accountID string, r domain.OrderRequest) domain.Order {
	t.Helper()
	o, err := e.Submit(ctx, id, accountID, r)
	if err != nil {
		t.Fatal(err)
	}
	return o
}
func tick(t *testing.T, e *engine.Engine, symbol, bid, ask string) {
	t.Helper()
	s := e.Snapshot()
	q := s.Quotes[domain.MarketKey("tenant-a", symbol)]
	q.Bid = domain.D(bid)
	q.Ask = domain.D(ask)
	q.Sequence++
	q.Timestamp = time.Now().UTC()
	if err := e.Tick(ctx, "tenant-a", q); err != nil {
		t.Fatal(err)
	}
}
func assertDecimal(t *testing.T, got decimal.Decimal, want string) {
	t.Helper()
	if !got.Equal(domain.D(want)) {
		t.Fatalf("got %s, want %s", got, want)
	}
}
func assertCode(t *testing.T, err error, code string) {
	t.Helper()
	var failure *domain.Error
	if !errors.As(err, &failure) || failure.Code != code {
		t.Fatalf("got %v, want error %s", err, code)
	}
}

func TestMarketExecutionAndHedging(t *testing.T) {
	e, id, a := fixture(t)
	buy := submit(t, e, id, a, request("buy", "BUY", "MARKET", "1"))
	sell := submit(t, e, id, a, request("sell", "SELL", "MARKET", "1"))
	s := e.Snapshot()
	if buy.Status != "FILLED" || sell.Status != "FILLED" || len(s.Positions) != 2 {
		t.Fatal("independent hedging positions must open")
	}
	assertDecimal(t, s.Positions[buy.PositionID].OpenPrice, "1.08462")
	assertDecimal(t, s.Positions[sell.PositionID].OpenPrice, "1.0845")
	for _, fill := range s.Fills {
		if fill.ExecutionMode != "SIMULATED" || !strings.HasPrefix(fill.ExecutionReason, "SIMULATED_") {
			t.Fatal("execution must be explicitly simulated")
		}
		if fill.Side == "BUY" {
			assertDecimal(t, fill.Price, "1.08462")
		} else {
			assertDecimal(t, fill.Price, "1.0845")
		}
	}
	assertDecimal(t, s.Accounts[a].UnrealizedPnL, "-24")
}

func TestPendingTriggerConditions(t *testing.T) {
	cases := []struct{ name, side, kind, entry, nonBid, nonAsk, triggerBid, triggerAsk string }{
		{"buy limit", "BUY", "LIMIT", "1.08400", "1.08395", "1.08407", "1.08388", "1.08400"},
		{"sell limit", "SELL", "LIMIT", "1.08500", "1.08499", "1.08511", "1.08500", "1.08512"},
		{"buy stop", "BUY", "STOP", "1.08500", "1.08487", "1.08499", "1.08488", "1.08500"},
		{"sell stop", "SELL", "STOP", "1.08400", "1.08401", "1.08413", "1.08400", "1.08412"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, id, a := fixture(t)
			r := request(tc.name, tc.side, tc.kind, "0.1")
			if tc.kind == "LIMIT" {
				r.LimitPrice = ptr(tc.entry)
			} else {
				r.StopPrice = ptr(tc.entry)
			}
			o := submit(t, e, id, a, r)
			if o.Status != "ACCEPTED" {
				t.Fatal(o.Status)
			}
			tick(t, e, "EURUSD", tc.nonBid, tc.nonAsk)
			if e.Snapshot().Orders[o.ID].Status != "ACCEPTED" {
				t.Fatal("triggered before executable side crossed")
			}
			tick(t, e, "EURUSD", tc.triggerBid, tc.triggerAsk)
			s := e.Snapshot()
			if s.Orders[o.ID].Status != "FILLED" || len(s.Positions) != 1 {
				t.Fatal("did not fill at boundary")
			}
		})
	}
}

func TestProtectionTriggersUseCloseSide(t *testing.T) {
	cases := []struct{ name, side, sl, tp, bid, ask, reason string }{
		{"buy stop loss", "BUY", "1.08400", "", "1.08400", "1.08412", "STOP_LOSS"},
		{"buy take profit", "BUY", "", "1.08500", "1.08500", "1.08512", "TAKE_PROFIT"},
		{"sell stop loss", "SELL", "1.08500", "", "1.08488", "1.08500", "STOP_LOSS"},
		{"sell take profit", "SELL", "", "1.08400", "1.08388", "1.08400", "TAKE_PROFIT"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, id, a := fixture(t)
			r := request(tc.name, tc.side, "MARKET", "1")
			if tc.sl != "" {
				r.StopLoss = ptr(tc.sl)
			}
			if tc.tp != "" {
				r.TakeProfit = ptr(tc.tp)
			}
			o := submit(t, e, id, a, r)
			tick(t, e, "EURUSD", tc.bid, tc.ask)
			s := e.Snapshot()
			if s.Positions[o.PositionID].Status != "CLOSED" {
				t.Fatal("position protection did not close")
			}
			found := false
			for _, f := range s.Fills {
				if f.ExecutionReason == "SIMULATED_"+tc.reason {
					found = true
				}
			}
			if !found {
				t.Fatal("missing protective close reason")
			}
			if len(s.Transactions) != 2 {
				t.Fatal("realized P&L missing from immutable ledger")
			}
		})
	}
}

func TestPnLPartialCloseAndLedger(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("open", "BUY", "MARKET", "1"))
	tick(t, e, "EURUSD", "1.08562", "1.08574")
	s := e.Snapshot()
	assertDecimal(t, s.Positions[o.PositionID].UnrealizedPnL, "100")
	assertDecimal(t, s.Accounts[a].Equity, "100100")
	p, err := e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "partial", Quantity: ptr("0.4")})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.Quantity, "0.6")
	assertDecimal(t, p.RealizedPnL, "40")
	assertDecimal(t, p.UnrealizedPnL, "60")
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, "100040")
	p, err = e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "final"})
	if err != nil {
		t.Fatal(err)
	}
	if p.Status != "CLOSED" {
		t.Fatal(p.Status)
	}
	s = e.Snapshot()
	assertDecimal(t, s.Accounts[a].Balance, "100100")
	assertDecimal(t, s.Accounts[a].MarginUsed, "0")
	if len(s.Transactions) != 3 {
		t.Fatal("expected initial balance and two realized ledger entries")
	}
	for _, entry := range s.Transactions {
		if entry.Type == "REALIZED_PNL" && entry.PositionID != p.ID {
			t.Fatal("missing ledger position link")
		}
	}
}

func TestMarginAndInsufficientMarginAudited(t *testing.T) {
	e, id, a := fixture(t)
	preview, err := e.Preview(ctx, id, a, "EURUSD", "BUY", "1")
	if err != nil {
		t.Fatal(err)
	}
	if preview != "1084.62" {
		t.Fatal(preview)
	}
	o, err := e.Submit(ctx, id, a, request("too-large", "BUY", "MARKET", "100"))
	assertCode(t, err, "INSUFFICIENT_MARGIN")
	if o.Status != "REJECTED" {
		t.Fatal(o.Status)
	}
	s := e.Snapshot()
	if len(s.Positions) != 0 || len(s.Fills) != 0 {
		t.Fatal("risk rejection must not fill")
	}
	if s.Orders[o.ID].RejectCode != "INSUFFICIENT_MARGIN" {
		t.Fatal("rejection not persisted")
	}
	last := s.Events[len(s.Events)-1]
	if last.Type != "ORDER_REJECTED" {
		t.Fatal("rejection not audited")
	}
	_, err = e.Submit(ctx, id, a, request("too-large", "BUY", "MARKET", "100"))
	assertCode(t, err, "INSUFFICIENT_MARGIN")
	if len(e.Snapshot().Orders) != 1 {
		t.Fatal("replayed rejection created another order")
	}
}

func TestPendingRiskRecheckedAtTrigger(t *testing.T) {
	e, id, a := fixture(t)
	pending := request("pending", "BUY", "STOP", "60")
	pending.StopPrice = ptr("1.08500")
	o := submit(t, e, id, a, pending)
	submit(t, e, id, a, request("consume-margin", "BUY", "MARKET", "60"))
	tick(t, e, "EURUSD", "1.08488", "1.08500")
	if got := e.Snapshot().Orders[o.ID]; got.Status != "REJECTED" || got.RejectCode != "INSUFFICIENT_MARGIN" {
		t.Fatalf("pending risk not rechecked: %+v", got)
	}
}

func TestIdempotencyAndRestart(t *testing.T) {
	e, id, a := fixture(t)
	r := request("same-key", "BUY", "MARKET", "1")
	first := submit(t, e, id, a, r)
	second := submit(t, e, id, a, r)
	if first.ID != second.ID || len(e.Snapshot().Positions) != 1 {
		t.Fatal("duplicate position")
	}
	r.Quantity = domain.D("2")
	_, err := e.Submit(ctx, id, a, r)
	assertCode(t, err, "IDEMPOTENCY_CONFLICT")
	closeReq := domain.CloseRequest{ClientOrderID: "close-once", Quantity: ptr("0.4")}
	closed, err := e.Close(ctx, id, a, first.PositionID, closeReq)
	if err != nil {
		t.Fatal(err)
	}
	restored := engine.New(e.Snapshot(), nil)
	replayed, err := restored.Close(ctx, id, a, first.PositionID, closeReq)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, replayed.Quantity, closed.Quantity.String())
	if len(restored.Snapshot().Fills) != 2 {
		t.Fatal("replayed partial close filled twice")
	}
	closeReq.Quantity = ptr("0.2")
	_, err = restored.Close(ctx, id, a, first.PositionID, closeReq)
	assertCode(t, err, "IDEMPOTENCY_CONFLICT")
}

func TestOwnershipAndTenantIsolation(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("open", "BUY", "MARKET", "1"))
	for _, intruder := range []domain.Identity{{TenantID: id.TenantID, UserID: "another-user", Role: "ADMIN"}, {TenantID: "tenant-b", UserID: id.UserID, Role: "OWNER"}} {
		_, err := e.Submit(ctx, intruder, a, request("attack", "BUY", "MARKET", "1"))
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.Close(ctx, intruder, a, o.PositionID, domain.CloseRequest{ClientOrderID: "attack-close"})
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.Cancel(ctx, intruder, a, o.ID)
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.SetProtection(ctx, intruder, a, o.PositionID, domain.ProtectionRequest{})
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
		_, err = e.Preview(ctx, intruder, a, "EURUSD", "BUY", "1")
		assertCode(t, err, "ACCOUNT_NOT_FOUND")
	}
	if len(e.Snapshot().Positions) != 1 {
		t.Fatal("ownership attack mutated state")
	}
}

func TestPersistenceFailureRollsBackAndDoesNotPublish(t *testing.T) {
	s := domain.Seed("tenant-a", "user-a")
	var a string
	for key := range s.Accounts {
		a = key
	}
	published := 0
	e := engine.New(s, func(context.Context, domain.State) error { return errors.New("database unavailable") })
	e.SetPublisher(func(domain.Event) { published++ })
	_, err := e.Submit(ctx, domain.Identity{TenantID: "tenant-a", UserID: "user-a"}, a, request("fail", "BUY", "MARKET", "1"))
	assertCode(t, err, "PERSISTENCE_FAILED")
	snapshot := e.Snapshot()
	if len(snapshot.Orders) != 0 || len(snapshot.Fills) != 0 || len(snapshot.Positions) != 0 || len(snapshot.Events) != 0 || published != 0 {
		t.Fatal("failed transaction escaped")
	}
}

func TestConcurrentReplaySingleFillAndOrderedEvents(t *testing.T) {
	e, id, a := fixture(t)
	var sequence uint64
	var sequenceErr bool
	e.SetPublisher(func(event domain.Event) {
		if event.Sequence <= sequence {
			sequenceErr = true
		}
		sequence = event.Sequence
	})
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := e.Submit(ctx, id, a, request("concurrent", "BUY", "MARKET", "0.1"))
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(e.Snapshot().Fills) != 1 || sequenceErr {
		t.Fatal("concurrent replay or publication order failed")
	}
}

func TestMalformedQuotes(t *testing.T) {
	for _, name := range []string{"crossed", "zero", "replayed", "stale", "future", "jump", "spread", "off-tick", "tenant"} {
		t.Run(name, func(t *testing.T) {
			e, _, _ := fixture(t)
			s := e.Snapshot()
			q := s.Quotes[domain.MarketKey("tenant-a", "EURUSD")]
			q.Sequence++
			q.Timestamp = time.Now().UTC()
			switch name {
			case "crossed":
				q.Ask = q.Bid.Sub(domain.D("0.1"))
			case "zero":
				q.Bid = decimal.Zero
			case "replayed":
				q.Sequence--
			case "stale":
				q.Timestamp = q.Timestamp.Add(-time.Minute)
			case "future":
				q.Timestamp = q.Timestamp.Add(time.Minute)
			case "jump":
				q.Bid = domain.D("2")
				q.Ask = domain.D("2.001")
			case "spread":
				q.Ask = domain.D("1.2")
			case "off-tick":
				q.Bid = domain.D("1.084501")
			case "tenant":
				q.TenantID = "tenant-b"
			}
			if err := e.Tick(ctx, "tenant-a", q); err == nil {
				t.Fatal("malformed quote accepted")
			}
			if len(e.Snapshot().Events) != 0 {
				t.Fatal("invalid quote altered audit")
			}
		})
	}
}

func TestProtectionEditingCancelAndPartialValidation(t *testing.T) {
	e, id, a := fixture(t)
	o := submit(t, e, id, a, request("open", "BUY", "MARKET", "0.1"))
	_, err := e.SetProtection(ctx, id, a, o.PositionID, domain.ProtectionRequest{StopLoss: ptr("1.09000")})
	assertCode(t, err, "INVALID_STOP_LOSS")
	p, err := e.SetProtection(ctx, id, a, o.PositionID, domain.ProtectionRequest{StopLoss: ptr("1.08400"), TakeProfit: ptr("1.08500")})
	if err != nil || p.StopLoss == nil || p.TakeProfit == nil {
		t.Fatal("protection edit failed", err)
	}
	_, err = e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "overclose", Quantity: ptr("0.2")})
	assertCode(t, err, "INVALID_QUANTITY")
	r := request("pending", "BUY", "LIMIT", "0.1")
	r.LimitPrice = ptr("1.08400")
	pending := submit(t, e, id, a, r)
	cancelled, err := e.Cancel(ctx, id, a, pending.ID)
	if err != nil || cancelled.Status != "CANCELLED" {
		t.Fatal("cancel failed", err)
	}
	_, err = e.Cancel(ctx, id, a, pending.ID)
	if err != nil {
		t.Fatal("cancel replay not safe", err)
	}
	tick(t, e, "EURUSD", "1.08388", "1.08400")
	if e.Snapshot().Orders[pending.ID].Status != "CANCELLED" {
		t.Fatal("cancelled order executed")
	}
}

func TestUSDJPYConversion(t *testing.T) {
	e, id, a := fixture(t)
	r := request("jpy", "BUY", "MARKET", "1")
	r.Symbol = "USDJPY"
	o := submit(t, e, id, a, r)
	tick(t, e, "USDJPY", "150.000", "150.014")
	s := e.Snapshot()
	expected := domain.D("13600").DivRound(domain.D("150.014"), 12)
	assertDecimal(t, s.Positions[o.PositionID].UnrealizedPnL, expected.String())
	p, err := e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "jpy-close"})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.RealizedPnL, expected.String())
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, domain.D("100000").Add(expected).String())
}

func TestDisabledModesAndQuoteStaleness(t *testing.T) {
	for _, field := range []string{"live", "netting", "suspended", "stale"} {
		t.Run(field, func(t *testing.T) {
			e, id, a := fixture(t)
			s := e.Snapshot()
			account := s.Accounts[a]
			code := ""
			switch field {
			case "live":
				account.Mode = "BROKER_LIVE_INTERNALIZED"
				code = "ACCOUNT_MODE_DISABLED"
			case "netting":
				account.PositionMode = "NETTING"
				code = "POSITION_MODE_DISABLED"
			case "suspended":
				account.Status = "SUSPENDED"
				code = "ACCOUNT_NOT_TRADABLE"
			case "stale":
				q := s.Quotes[domain.MarketKey(id.TenantID, "EURUSD")]
				q.Timestamp = time.Now().Add(-time.Minute)
				s.Quotes[domain.MarketKey(id.TenantID, "EURUSD")] = q
				code = "STALE_QUOTE"
			}
			s.Accounts[a] = account
			e = engine.New(s, nil)
			_, err := e.Submit(ctx, id, a, request("blocked", "BUY", "MARKET", "1"))
			assertCode(t, err, code)
		})
	}
}

func TestLatencyPolicyIsCancellableAndAudited(t *testing.T) {
	e, id, a := fixture(t)
	if err := e.SetExecutionProfile(execution.Profile{ID: "fixed-test", LatencyMode: "FIXED", BaseLatencyMS: 2, SlippageMode: "NONE"}); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	submit(t, e, id, a, request("latency", "BUY", "MARKET", "0.01"))
	if time.Since(started) < 2*time.Millisecond {
		t.Fatal("fixed latency was not applied")
	}
	for _, f := range e.Snapshot().Fills {
		if f.ExecutionLatencyMS != 2 || f.ExecutionProfileID != "fixed-test" || f.LatencyMode != "FIXED" || f.SlippageMode != "NONE" {
			t.Fatal("execution policy was not recorded")
		}
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err := e.Submit(cancelled, id, a, request("cancelled", "BUY", "MARKET", "0.01"))
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if len(e.Snapshot().Fills) != 1 {
		t.Fatal("cancelled execution filled")
	}
}

func TestReturnedValuesDoNotAliasAuthoritativeState(t *testing.T) {
	e, id, a := fixture(t)
	sl := ptr("1.08400")
	r := request("protected", "BUY", "MARKET", "0.1")
	r.StopLoss = sl
	o := submit(t, e, id, a, r)
	*sl = domain.D("1")
	*o.StopLoss = domain.D("2")
	snapshot := e.Snapshot()
	p := snapshot.Positions[o.PositionID]
	*p.StopLoss = domain.D("3")
	snapshot.Events[0].Payload[0] = 'x'
	current := e.Snapshot()
	assertDecimal(t, *current.Orders[o.ID].StopLoss, "1.08400")
	assertDecimal(t, *current.Positions[o.PositionID].StopLoss, "1.08400")
	if current.Events[0].Payload[0] == 'x' {
		t.Fatal("snapshot mutated append-only audit")
	}
}

func TestExtremeDecimalInputFailsBeforeExpansion(t *testing.T) {
	e, id, a := fixture(t)
	r := request("extreme", "BUY", "MARKET", "1")
	r.Quantity = decimal.New(1, 1000000)
	_, err := e.Submit(ctx, id, a, r)
	assertCode(t, err, "INVALID_QUANTITY")
}

func TestInitialProtectionRejectsInsideSpread(t *testing.T) {
	for _, side := range []string{"BUY", "SELL"} {
		t.Run(side, func(t *testing.T) {
			e, id, a := fixture(t)
			r := request("inside-spread", side, "MARKET", "0.1")
			r.StopLoss = ptr("1.08455")
			_, err := e.Submit(ctx, id, a, r)
			assertCode(t, err, "INVALID_STOP_LOSS")
			if len(e.Snapshot().Fills) != 0 {
				t.Fatal("invalid initial protection filled")
			}
		})
	}
}

func TestGapAcrossPendingProtectionClosesAtSameSnapshot(t *testing.T) {
	e, id, a := fixture(t)
	r := request("gap", "BUY", "LIMIT", "1")
	r.LimitPrice = ptr("1.08400")
	r.StopLoss = ptr("1.08390")
	o := submit(t, e, id, a, r)
	tick(t, e, "EURUSD", "1.08350", "1.08362")
	s := e.Snapshot()
	o = s.Orders[o.ID]
	p := s.Positions[o.PositionID]
	if p.Status != "CLOSED" || len(s.Fills) != 2 {
		t.Fatal("gap-breached protection left an open position")
	}
	assertDecimal(t, p.OpenPrice, "1.08362")
	assertDecimal(t, p.RealizedPnL, "-12")
}

func TestExactMarginBoundary(t *testing.T) {
	for _, balance := range []string{"1096.62", "1096.619999999999"} {
		t.Run(balance, func(t *testing.T) {
			e, id, a := fixture(t)
			s := e.Snapshot()
			account := s.Accounts[a]
			account.Balance = domain.D(balance)
			account.Equity = account.Balance
			account.MarginFree = account.Balance
			s.Accounts[a] = account
			e = engine.New(s, nil)
			_, err := e.Submit(ctx, id, a, request("boundary", "BUY", "MARKET", "1"))
			if balance == "1096.62" {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				assertCode(t, err, "INSUFFICIENT_MARGIN")
			}
		})
	}
}
