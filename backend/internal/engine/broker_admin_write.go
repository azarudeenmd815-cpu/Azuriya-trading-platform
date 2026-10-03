package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/permissions"
	"github.com/shopspring/decimal"
)

var brokerDecimal = regexp.MustCompile(`^-?[0-9]{1,18}(\.[0-9]{1,10})?$`)
var symbolName = regexp.MustCompile(`^[A-Z][A-Z0-9._-]{0,23}$`)
var financialFields = map[string]bool{"amount": true, "initial_balance": true, "leverage": true, "max_leverage": true, "max_leverage_override": true, "bid_markup": true, "ask_markup": true, "minimum_spread": true, "maximum_spread": true, "long_rate": true, "short_rate": true, "margin_call_level": true, "stop_out_level": true, "tick_size": true, "contract_size": true, "min_quantity": true, "max_quantity": true, "quantity_step": true, "default_leverage": true}

// ValidateBrokerPayload is also enforced at the domain command boundary. A
// Decimal JSON decoder alone accepts numbers, which is not our financial API.
func ValidateBrokerPayload(raw json.RawMessage) error {
	if len(raw) == 0 || len(raw) > 65536 {
		return domain.Err("INVALID_REQUEST", "Administrative JSON is required and limited to 64 KiB")
	}
	var value any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return domain.Err("INVALID_REQUEST", "Invalid administrative JSON")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return domain.Err("INVALID_REQUEST", "Administrative JSON must contain exactly one object")
	}
	if _, ok := value.(map[string]any); !ok {
		return domain.Err("INVALID_REQUEST", "Expected an administrative object")
	}
	var walk func(any) error
	walk = func(v any) error {
		switch values := v.(type) {
		case map[string]any:
			for key, child := range values {
				if key == "tenant_id" || key == "actor_user_id" || key == "created_at" || key == "updated_at" || key == "id" {
					return domain.Err("INVALID_REQUEST", "Server identity and timestamps cannot be supplied")
				}
				if financialFields[key] && child != nil {
					number, ok := child.(string)
					if !ok || !brokerDecimal.MatchString(number) {
						return domain.Err("INVALID_DECIMAL", "Financial inputs must be bounded plain decimal strings")
					}
				}
				if err := walk(child); err != nil {
					return err
				}
			}
		case []any:
			for _, child := range values {
				if err := walk(child); err != nil {
					return err
				}
			}
		}
		return nil
	}
	return walk(value)
}

func brokerInput(raw json.RawMessage, previous, result any) (string, error) {
	if err := ValidateBrokerPayload(raw); err != nil {
		return "", err
	}
	var incoming map[string]json.RawMessage
	if err := json.Unmarshal(raw, &incoming); err != nil {
		return "", err
	}
	reason := ""
	if value, ok := incoming["reason"]; ok {
		if json.Unmarshal(value, &reason) != nil || len(strings.TrimSpace(reason)) > 500 {
			return "", domain.Err("INVALID_REASON", "Reason must be text up to 500 characters")
		}
		delete(incoming, "reason")
	}
	merged := map[string]json.RawMessage{}
	if previous != nil {
		existing, _ := json.Marshal(previous)
		_ = json.Unmarshal(existing, &merged)
	}
	for key, value := range incoming {
		merged[key] = value
	}
	data, _ := json.Marshal(merged)
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(result); err != nil {
		return "", domain.Err("INVALID_REQUEST", "Unknown fields or invalid administrative values")
	}
	return strings.TrimSpace(reason), nil
}
func brokerVersion(raw json.RawMessage, revision uint64) error {
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(raw, &fields)
	var expected uint64
	if json.Unmarshal(fields["revision"], &expected) != nil || expected != revision {
		return domain.Err("CONFIGURATION_CONFLICT", "This configuration changed. Reload its current revision before saving")
	}
	return nil
}
func profileKind(resource string) string {
	return map[string]string{"pricing-profiles": "PRICING", "commission-plans": "COMMISSION", "swap-plans": "SWAP", "leverage-plans": "LEVERAGE", "margin-profiles": "MARGIN", "execution-profiles": "EXECUTION", "trading-sessions": "SESSION"}[resource]
}

