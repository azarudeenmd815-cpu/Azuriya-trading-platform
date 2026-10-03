package engine

import (
	"azuriya/backend/internal/domain"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func brokerFixture(t *testing.T) (*Engine, domain.Identity, domain.Account, []BrokerMember) {
	t.Helper()
	id := domain.Identity{UserID: "owner", TenantID: "broker", Role: "OWNER"}
	e := New(domain.EmptyState(), nil)
	a := domain.NewAccount(id.TenantID, id.UserID, "BROKER_DEMO")
	if err := e.AddAccount(context.Background(), a); err != nil {
		t.Fatal(err)
	}
	return e, id, a, []BrokerMember{{ID: id.UserID, TenantID: id.TenantID, Email: "owner@example.test", Status: "ACTIVE", Role: "OWNER"}}
}
func brokerWrite(t *testing.T, e *Engine, id domain.Identity, resource, target, body string, members []BrokerMember) any {
	t.Helper()
	value, err := e.BrokerWrite(context.Background(), id, resource, target, json.RawMessage(body), members)
	if err != nil {
		t.Fatal(err)
	}
	return value
}
func TestBrokerBalanceOperationsAreImmutableIdempotentAndScoped(t *testing.T) {
	e, id, a, members := brokerFixture(t)
	body := `{"type":"CREDIT","amount":"50.00","currency":"USD","reason":"Test credit","reference":"credit-1","client_operation_id":"credit-1"}`
	brokerWrite(t, e, id, "balance-operations", a.ID, body, members)
	brokerWrite(t, e, id, "balance-operations", a.ID, body, members)
	s := e.Snapshot()
	if !s.Accounts[a.ID].Balance.Equal(domain.D("100050")) || len(s.Transactions) != 2 {
		t.Fatal("funds replay duplicated or ledger missing")
	}
	if _, err := e.BrokerWrite(context.Background(), id, "balance-operations", a.ID, json.RawMessage(strings.Replace(body, "50.00", "100051.00", 1)), members); err == nil {
		t.Fatal("different replay payload allowed")
	}
	debit := `{"type":"DEBIT","amount":"100051.00","currency":"USD","reason":"Excess debit","reference":"debit-1","client_operation_id":"debit-1"}`
	if _, err := e.BrokerWrite(context.Background(), id, "balance-operations", a.ID, json.RawMessage(debit), members); err == nil {
		t.Fatal("insufficient debit permitted")
	}
	for _, role := range []string{"TRADER", "SUPPORT"} {
		other := id
		other.Role = role
		if _, err := e.BrokerWrite(context.Background(), other, "balance-operations", a.ID, json.RawMessage(body), members); err == nil {
			t.Fatal("unprivileged funds operation permitted")
		}
	}
	foreign := id
	foreign.TenantID = "foreign"
	if _, err := e.BrokerRead(foreign, "accounts", a.ID, BrokerFilter{}, members); err == nil {
		t.Fatal("foreign account exposed")
	}
}
func TestBrokerProfilesAndGroupsEnforceReferencesAndRevisions(t *testing.T) {
	e, id, _, members := brokerFixture(t)
	value := brokerWrite(t, e, id, "pricing-profiles", "", `{"name":"Raw price","status":"ACTIVE","pricing":{"unit":"POINTS","bid_markup":"2","ask_markup":"3","minimum_spread":"0","maximum_spread":"0"}}`, members)
	p := value.(domain.BrokerProfile)
	group := brokerWrite(t, e, id, "trading-groups", "", `{"name":"Raw","status":"ACTIVE","pricing_profile_id":"`+p.ID+`"}`, members).(domain.TradingGroup)
	if group.PricingProfileID != p.ID {
		t.Fatal("profile reference missing")
	}
	if _, err := e.BrokerWrite(context.Background(), id, "trading-groups", group.ID, json.RawMessage(`{"revision":0,"name":"Stale"}`), members); err == nil {
		t.Fatal("stale change accepted")
	}
	if _, err := e.BrokerWrite(context.Background(), id, "trading-groups", "", json.RawMessage(`{"name":"Foreign ref","status":"ACTIVE","pricing_profile_id":"missing"}`), members); err == nil {
		t.Fatal("missing profile accepted")
	}
	if _, err := e.BrokerWrite(context.Background(), id, "pricing-profiles", "", json.RawMessage(`{"name":"Bad decimal","pricing":{"unit":"PRICE","bid_markup":0.01,"ask_markup":"0","minimum_spread":"0","maximum_spread":"0"}}`), members); err == nil {
		t.Fatal("numeric financial JSON accepted")
	}
}
func TestBrokerAccountsValidateMemberAndCloseLifecycle(t *testing.T) {
	e, id, a, members := brokerFixture(t)
	if _, err := e.BrokerWrite(context.Background(), id, "accounts", "", json.RawMessage(`{"user_id":"outsider","name":"Invalid account","mode":"BROKER_DEMO","currency":"USD","position_mode":"HEDGING","initial_balance":"0","leverage":"100"}`), members); err == nil {
		t.Fatal("nonmember assigned an account")
	}
	created := brokerWrite(t, e, id, "accounts", "", `{"user_id":"owner","name":"Second account","mode":"BROKER_DEMO","currency":"USD","position_mode":"HEDGING","initial_balance":"1000","leverage":"100"}`, members).(domain.Account)
	if created.ID == a.ID || created.AccountNumber == a.AccountNumber || created.AccountNumber == created.ID {
		t.Fatal("account identifiers are not unique")
	}
	o, err := e.Submit(context.Background(), id, a.ID, domain.OrderRequest{ClientOrderID: "open-for-status", Symbol: "EURUSD", Side: "BUY", Type: "MARKET", Quantity: domain.D("1")})
	if err != nil {
		t.Fatal(err)
	}
	brokerWrite(t, e, id, "accounts", a.ID, `{"status":"READ_ONLY","reason":"Read only test"}`, members)
	if _, err = e.Submit(context.Background(), id, a.ID, domain.OrderRequest{ClientOrderID: "blocked-open", Symbol: "EURUSD", Side: "BUY", Type: "MARKET", Quantity: domain.D("1")}); err == nil {
		t.Fatal("read-only opened exposure")
	}
	if _, err = e.BrokerWrite(context.Background(), id, "accounts", a.ID, json.RawMessage(`{"status":"CLOSED"}`), members); err == nil {
		t.Fatal("account closed with exposure")
	}
	if _, err = e.Close(context.Background(), id, a.ID, o.PositionID, domain.CloseRequest{ClientOrderID: "allowed-close"}); err != nil {
		t.Fatal(err)
	}
	brokerWrite(t, e, id, "accounts", a.ID, `{"status":"CLOSED"}`, members)
}
func TestBrokerExposureAndReportsKeepExactScopeAndEscapeFormulaCells(t *testing.T) {
	e, id, a, members := brokerFixture(t)
	for _, r := range []domain.OrderRequest{{ClientOrderID: "long", Symbol: "EURUSD", Side: "BUY", Type: "MARKET", Quantity: domain.D("1")}, {ClientOrderID: "short", Symbol: "EURUSD", Side: "SELL", Type: "MARKET", Quantity: domain.D("2")}} {
		if _, err := e.Submit(context.Background(), id, a.ID, r); err != nil {
			t.Fatal(err)
		}
	}
	value, err := e.BrokerRead(id, "risk/exposure", "", BrokerFilter{}, members)
	if err != nil {
		t.Fatal(err)
	}
	rows := value.([]BrokerExposure)
	if len(rows) != 1 || !rows[0].LongQuantity.Equal(domain.D("1")) || !rows[0].ShortQuantity.Equal(domain.D("2")) || !rows[0].NetQuantity.Equal(domain.D("-1")) || rows[0].Accounts != 1 {
		t.Fatalf("incorrect aggregate %+v", rows)
	}
	brokerWrite(t, e, id, "accounts", a.ID, `{"name":"=HYPERLINK(unsafe)"}`, members)
	report, err := e.BrokerCSV(id, "accounts", BrokerFilter{AccountID: a.ID}, members)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(report), "'=HYPERLINK(unsafe)") {
		t.Fatal("CSV formula was not escaped")
	}
	support := id
	support.Role = "SUPPORT"
	if _, err = e.BrokerCSV(support, "accounts", BrokerFilter{}, members); err == nil {
		t.Fatal("support export permitted")
	}
	s := e.Snapshot()
	found := false
	for _, event := range s.Events {
		if event.AggregateType == "broker_admin" {
			var payload map[string]any
			if json.Unmarshal(event.Payload, &payload) != nil {
				t.Fatal("invalid audit")
			}
			if payload["actor_user_id"] == id.UserID {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("administrative actor audit missing")
	}
}
