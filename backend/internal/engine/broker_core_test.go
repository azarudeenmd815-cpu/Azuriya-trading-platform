package engine_test

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"sync"
	"testing"
	"time"

	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/engine"
)

// Persisted configuration exercises the same additive snapshot boundary as a
// legacy database upgrade, without a special production test endpoint.
func brokerFixture(t *testing.T, commissionMode, commissionAmount, session string, stopOut bool) (*engine.Engine, domain.Identity, string) {
	t.Helper()
	state := domain.Seed("tenant-a", "user-a")
	var accountID string
	for key := range state.Accounts {
		accountID = key
	}
	raw, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	var stored map[string]any
	if err = json.Unmarshal(raw, &stored); err != nil {
		t.Fatal(err)
	}
	stored["broker"] = map[string]any{
		"profiles": map[string]any{
			"fee":   map[string]any{"id": "fee", "tenant_id": "tenant-a", "kind": "COMMISSION", "name": "Test fee", "status": "ACTIVE", "revision": 1, "commission": map[string]any{"mode": commissionMode, "amount": commissionAmount, "currency": "USD"}},
			"hours": map[string]any{"id": "hours", "tenant_id": "tenant-a", "kind": "SESSION", "name": "Test hours", "status": "ACTIVE", "revision": 1, "session": map[string]any{"timezone": "UTC", "default_status": session, "windows": []any{}}},
			"risk":  map[string]any{"id": "risk", "tenant_id": "tenant-a", "kind": "MARGIN", "name": "Test risk", "status": "ACTIVE", "revision": 1, "margin": map[string]any{"margin_call_level": "100", "stop_out_level": "50", "stop_out_enabled": stopOut}},
		},
		"groups":   map[string]any{"test-group": map[string]any{"id": "test-group", "tenant_id": "tenant-a", "name": "Test group", "status": "ACTIVE", "revision": 1, "commission_plan_id": "fee", "trading_session_profile_id": "hours", "margin_profile_id": "risk"}},
		"settings": map[string]any{"tenant-a": map[string]any{"tenant_id": "tenant-a", "broker_name": "Test broker", "base_currency": "USD", "default_trading_group_id": "test-group", "timezone": "UTC", "trading_enabled": true, "revision": 1}},
	}
	raw, err = json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	return engine.New(state, nil), domain.Identity{TenantID: "tenant-a", UserID: "user-a", Role: "TRADER"}, accountID
}

func TestBrokerPerSideCommissionIsAtomicWithOpeningAndPartialClose(t *testing.T) {
	e, id, a := brokerFixture(t, "PER_LOT_PER_SIDE", "3.5", "OPEN", false)
	o := submit(t, e, id, a, request("fee-open", "BUY", "MARKET", "1"))
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, "99996.5")
	p, err := e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "fee-partial", Quantity: ptr("0.4")})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, p.RealizedPnL, "-4.8")
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, "99990.3")
	count := 0
	for _, tx := range e.Snapshot().Transactions {
		if tx.Type == "COMMISSION" {
			count++
			if tx.PositionID != p.ID {
				t.Fatal("fee missing position link")
			}
		}
	}
	if count != 2 {
		t.Fatalf("commission ledger count %d", count)
	}
}

func TestBrokerRoundTurnCommissionDoesNotChargeClosingAgain(t *testing.T) {
	e, id, a := brokerFixture(t, "PER_LOT_ROUND_TURN", "7", "OPEN", false)
	o := submit(t, e, id, a, request("round-open", "BUY", "MARKET", "1"))
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, "99993")
	_, err := e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "round-close"})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, "99981")
}

func TestBrokerClosedSessionPreventsOpening(t *testing.T) {
	e, id, a := brokerFixture(t, "NONE", "0", "CLOSED", false)
	_, err := e.Submit(ctx, id, a, request("closed-session", "BUY", "MARKET", "1"))
	assertCode(t, err, "SESSION_CLOSED")
	if len(e.Snapshot().Fills) != 0 {
		t.Fatal("closed session executed")
	}
}