func brokerAdminAudit(s *domain.State, id domain.Identity, accountID, action, targetType, targetID, reason string, before, after any, now time.Time) {
	audit.Append(s, id.TenantID, accountID, "broker_admin", targetID, action, map[string]any{"actor_user_id": id.UserID, "actor_role": id.Role, "action": action, "target_type": targetType, "target_id": targetID, "before": before, "after": after, "reason": reason}, now)
	event := &s.Events[len(s.Events)-1]
	event.ActorUserID = id.UserID
	event.ActorRole = id.Role
}

// BrokerWrite is the administrative command boundary. Transport has its own
// capability checks; callers cannot bypass this check by skipping HTTP.
func (e *Engine) BrokerWrite(ctx context.Context, id domain.Identity, resource, target string, raw json.RawMessage, members []BrokerMember) (any, error) {
	cap := permissions.Capability(resource, true)
	if resource == "accounts" && target == "" {
		cap = "accounts.create"
	}
	if err := permissions.Require(id, cap); err != nil {
		return nil, err
	}
	if err := ValidateBrokerPayload(raw); err != nil {
		return nil, err
	}
	var result any
	err := e.change(ctx, func(s *domain.State) error {
		broker.Ensure(s)
		if s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, id.UserID)] == "SUSPENDED" {
			return domain.Err("FORBIDDEN", "Membership is suspended")
		}
		now := time.Now().UTC()
		var before any
		reason := ""
		action := ""
		accountID := ""
		configuration := false
		switch {
		case profileKind(resource) != "":
			kind := profileKind(resource)
			var p domain.BrokerProfile
			var previous any
			if target != "" {
				old, ok := s.Broker.Profiles[target]
				if !ok || old.TenantID != id.TenantID || old.Kind != kind {
					return domain.Err("NOT_FOUND", "Profile not found")
				}
				if err := brokerVersion(raw, old.Revision); err != nil {
					return err
				}
				before = old
				previous = old
			}
			var err error
			reason, err = brokerInput(raw, previous, &p)
			if err != nil {
				return err
			}
			p.TenantID = id.TenantID
			p.Kind = kind
			p.UpdatedAt = now
			if target == "" {
				p.ID = domain.NewID()
				p.CreatedAt = now
				p.Revision = 1
			} else {
				p.ID = target
				p.Revision++
			}
			if p.Status == "" {
				p.Status = "ACTIVE"
			}
			if err := broker.ValidateProfile(p); err != nil {
				return err
			}
			for _, override := range p.SymbolOverrides {
				if _, ok := s.Instruments[domain.MarketKey(id.TenantID, override.Symbol)]; !ok {
					return domain.Err("INVALID_PROFILE", "Symbol override must reference a broker symbol")
				}
			}
			if p.Leverage != nil {
				for _, rule := range p.Leverage.Rules {
					if rule.Symbol != "" {
						if _, ok := s.Instruments[domain.MarketKey(id.TenantID, rule.Symbol)]; !ok {
							return domain.Err("INVALID_PROFILE", "Leverage rule symbol does not exist")
						}
					}
					if rule.SymbolGroupID != "" {
						g, ok := s.Broker.SymbolGroups[rule.SymbolGroupID]
						if !ok || g.TenantID != id.TenantID {
							return domain.Err("INVALID_PROFILE", "Leverage rule category does not exist")
						}
					}
				}
			}
			s.Broker.Profiles[p.ID] = p.Clone()
			result = p.Clone()
			target = p.ID
			action = kind + "_PROFILE_UPDATED"
			configuration = true
		case resource == "trading-groups":
			var g domain.TradingGroup
			var previous any
			if target != "" {
				old, ok := s.Broker.Groups[target]
				if !ok || old.TenantID != id.TenantID {
					return domain.Err("NOT_FOUND", "Trading group not found")
				}
				if err := brokerVersion(raw, old.Revision); err != nil {
					return err
				}
				before = old
				previous = old
			}
			var err error
			reason, err = brokerInput(raw, previous, &g)
			if err != nil {
				return err
			}
			g.TenantID = id.TenantID
			g.UpdatedAt = now
			if target == "" {
				g.ID = domain.NewID()
				g.Revision = 1
				g.CreatedAt = now
				action = "TRADING_GROUP_CREATED"
			} else {
				g.ID = target
				g.Revision++
				action = "TRADING_GROUP_UPDATED"
			}
			if g.Status == "" {
				g.Status = "ACTIVE"
			}
			if err := broker.ValidateGroup(s, g); err != nil {
				return err
			}
			s.Broker.Groups[g.ID] = g.Clone()
			result = g.Clone()
			target = g.ID
			configuration = true
		case resource == "symbol-groups":
			var g domain.SymbolGroup
			var previous any
			if target != "" {
				old, ok := s.Broker.SymbolGroups[target]
				if !ok || old.TenantID != id.TenantID {
					return domain.Err("NOT_FOUND", "Symbol group not found")
				}
				if err := brokerVersion(raw, old.Revision); err != nil {
					return err
				}
				before = old
				previous = old
			}
			var err error
			reason, err = brokerInput(raw, previous, &g)
			if err != nil {
				return err
			}
			g.TenantID = id.TenantID
			g.UpdatedAt = now
			if target == "" {
				g.ID = domain.NewID()
				g.Revision = 1
				g.CreatedAt = now
				action = "SYMBOL_GROUP_CREATED"
			} else {
				g.ID = target
				g.Revision++
				action = "SYMBOL_GROUP_UPDATED"
			}
			if err := broker.ValidateSymbolGroup(s, g); err != nil {
				return err
			}
			s.Broker.SymbolGroups[g.ID] = g
			result = g
			target = g.ID
			configuration = true
		case resource == "settings":
			old := s.Broker.Settings[id.TenantID]
			if err := brokerVersion(raw, old.Revision); err != nil {
				return err
			}
			var settings domain.BrokerSettings
			var err error
			reason, err = brokerInput(raw, old, &settings)
			if err != nil {
				return err
			}
			settings.TenantID = id.TenantID
			settings.Revision++
			settings.UpdatedAt = now
			if err := broker.ValidateSettings(s, settings); err != nil {
				return err
			}
			before = old
			s.Broker.Settings[id.TenantID] = settings
			result = settings
			target = id.TenantID
			action = "BROKER_SETTINGS_UPDATED"
			configuration = true
		case resource == "symbols":
			var i domain.Instrument
			var previous any
			if target != "" {
				old, ok := s.Instruments[domain.MarketKey(id.TenantID, target)]
				if !ok {
					return domain.Err("INSTRUMENT_NOT_FOUND", "Symbol not found")
				}
				if err := brokerVersion(raw, old.Revision); err != nil {
					return err
				}
				before = old
				previous = old
			}
			var err error
			reason, err = brokerInput(raw, previous, &i)
			if err != nil {
				return err
			}
			i.TenantID = id.TenantID
			if target == "" {
				i.ID = domain.NewID()
				i.Revision = 1
				if _, exists := s.Instruments[domain.MarketKey(id.TenantID, i.Symbol)]; exists {
					return domain.Err("CONFIGURATION_CONFLICT", "Symbol already exists")
				}
				action = "SYMBOL_CREATED"
			} else {
				old := before.(domain.Instrument)
				i.ID = old.ID
				if i.Symbol != old.Symbol {
					return domain.Err("UNSAFE_SYMBOL_CHANGE", "Symbol names are immutable")
				}
				i.Revision++
				action = "SYMBOL_UPDATED"
				if structuralSymbolChange(old, i) && symbolExposure(s, id.TenantID, i.Symbol) {
					return domain.Err("UNSAFE_SYMBOL_CHANGE", "Structural symbol terms cannot change while positions or pending orders exist")
				}
			}
			if err := validateBrokerSymbol(s, i); err != nil {
				return err
			}
			key := domain.MarketKey(id.TenantID, i.Symbol)
			s.Instruments[key] = i
			if old, ok := s.Quotes[key]; ok {
				if structuralSymbolChangeQuote(old, i) {
					old.Bid = old.Bid.Div(i.TickSize).Floor().Mul(i.TickSize)
					old.Ask = old.Ask.Div(i.TickSize).Ceil().Mul(i.TickSize)
					if !old.Bid.IsPositive() {
						return domain.Err("INVALID_SYMBOL", "New tick size exceeds the current reference price")
					}
					s.Quotes[key] = old
				}
			} else {
				source := s.Quotes[domain.MarketKey(id.TenantID, i.PriceSourceSymbol)]
				source.Symbol = i.Symbol
				source.Sequence = 1
				source.Timestamp = now
				source.Bid = source.Bid.Div(i.TickSize).Floor().Mul(i.TickSize)
				source.Ask = source.Ask.Div(i.TickSize).Ceil().Mul(i.TickSize)
				s.Quotes[key] = source
			}
			result = i
			target = i.Symbol
			configuration = true
			audit.Append(s, id.TenantID, "", "instrument", i.ID, "INSTRUMENT_UPDATED", i, now)
		case resource == "accounts":
			var err error
			result, before, reason, action, err = brokerAccountWrite(s, id, target, raw, members, now)
			if err != nil {
				return err
			}
			a := result.(domain.Account)
			target = a.ID
			accountID = a.ID
			configuration = true
		case resource == "balance-operations":
			if err := e.revalue(s, id.TenantID, now); err != nil {
				return err
			}
			var err error
			result, before, reason, err = brokerBalanceWrite(s, id, target, raw, now)
			if err != nil {
				return err
			}
			accountID = target
			action = "BALANCE_ADJUSTED"
			// A replay returns its original transaction and must not duplicate audit.
			if before == nil {
				return nil
			}
		case resource == "clients":
			member, ok := brokerMember(members, id.TenantID, target)
			if !ok {
				return domain.Err("NOT_FOUND", "Client not found")
			}
			var input struct {
				Status string `json:"status"`
			}
			var err error
			reason, err = brokerInput(raw, nil, &input)
			if err != nil {
				return err
			}
			if input.Status != "ACTIVE" && input.Status != "SUSPENDED" {
				return domain.Err("INVALID_CLIENT_STATUS", "Client status must be ACTIVE or SUSPENDED")
			}
			if target == id.UserID && input.Status == "SUSPENDED" {
				return domain.Err("INVALID_CLIENT_STATUS", "You cannot suspend your own operating membership")
			}
			before = member
			if status := s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, target)]; status != "" {
				member.Status = status
			}
			s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, target)] = input.Status
			member.Status = input.Status
			member.UpdatedAt = now
			result = member
			action = "CLIENT_STATUS_CHANGED"
		default:
			return domain.Err("NOT_FOUND", "Administrative resource not found")
		}
		if configuration {
			// Reject a configuration that leaves assigned accounts without resolvable
			// policies; the entire candidate is discarded before persistence.
			for _, a := range s.Accounts {
				if a.TenantID != id.TenantID || a.Status == "CLOSED" {
					continue
				}
				for _, i := range s.Instruments {
					if i.TenantID == id.TenantID {
						if _, err := broker.Resolve(s, a, i, now); err != nil {
							return err
						}
					}
				}
			}
			if resource != "settings" {
				settings := s.Broker.Settings[id.TenantID]
				settings.Revision++
				settings.UpdatedAt = now
				s.Broker.Settings[id.TenantID] = settings
			}
		}
		if err := e.revalue(s, id.TenantID, now); err != nil {
			return err
		}
		if err := e.applyRisk(s, id.TenantID, now); err != nil {
			return err
		}
		if accountID != "" {
			accountEvent(s, accountID, now)
			if resource == "accounts" {
				result = s.Accounts[accountID]
			}
		}
		brokerAdminAudit(s, id, accountID, action, resource, target, reason, before, result, now)
		if configuration {
			if err := e.publishAccountQuotes(s, id.TenantID, now); err != nil {
				return err
			}
			audit.Append(s, id.TenantID, "", "broker_configuration", id.TenantID, "BROKER_CONFIGURATION_UPDATED", map[string]any{"revision": s.Broker.Settings[id.TenantID].Revision}, now)
		}
		return nil
	})
	return result, err
}

