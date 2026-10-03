// Package engine coordinates atomic trading transitions across domain services.
package engine

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"sync"
	"time"

	"azuriya/backend/internal/accounts"
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/execution"
	"azuriya/backend/internal/margin"
	"azuriya/backend/internal/marketdata"
	"azuriya/backend/internal/portfolio"
	"azuriya/backend/internal/positions"
	"azuriya/backend/internal/pricing"
	"azuriya/backend/internal/tenancy"
	"github.com/shopspring/decimal"
)

type Engine struct {
	mu        sync.RWMutex
	state     domain.State
	persist   func(context.Context, domain.State) error
	publisher func(domain.Event)
	profile   execution.Profile
	pricing   pricing.Profile
}

func New(state domain.State, persist func(context.Context, domain.State) error) *Engine {
	state = state.Clone()
	broker.Ensure(&state)
	return &Engine{state: state, persist: persist, profile: execution.Default(), pricing: pricing.Default()}
}
func (e *Engine) Snapshot() domain.State { e.mu.RLock(); defer e.mu.RUnlock(); return e.state.Clone() }
func (e *Engine) SetPublisher(p func(domain.Event)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.publisher = p
}

// SetExecutionProfile configures a uniform policy for all users. Configure at startup.
func (e *Engine) SetExecutionProfile(p execution.Profile) error {
	if p.ID == "" || (p.LatencyMode != "NONE" && p.LatencyMode != "FIXED") || p.SlippageMode != "NONE" || p.BaseLatencyMS < 0 || p.BaseLatencyMS > 5000 || (p.LatencyMode == "NONE" && p.BaseLatencyMS != 0) {
		return domain.Err("INVALID_EXECUTION_PROFILE", "Execution requires NONE or FIXED latency up to 5000 ms and no slippage")
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	e.profile = p
	return nil
}

func (e *Engine) waitLatency(ctx context.Context) error {
	e.mu.RLock()
	duration := time.Duration(e.profile.BaseLatencyMS) * time.Millisecond
	e.mu.RUnlock()
	if duration == 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// change persists the full candidate and append-only records before exposing it.
// Event consumers reconnect using canonical REST resync.
func (e *Engine) change(ctx context.Context, fn func(*domain.State) error) error {
	e.mu.Lock()
	if err := ctx.Err(); err != nil {
		e.mu.Unlock()
		return err
	}
	s := e.state.Clone()
	count := len(s.Events)
	if err := fn(&s); err != nil {
		e.mu.Unlock()
		return err
	}
	if e.persist != nil {
		if err := e.persist(ctx, s); err != nil {
			e.mu.Unlock()
			return domain.Err("PERSISTENCE_FAILED", "The trading transition could not be confirmed. Retry with the same client order ID after service recovery")
		}
	}
	publisher := e.publisher
	events := append([]domain.Event(nil), s.Events[count:]...)
	// PostgreSQL retains the complete append-only audit. Keep only the latest
	// window in the aggregate so quote traffic does not make each tick O(uptime).
	if len(s.Events) > domain.RecentEventLimit {
		s.Events = append([]domain.Event(nil), s.Events[len(s.Events)-domain.RecentEventLimit:]...)
	}
	e.state = s
	// Publish in commit order. The bounded publisher must not call back into Engine.
	if publisher != nil {
		for _, event := range events {
			publisher(event)
		}
	}
	e.mu.Unlock()
	return nil
}

func account(s *domain.State, id domain.Identity, accountID string) (domain.Account, error) {
	a, ok := s.Accounts[accountID]
	if !ok {
		return a, domain.Err("ACCOUNT_NOT_FOUND", "Trading account not found")
	}
	if err := tenancy.Owns(id, a); err != nil {
		return a, err
	}
	if err := broker.ClientStatus(s, id); err != nil {
		return a, err
	}
	return a, nil
}
func market(s *domain.State, a domain.Account, symbol string, now time.Time) (domain.Instrument, domain.Quote, error) {
	i, ok := s.Instruments[domain.MarketKey(a.TenantID, symbol)]
	if !ok {
		return i, domain.Quote{}, domain.Err("INSTRUMENT_NOT_FOUND", "Instrument not found")
	}
	q, ok := s.Quotes[domain.MarketKey(a.TenantID, symbol)]
	if !ok {
		return i, q, domain.Err("QUOTE_UNAVAILABLE", "Executable quote is unavailable")
	}
	if err := marketdata.Fresh(q, now); err != nil {
		return i, q, err
	}
	return i, q, nil
}
func conversion(s *domain.State, a domain.Account, now time.Time) portfolio.USDConversion {
	return portfolio.USDConversion{Quotes: s.Quotes, TenantID: a.TenantID, Now: now}
}

func fingerprint(action, resource string, request any) string {
	data, err := json.Marshal(struct {
		Action   string
		Resource string
		Request  any
	}{action, resource, request})
	if err != nil {
		panic(err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
func idemKey(accountID, key string) string { return accountID + ":" + key }
func replay(s *domain.State, key, fp string, result any) (bool, error) {
	record, ok := s.Idempotency[key]
	if !ok {
		return false, nil
	}
	if record.Fingerprint != fp {
		return true, domain.Err("IDEMPOTENCY_CONFLICT", "The client order ID was already used for a different request")
	}
	if err := json.Unmarshal(record.Result, result); err != nil {
		return true, domain.Err("INVALID_STATE", "Stored idempotency result is unreadable")
	}
	if record.ErrorCode != "" {
		return true, domain.Err(record.ErrorCode, record.ErrorMessage)
	}
	return true, nil
}
func remember(s *domain.State, key, fp, id string, result any, err error) {
	data, jsonErr := json.Marshal(result)
	if jsonErr != nil {
		panic(jsonErr)
	}
	record := domain.IdempotencyRecord{Fingerprint: fp, ResourceID: id, Result: data}
	if failure, ok := err.(*domain.Error); ok {
		record.ErrorCode = failure.Code
		record.ErrorMessage = failure.Message
	}
	s.Idempotency[key] = record
}
func sortedKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func (e *Engine) Bootstrap(ctx context.Context, tenantID, userID, mode string) error {
	return e.change(ctx, func(s *domain.State) error {
		for _, a := range s.Accounts {
			if a.TenantID == tenantID && a.UserID == userID {
				return nil
			}
		}
		return addAccount(s, domain.NewAccount(tenantID, userID, mode))
	})
}
func (e *Engine) AddAccount(ctx context.Context, a domain.Account) error {
	return e.change(ctx, func(s *domain.State) error { return addAccount(s, a) })
}
func addAccount(s *domain.State, a domain.Account) error {
	if a.ID == "" || a.TenantID == "" || a.UserID == "" {
		return domain.Err("INVALID_ACCOUNT", "Account, tenant, and owner IDs are required")
	}
	if _, ok := s.Accounts[a.ID]; ok {
		return domain.Err("ACCOUNT_EXISTS", "Account already exists")
	}
	if err := accounts.CanTrade(a, false); err != nil {
		return err
	}
	if a.Balance.IsNegative() || !a.Leverage.IsPositive() {
		return domain.Err("INVALID_ACCOUNT", "Initial balance must be nonnegative and leverage positive")
	}
	a = margin.Totals(a, nil)
	s.Accounts[a.ID] = a
	domain.SeedMarkets(s, a.TenantID)
	broker.Ensure(s)
	s.Transactions = append(s.Transactions, domain.Transaction{ID: domain.NewID(), TenantID: a.TenantID, AccountID: a.ID, Type: "INITIAL_BALANCE", Amount: a.Balance, Currency: a.Currency, BalanceAfter: a.Balance, CreatedAt: a.CreatedAt})
	audit.Append(s, a.TenantID, a.ID, "account", a.ID, "ACCOUNT_CREATED", a, time.Now().UTC())
	return nil
}

func (e *Engine) clientQuote(reference domain.Quote) (domain.Quote, error) {
	return pricing.Apply(reference, e.pricing)
}

// ClientQuotes projects reference-feed state through the same pricing policy used
// by execution and quote events. Clients never receive an unpriced feed by accident.
func (e *Engine) ClientQuotes(tenantID string) ([]domain.Quote, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	quotes := []domain.Quote{}
	for _, key := range sortedKeys(e.state.Quotes) {
		reference := e.state.Quotes[key]
		instrument, ok := e.state.Instruments[key]
		if !ok || instrument.TenantID != tenantID {
			continue
		}
		q, _, err := e.quoteFor(&e.state, domain.Account{TenantID: tenantID, Leverage: domain.D("100"), Currency: "USD"}, instrument, reference, time.Now().UTC())
		if err != nil {
			return nil, err
		}
		quotes = append(quotes, q)
	}
	return quotes, nil
}

func (e *Engine) revalue(s *domain.State, tenantID string, now time.Time) error {
	for _, id := range sortedKeys(s.Positions) {
		p := s.Positions[id]
		if p.TenantID != tenantID || p.Status != "OPEN" {
			continue
		}
		a := s.Accounts[p.AccountID]
		i := s.Instruments[domain.MarketKey(tenantID, p.Symbol)]
		reference, ok := s.Quotes[domain.MarketKey(tenantID, p.Symbol)]
		if !ok {
			return domain.Err("QUOTE_UNAVAILABLE", "Position quote unavailable")
		}
		q, configuration, err := e.quoteFor(s, a, i, reference, now)
		if err != nil {
			return err
		}
		p.CurrentPrice = execution.Price(execution.Opposite(p.Side), q)
		converter := conversion(s, a, now)
		i = economicInstrument(i, p)
		p.UnrealizedPnL, err = converter.Convert(positions.Profit(p.Side, p.OpenPrice, p.CurrentPrice, p.Quantity, i.ContractSize), i.QuoteCurrency, a.Currency)
		if err != nil {
			return err
		}
		p.MarginUsed, err = requiredMargin(s, a, i, configuration, p.Quantity, p.CurrentPrice, now)
		if err != nil {
			return err
		}
		s.Positions[id] = p
	}
	for _, id := range sortedKeys(s.Accounts) {
		a := s.Accounts[id]
		if a.TenantID != tenantID {
			continue
		}
		list := []domain.Position{}
		for _, p := range s.Positions {
			if p.AccountID == id {
				list = append(list, p)
			}
		}
		configuration, err := broker.ResolveAccount(s, a, now)
		if err != nil {
			return err
		}
		a = margin.TotalsWithPolicy(a, list, configuration.Margin)
		a.UpdatedAt = now
		s.Accounts[id] = a
	}
	return nil
}

func accountEvent(s *domain.State, accountID string, now time.Time) {
	a := s.Accounts[accountID]
	prior := a.MarginNotifiedStatus
	if prior == "" {
		prior = "NORMAL"
	}
	if prior != a.MarginStatus {
		configuration, _ := broker.ResolveAccount(s, a, now)
		if a.MarginStatus != "NORMAL" {
			audit.Append(s, a.TenantID, a.ID, "account", a.ID, "MARGIN_WARNING", map[string]any{"margin_level": a.MarginLevel, "margin_status": a.MarginStatus, "policy": configuration.Margin}, now)
			if prior == "NORMAL" {
				audit.Append(s, a.TenantID, a.ID, "account", a.ID, "MARGIN_CALL_ENTERED", a, now)
			}
		} else {
			audit.Append(s, a.TenantID, a.ID, "account", a.ID, "MARGIN_CALL_RECOVERED", a, now)
		}
	}
	a.MarginNotifiedStatus = a.MarginStatus
	s.Accounts[a.ID] = a
	audit.Append(s, a.TenantID, a.ID, "account", a.ID, "ACCOUNT_EQUITY_UPDATED", a, now)
}

func (e *Engine) Preview(ctx context.Context, id domain.Identity, accountID, symbol, side, quantity string) (string, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if err := ctx.Err(); err != nil {
		return "", err
	}
	a, err := account(&e.state, id, accountID)
	if err != nil {
		return "", err
	}
	if side != "BUY" && side != "SELL" {
		return "", domain.Err("INVALID_SIDE", "Side must be BUY or SELL")
	}
	qty, err := decimal.NewFromString(quantity)
	if err != nil || !qty.IsPositive() || !domain.ValidInputDecimal(qty) {
		return "", domain.Err("INVALID_QUANTITY", "Quantity must be a positive decimal string")
	}
	now := time.Now().UTC()
	i, reference, err := market(&e.state, a, symbol, now)
	if err != nil {
		return "", err
	}
	q, configuration, err := e.quoteFor(&e.state, a, i, reference, now)
	if err != nil {
		return "", err
	}
	if err := canOperate(&e.state, a, i, configuration, false, false); err != nil {
		return "", err
	}
	value, err := requiredMargin(&e.state, a, i, configuration, qty, execution.Price(side, q), now)
	if err != nil {
		return "", err
	}
	return value.String(), nil
}