func TestBrokerEnabledStopOutLiquidatesAfterExactQuoteLoss(t *testing.T) {
	e, id, a := brokerFixture(t, "NONE", "0", "OPEN", true)
	s := e.Snapshot()
	account := s.Accounts[a]
	account.Balance = domain.D("2000")
	account.Equity = account.Balance
	account.MarginFree = account.Balance
	s.Accounts[a] = account
	e = engine.New(s, nil)
	o := submit(t, e, id, a, request("stop-out-open", "BUY", "MARKET", "1"))
	tick(t, e, "EURUSD", "1.06500", "1.06512")
	s = e.Snapshot()
	if s.Positions[o.PositionID].Status != "CLOSED" {
		t.Fatal("stop-out left insolvent exposure open")
	}
	assertDecimal(t, s.Accounts[a].Balance, "38")
	found := false
	for _, fill := range s.Fills {
		if fill.ExecutionReason == "SIMULATED_STOP_OUT" {
			found = true
		}
	}
	if !found {
		t.Fatal("stop-out reason missing")
	}
}

func TestBrokerAccountQuotesMatchPreviewAndExecutableFill(t *testing.T) {
	e, id, a := brokerFixture(t, "NONE", "0", "OPEN", false)
	s := e.Snapshot()
	price := domain.PricingPolicy{Unit: "POINTS", AskMarkup: domain.D("5"), BidMarkup: domain.D("2")}
	s.Broker.Profiles["marked"] = domain.BrokerProfile{ID: "marked", TenantID: id.TenantID, Kind: "PRICING", Name: "Marked", Status: "ACTIVE", Revision: 3, Pricing: &price}
	g := s.Broker.Groups["test-group"]
	g.ID = "marked-group"
	g.PricingProfileID = "marked"
	s.Broker.Groups[g.ID] = g
	a2 := domain.NewAccount(id.TenantID, id.UserID, "BROKER_DEMO")
	a2.TradingGroupID = g.ID
	s.Accounts[a2.ID] = a2
	e = engine.New(s, nil)
	quotes, err := e.AccountQuotes(ctx, id, a2.ID)
	if err != nil {
		t.Fatal(err)
	}
	var quoted domain.Quote
	for _, q := range quotes {
		if q.Symbol == "EURUSD" {
			quoted = q
		}
	}
	assertDecimal(t, quoted.Ask, "1.08467")
	assertDecimal(t, quoted.Bid, "1.08448")
	defaultQuotes, err := e.AccountQuotes(ctx, id, a)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range defaultQuotes {
		if q.Symbol == "EURUSD" {
			assertDecimal(t, q.Ask, "1.08462")
		}
	}
	r := domain.TradeRequest{OrderRequest: request("marked-open", "BUY", "MARKET", "1")}
	preview, err := e.PreviewOrder(ctx, id, a2.ID, r)
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.EstimatedEntry, quoted.Ask.String())
	o := submit(t, e, id, a2.ID, r.OrderRequest)
	assertDecimal(t, e.Snapshot().Positions[o.PositionID].OpenPrice, quoted.Ask.String())
	for _, f := range e.Snapshot().Fills {
		if f.AccountID == a2.ID && f.PricingProfileID != "marked" {
			t.Fatal("fill policy provenance missing")
		}
	}
	_, err = e.AccountQuotes(ctx, domain.Identity{TenantID: id.TenantID, UserID: "other"}, a2.ID)
	assertCode(t, err, "ACCOUNT_NOT_FOUND")
}
func TestBrokerExistingPositionUsesOpeningCommissionAndContract(t *testing.T) {
	e, id, a := brokerFixture(t, "PER_LOT_PER_SIDE", "3.5", "OPEN", false)
	o := submit(t, e, id, a, request("snapshot-open", "BUY", "MARKET", "1"))
	s := e.Snapshot()
	p := s.Broker.Profiles["fee"]
	p.Commission.Amount = domain.D("99")
	s.Broker.Profiles[p.ID] = p
	i := s.Instruments[domain.MarketKey(id.TenantID, "EURUSD")]
	i.ContractSize = domain.D("200000")
	s.Instruments[domain.MarketKey(id.TenantID, i.Symbol)] = i
	e = engine.New(s, nil)
	preview, err := e.PreviewClose(ctx, id, a, o.PositionID, domain.CloseRequest{Quantity: ptr("0.4")})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, preview.EstimatedCommission, "1.4")
	assertDecimal(t, preview.EstimatedRealizedPnL, "-4.8")
	_, err = e.Close(ctx, id, a, o.PositionID, domain.CloseRequest{ClientOrderID: "snapshot-close", Quantity: ptr("0.4")})
	if err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, "99990.3")
}
func TestBrokerOpeningCommissionEnforcedAtExactFundsBoundary(t *testing.T) {
	for _, balance := range []string{"1100.12", "1100.119999999999"} {
		t.Run(balance, func(t *testing.T) {
			e, id, a := brokerFixture(t, "PER_LOT_PER_SIDE", "3.5", "OPEN", false)
			s := e.Snapshot()
			v := s.Accounts[a]
			v.Balance = domain.D(balance)
			v.Equity = v.Balance
			v.MarginFree = v.Balance
			s.Accounts[a] = v
			e = engine.New(s, nil)
			o, err := e.Submit(ctx, id, a, request("fee-boundary", "BUY", "MARKET", "1"))
			if balance == "1100.12" {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				assertCode(t, err, "INSUFFICIENT_MARGIN")
				if o.Status != "REJECTED" || len(e.Snapshot().Fills) > 0 {
					t.Fatal("fee risk rejection mutated money")
				}
			}
		})
	}
}
func TestBrokerSessionChangeDefersPendingAndAllowsCloseOnlyReduction(t *testing.T) {
	e, id, a := brokerFixture(t, "NONE", "0", "OPEN", false)
	r := request("session-pending", "BUY", "LIMIT", "0.1")
	r.LimitPrice = ptr("1.08400")
	o := submit(t, e, id, a, r)
	opened := submit(t, e, id, a, request("session-open", "BUY", "MARKET", "0.1"))
	s := e.Snapshot()
	p := s.Broker.Profiles["hours"]
	p.Session.DefaultStatus = "CLOSED"
	s.Broker.Profiles[p.ID] = p
	e = engine.New(s, nil)
	tick(t, e, "EURUSD", "1.08388", "1.08400")
	if e.Snapshot().Orders[o.ID].Status != "ACCEPTED" {
		t.Fatal("closed session rejected or triggered queued order")
	}
	_, err := e.PreviewClose(ctx, id, a, opened.PositionID, domain.CloseRequest{})
	assertCode(t, err, "SESSION_CLOSED")
	s = e.Snapshot()
	p = s.Broker.Profiles["hours"]
	p.Session.DefaultStatus = "CLOSE_ONLY"
	s.Broker.Profiles[p.ID] = p
	e = engine.New(s, nil)
	_, err = e.Submit(ctx, id, a, request("session-block-open", "BUY", "MARKET", "0.1"))
	assertCode(t, err, "SESSION_CLOSE_ONLY")
	_, err = e.Close(ctx, id, a, opened.PositionID, domain.CloseRequest{ClientOrderID: "close-only"})
	if err != nil {
		t.Fatal(err)
	}
}
func TestBrokerSwapTripleDayConcurrentReplayAndRestart(t *testing.T) {
	e, id, a := brokerFixture(t, "NONE", "0", "OPEN", false)
	o := submit(t, e, id, a, request("swap-open", "BUY", "MARKET", "1"))
	s := e.Snapshot()
	p := s.Positions[o.PositionID]
	p.OpenedAt = time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC)
	s.Positions[p.ID] = p
	policy := domain.SwapPolicy{Enabled: true, LongRate: domain.D("-2"), ShortRate: domain.D("1"), Currency: "USD", Timezone: "UTC", RolloverTime: "00:00", TripleSwapDay: 3, CatchUpDays: 1}
	s.Broker.Profiles["swap"] = domain.BrokerProfile{ID: "swap", TenantID: id.TenantID, Kind: "SWAP", Name: "Swap", Status: "ACTIVE", Revision: 4, Swap: &policy}
	g := s.Broker.Groups["test-group"]
	g.SwapPlanID = "swap"
	s.Broker.Groups[g.ID] = g
	e = engine.New(s, nil)
	at := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC)
	var wg sync.WaitGroup
	errs := make(chan error, 12)
	for n := 0; n < 12; n++ {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- e.ProcessRollover(ctx, at) }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	assertDecimal(t, e.Snapshot().Accounts[a].Balance, "99994")
	assertDecimal(t, e.Snapshot().Positions[p.ID].SwapAccrued, "-6")
	if len(e.Snapshot().Broker.RolloverKeys) != 1 {
		t.Fatal("rollover duplicated checkpoint")
	}
	restored := engine.New(e.Snapshot(), nil)
	if err := restored.ProcessRollover(ctx, at); err != nil {
		t.Fatal(err)
	}
	assertDecimal(t, restored.Snapshot().Accounts[a].Balance, "99994")
	txCount := 0
	for _, tx := range restored.Snapshot().Transactions {
		if tx.Type == "SWAP" {
			txCount++
			if tx.RolloverDate != "2026-09-30" || tx.ProfileID != "swap" {
				t.Fatal("swap provenance missing")
			}
		}
	}
	if txCount != 1 {
		t.Fatal("swap replay duplicated money")
	}
}
func TestBrokerStopOutChoosesLargestLossAndStopsWhenRecovered(t *testing.T) {
	e, id, a := brokerFixture(t, "NONE", "0", "OPEN", true)
	first := submit(t, e, id, a, request("loss-one", "BUY", "MARKET", "1"))
	tick(t, e, "EURUSD", "1.08500", "1.08512")
	second := submit(t, e, id, a, request("loss-two", "BUY", "MARKET", "2"))
	s := e.Snapshot()
	v := s.Accounts[a]
	v.Balance = domain.D("2500")
	s.Accounts[a] = v
	e = engine.New(s, nil)
	tick(t, e, "EURUSD", "1.08000", "1.08012")
	s = e.Snapshot()
	if s.Positions[second.PositionID].Status != "CLOSED" || s.Positions[first.PositionID].Status != "OPEN" {
		t.Fatal("stop-out order or termination is wrong")
	}
	assertDecimal(t, s.Accounts[a].Balance, "1476")
	if !s.Accounts[a].MarginLevel.GreaterThan(domain.D("50")) {
		t.Fatal("margin remained at stop-out")
	}
}
func TestBrokerStopOutTieUsesStableIDAndPersistenceRollback(t *testing.T) {
	e, id, a := brokerFixture(t, "NONE", "0", "OPEN", true)
	one := submit(t, e, id, a, request("tie-one", "BUY", "MARKET", "1"))
	two := submit(t, e, id, a, request("tie-two", "BUY", "MARKET", "1"))
	s := e.Snapshot()
	at := time.Now().Add(-time.Hour)
	for _, oid := range []domain.Order{one, two} {
		p := s.Positions[oid.PositionID]
		p.OpenedAt = at
		s.Positions[p.ID] = p
	}
	v := s.Accounts[a]
	v.Balance = domain.D("1500")
	s.Accounts[a] = v
	failed := engine.New(s, func(context.Context, domain.State) error { return errors.New("disk unavailable") })
	published := 0
	failed.SetPublisher(func(domain.Event) { published++ })
	q := s.Quotes[domain.MarketKey(id.TenantID, "EURUSD")]
	q.Bid = domain.D("1.08000")
	q.Ask = domain.D("1.08012")
	q.Sequence++
	q.Timestamp = time.Now().UTC()
	err := failed.Tick(ctx, id.TenantID, q)
	assertCode(t, err, "PERSISTENCE_FAILED")
	if len(failed.Snapshot().Fills) != 2 || published != 0 {
		t.Fatal("failed liquidation escaped transaction")
	}
	e = engine.New(s, nil)
	if err = e.Tick(ctx, id.TenantID, q); err != nil {
		t.Fatal(err)
	}
	ids := []string{one.PositionID, two.PositionID}
	sort.Strings(ids)
	selected := ""
	for _, event := range e.Snapshot().Events {
		if event.Type == "STOP_OUT_POSITION_SELECTED" {
			selected = event.AggregateID
			break
		}
	}
	if selected != ids[0] {
		t.Fatal("tie selection not stable")
	}
}