func brokerMember(members []BrokerMember, tenant, user string) (BrokerMember, bool) {
	for _, m := range members {
		if m.ID == user && m.TenantID == tenant {
			return m, true
		}
	}
	return BrokerMember{}, false
}
func brokerAccount(s *domain.State, id domain.Identity, target string) (domain.Account, error) {
	a, ok := s.Accounts[target]
	if !ok || a.TenantID != id.TenantID {
		return a, domain.Err("ACCOUNT_NOT_FOUND", "Trading account not found")
	}
	return a, nil
}

func brokerAccountWrite(s *domain.State, id domain.Identity, target string, raw json.RawMessage, members []BrokerMember, now time.Time) (any, any, string, string, error) {
	type input struct {
		UserID              string           `json:"user_id"`
		Name                *string          `json:"name"`
		Mode                string           `json:"mode"`
		Currency            string           `json:"currency"`
		PositionMode        string           `json:"position_mode"`
		Status              *string          `json:"status"`
		TradingGroupID      *string          `json:"trading_group_id"`
		InitialBalance      *decimal.Decimal `json:"initial_balance"`
		Leverage            *decimal.Decimal `json:"leverage"`
		MaxLeverageOverride *decimal.Decimal `json:"max_leverage_override"`
	}
	var r input
	reason, err := brokerInput(raw, nil, &r)
	if err != nil {
		return nil, nil, "", "", err
	}
	var a domain.Account
	var before any
	action := "ACCOUNT_UPDATED"
	if target == "" {
		member, ok := brokerMember(members, id.TenantID, r.UserID)
		if !ok || member.Status != "ACTIVE" || s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, r.UserID)] == "SUSPENDED" {
			return nil, nil, "", "", domain.Err("INVALID_ACCOUNT_OWNER", "Account owner must be an active tenant member")
		}
		if r.Mode == "" {
			r.Mode = "BROKER_DEMO"
		}
		if r.Currency == "" {
			r.Currency = "USD"
		}
		if r.PositionMode == "" {
			r.PositionMode = "HEDGING"
		}
		if (r.Mode != "BROKER_DEMO" && r.Mode != "PROP_SIMULATED") || r.Currency != "USD" || r.PositionMode != "HEDGING" {
			return nil, nil, "", "", domain.Err("ACCOUNT_MODE_DISABLED", "Only simulated/demo USD hedging accounts are enabled")
		}
		a = domain.NewAccount(id.TenantID, r.UserID, r.Mode)
		a.Balance = decimal.Zero
		if r.InitialBalance != nil {
			a.Balance = *r.InitialBalance
		}
		if a.Balance.IsNegative() || a.Balance.GreaterThan(domain.D("1000000000000")) {
			return nil, nil, "", "", domain.Err("INVALID_BALANCE", "Initial simulated balance must be between zero and one trillion")
		}
		maximum := uint64(100000)
		for _, existing := range s.Accounts {
			if existing.TenantID == id.TenantID {
				if n, parseErr := strconv.ParseUint(existing.AccountNumber, 10, 64); parseErr == nil && n > maximum {
					maximum = n
				}
			}
		}
		a.AccountNumber = strconv.FormatUint(maximum+1, 10)
		action = "ACCOUNT_CREATED"
	} else {
		a, err = brokerAccount(s, id, target)
		if err != nil {
			return nil, nil, "", "", err
		}
		before = a
		if r.UserID != "" || r.Mode != "" || r.Currency != "" || r.PositionMode != "" || r.InitialBalance != nil {
			return nil, nil, "", "", domain.Err("UNSAFE_ACCOUNT_CHANGE", "Owner, mode, currency, position mode and initial funding are immutable")
		}
	}
	if r.Name != nil {
		a.Name = strings.TrimSpace(*r.Name)
	}
	if len(a.Name) < 2 || len(a.Name) > 100 {
		return nil, nil, "", "", domain.Err("INVALID_ACCOUNT_NAME", "Account name must contain 2 to 100 characters")
	}
	if r.Leverage != nil {
		a.Leverage = *r.Leverage
	}
	if !a.Leverage.IsPositive() || a.Leverage.GreaterThan(domain.D("1000")) {
		return nil, nil, "", "", domain.Err("INVALID_LEVERAGE", "Account leverage must be greater than zero and at most 1000")
	}
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(raw, &fields)
	if _, supplied := fields["max_leverage_override"]; supplied {
		a.MaxLeverageOverride = domain.CopyDecimal(r.MaxLeverageOverride)
	}
	if a.MaxLeverageOverride != nil && (!a.MaxLeverageOverride.IsPositive() || a.MaxLeverageOverride.GreaterThan(a.Leverage)) {
		return nil, nil, "", "", domain.Err("INVALID_LEVERAGE", "Override may only reduce account maximum leverage")
	}
	if r.TradingGroupID != nil {
		a.TradingGroupID = *r.TradingGroupID
		action = "ACCOUNT_GROUP_CHANGED"
	}
	if a.TradingGroupID == "" {
		a.TradingGroupID = s.Broker.Settings[id.TenantID].DefaultTradingGroupID
	}
	g, ok := s.Broker.Groups[a.TradingGroupID]
	if !ok || g.TenantID != id.TenantID || g.Status != "ACTIVE" {
		return nil, nil, "", "", domain.Err("INVALID_TRADING_GROUP", "Assign an active tenant trading group")
	}
	desiredStatus := a.Status
	if r.Status != nil {
		desiredStatus = *r.Status
		if target != "" {
			action = "ACCOUNT_STATUS_CHANGED"
		}
	}
	if desiredStatus != "ACTIVE" && desiredStatus != "READ_ONLY" && desiredStatus != "SUSPENDED" && desiredStatus != "CLOSED" {
		return nil, nil, "", "", domain.Err("INVALID_ACCOUNT_STATUS", "Invalid account status")
	}
	if desiredStatus == "CLOSED" && accountExposure(s, a.ID) {
		return nil, nil, "", "", domain.Err("ACCOUNT_HAS_EXPOSURE", "Close positions and cancel pending orders before closing the account")
	}
	if before != nil && before.(domain.Account).Status == "CLOSED" && desiredStatus != "CLOSED" {
		return nil, nil, "", "", domain.Err("ACCOUNT_CLOSED", "A closed historical account cannot be reopened")
	}
	if target == "" {
		a.Status = "ACTIVE"
		if err := addAccount(s, a); err != nil {
			return nil, nil, "", "", err
		}
		a = s.Accounts[a.ID]
		action = "ACCOUNT_CREATED"
	}
	a.Status = desiredStatus
	a.UpdatedAt = now
	s.Accounts[a.ID] = a
	return a, before, reason, action, nil
}