func TestBrokerEditedDefaultAndSymbolExecutionLatencyApplied(t *testing.T) {
 for _,symbolOverride:=range []bool{false,true}{t.Run(map[bool]string{false:"edited-default",true:"instrument-override"}[symbolOverride],func(t *testing.T){e,id,a:=brokerFixture(t,"NONE","0","OPEN",false);s:=e.Snapshot();profileID:="default:"+id.TenantID+":EXECUTION";if symbolOverride{profileID="symbol-execution"};policy:=domain.ExecutionPolicy{LatencyMode:"FIXED",BaseLatencyMS:3,SlippageMode:"NONE"};s.Broker.Profiles[profileID]=domain.BrokerProfile{ID:profileID,TenantID:id.TenantID,Name:"Latency",Kind:"EXECUTION",Status:"ACTIVE",Revision:2,Execution:&policy};if symbolOverride{i:=s.Instruments[domain.MarketKey(id.TenantID,"EURUSD")];i.ProfileOverrides.ExecutionProfileID=profileID;s.Instruments[domain.MarketKey(id.TenantID,i.Symbol)]=i};e=engine.New(s,nil);started:=time.Now();submit(t,e,id,a,request("broker-latency","BUY","MARKET","0.01"));if time.Since(started)<3*time.Millisecond{t.Fatal("resolved execution latency was not applied")};for _,fill:=range e.Snapshot().Fills{if fill.ExecutionProfileID!=profileID||fill.ExecutionLatencyMS!=3{t.Fatal("resolved execution profile was not recorded")}}})}
}