func brokerBalanceWrite(s *domain.State, id domain.Identity, target string, raw json.RawMessage, now time.Time) (any, any, string, error) {
	var r struct {
		Type              string          `json:"type"`
		Amount            decimal.Decimal `json:"amount"`
		Currency          string          `json:"currency"`
		Reason            string          `json:"reason"`
		Reference         string          `json:"reference"`
		ClientOperationID string          `json:"client_operation_id"`
	}
	// Reason is a required part of the financial command, so decode it directly.
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(&r) != nil {
		return nil, nil, "", domain.Err("INVALID_REQUEST", "Invalid balance operation")
	}
	a, err := brokerAccount(s, id, target)
	if err != nil {
		return nil, nil, "", err
	}
	if a.Status == "CLOSED" {
		return nil, nil, "", domain.Err("ACCOUNT_CLOSED", "Historical closed accounts cannot receive balance operations")
	}
	if r.Currency != a.Currency || len(strings.TrimSpace(r.Reason)) < 3 || len(r.Reason) > 500 || len(strings.TrimSpace(r.Reference)) < 1 || len(r.Reference) > 128 || len(r.ClientOperationID) < 1 || len(r.ClientOperationID) > 128 {
		return nil, nil, "", domain.Err("INVALID_BALANCE_OPERATION", "Matching account currency, reason, reference and command ID are required")
	}
	key := idemKey(a.ID, "balance:"+r.ClientOperationID)
	fp := fingerprint("balance", a.ID, r)
	var transaction domain.Transaction
	if found, err := replay(s, key, fp, &transaction); found {
		return transaction, nil, r.Reason, err
	}
	amount := r.Amount
	switch r.Type {
	case "DEPOSIT_SIMULATED", "CREDIT":
		if !amount.IsPositive() {
			return nil, nil, "", domain.Err("INVALID_AMOUNT", "Credit amount must be positive")
		}
	case "WITHDRAWAL_SIMULATED", "DEBIT":
		if !amount.IsPositive() {
			return nil, nil, "", domain.Err("INVALID_AMOUNT", "Debit amount must be positive")
		}
		amount = amount.Neg()
	case "ADJUSTMENT":
		if amount.IsZero() {
			return nil, nil, "", domain.Err("INVALID_AMOUNT", "Adjustment must be nonzero")
		}
	default:
		return nil, nil, "", domain.Err("INVALID_BALANCE_OPERATION", "Unsupported simulated operation type")
	}
	if amount.Abs().GreaterThan(domain.D("1000000000000")) {
		return nil, nil, "", domain.Err("INVALID_AMOUNT", "Operation exceeds the supported amount limit")
	}
	before := a
	if amount.IsNegative() && (a.Balance.Add(amount).IsNegative() || a.MarginFree.Add(amount).IsNegative()) {
		return nil, nil, "", domain.Err("INSUFFICIENT_FUNDS", "Debit must preserve nonnegative balance and free margin")
	}
	a.Balance = a.Balance.Add(amount)
	a.UpdatedAt = now
	s.Accounts[a.ID] = a
	transaction = domain.Transaction{ID: domain.NewID(), TenantID: a.TenantID, AccountID: a.ID, Type: r.Type, Amount: amount, Currency: a.Currency, BalanceAfter: a.Balance, CreatedAt: now, ActorUserID: id.UserID, Reason: strings.TrimSpace(r.Reason), Reference: strings.TrimSpace(r.Reference), ClientOperationID: r.ClientOperationID}
	s.Transactions = append(s.Transactions, transaction)
	remember(s, key, fp, transaction.ID, transaction, nil)
	return transaction, before, r.Reason, nil
}

func accountExposure(s *domain.State, accountID string) bool {
	for _, p := range s.Positions {
		if p.AccountID == accountID && p.Status == "OPEN" {
			return true
		}
	}
	for _, o := range s.Orders {
		if o.AccountID == accountID && o.Status == "ACCEPTED" {
			return true
		}
	}
	return false
}
func symbolExposure(s *domain.State, tenant, symbol string) bool {
	for _, p := range s.Positions {
		if p.TenantID == tenant && p.Symbol == symbol && p.Status == "OPEN" {
			return true
		}
	}
	for _, o := range s.Orders {
		if o.TenantID == tenant && o.Symbol == symbol && o.Status == "ACCEPTED" {
			return true
		}
	}
	return false
}
func structuralSymbolChange(a, b domain.Instrument) bool {
	return a.BaseCurrency != b.BaseCurrency || a.QuoteCurrency != b.QuoteCurrency || a.AssetClass != b.AssetClass || a.Digits != b.Digits || !a.TickSize.Equal(b.TickSize) || !a.ContractSize.Equal(b.ContractSize) || !a.MinQuantity.Equal(b.MinQuantity) || !a.QuantityStep.Equal(b.QuantityStep) || a.PriceSourceSymbol != b.PriceSourceSymbol
}
func structuralSymbolChangeQuote(q domain.Quote, i domain.Instrument) bool {
	return !q.Bid.Mod(i.TickSize).IsZero() || !q.Ask.Mod(i.TickSize).IsZero()
}
func validateBrokerSymbol(s *domain.State, i domain.Instrument) error {
	if !symbolName.MatchString(i.Symbol) || len(strings.TrimSpace(i.DisplayName)) < 2 || len(i.DisplayName) > 100 || len(i.Description) > 1000 {
		return domain.Err("INVALID_SYMBOL", "Symbol name and display name are invalid")
	}
	if i.AssetClass != "FOREX" && i.AssetClass != "METAL" && i.AssetClass != "INDEX" && i.AssetClass != "CRYPTO" {
		return domain.Err("INVALID_SYMBOL", "Unsupported native simulated asset class")
	}
	if i.QuoteCurrency != "USD" && !(i.BaseCurrency == "USD" && i.QuoteCurrency == "JPY") {
		return domain.Err("UNSUPPORTED_CURRENCY", "Supported symbols must quote USD or use the supported USDJPY conversion")
	}
	if i.Digits < 0 || i.Digits > 10 || !i.TickSize.IsPositive() || !i.ContractSize.IsPositive() || !i.MinQuantity.IsPositive() || i.MaxQuantity.LessThan(i.MinQuantity) || !i.QuantityStep.IsPositive() || !i.DefaultLeverage.IsPositive() {
		return domain.Err("INVALID_SYMBOL", "Contract, price precision, leverage and quantity limits must be valid positive decimals")
	}
	unit := decimal.New(1, -i.Digits)
	if !i.TickSize.Mod(unit).IsZero() || !i.MinQuantity.Mod(i.QuantityStep).IsZero() || !i.MaxQuantity.Mod(i.QuantityStep).IsZero() {
		return domain.Err("INVALID_SYMBOL", "Tick and quantity terms must align to their precision and steps")
	}
	if i.TradingStatus != "OPEN" && i.TradingStatus != "CLOSE_ONLY" && i.TradingStatus != "DISABLED" && i.TradingStatus != "CLOSED" {
		return domain.Err("INVALID_SYMBOL", "Invalid symbol trading status")
	}
	if i.PriceSourceSymbol == "" {
		return domain.Err("INVALID_SYMBOL", "Select a native simulated price source")
	}
	source, ok := s.Instruments[domain.MarketKey(i.TenantID, i.PriceSourceSymbol)]
	if !ok {
		return domain.Err("INVALID_SYMBOL", "Select an existing native simulated price source")
	}
	if source.PriceSourceSymbol != "" && source.PriceSourceSymbol != source.Symbol {
		return domain.Err("INVALID_SYMBOL", "Price sources must be native symbols, rather than aliases")
	}
	if source.BaseCurrency != i.BaseCurrency || source.QuoteCurrency != i.QuoteCurrency {
		return domain.Err("INVALID_SYMBOL", "Price source currency terms must match the symbol")
	}
	if i.SymbolGroupID != "" {
		g, ok := s.Broker.SymbolGroups[i.SymbolGroupID]
		if !ok || g.TenantID != i.TenantID {
			return domain.Err("INVALID_SYMBOL", "Symbol category is outside the tenant")
		}
	}
	// Reuse group reference validation without creating a second inheritance model.
	if err := broker.ValidateSymbolGroup(s, domain.SymbolGroup{ID: "validation", TenantID: i.TenantID, Name: "Instrument overrides", ProfileRefs: i.ProfileOverrides}); err != nil {
		return fmt.Errorf("instrument profile references: %w", err)
	}
	return nil
}
