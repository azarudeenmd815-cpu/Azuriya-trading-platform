package engine

import (
	"azuriya/backend/internal/broker"
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/permissions"
	"sort"
	"strings"
	"time"
)

func brokerSearch(search string, values ...string) bool {
	if search == "" {
		return true
	}
	needle := strings.ToLower(search)
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), needle) {
			return true
		}
	}
	return false
}
func brokerTimeFilter(value time.Time, f BrokerFilter) bool {
	return (f.From.IsZero() || !value.Before(f.From)) && (f.To.IsZero() || value.Before(f.To))
}
func brokerLimit[T any](rows []T, f BrokerFilter) []T {
	limit := f.Limit
	if limit == 0 {
		limit = 200
	}
	if len(rows) > limit {
		return rows[:limit]
	}
	return rows
}

// BrokerRead calculates projections under the existing read lock. It copies only
// the selected tenant records rather than cloning the entire historical ledger.
func (e *Engine) BrokerRead(id domain.Identity, resource, target string, f BrokerFilter, members []BrokerMember) (any, error) {
	if err := permissions.Require(id, permissions.Capability(resource, false)); err != nil {
		return nil, err
	}
	if f.Limit < 0 || f.Limit > 1000 || len(f.Search) > 200 {
		return nil, domain.Err("INVALID_FILTER", "Limit must be 1–1000 and search up to 200 characters")
	}
	e.mu.RLock()
	defer e.mu.RUnlock()
	s := &e.state
	if s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, id.UserID)] == "SUSPENDED" {
		return nil, domain.Err("FORBIDDEN", "Membership is suspended")
	}
	if target != "" && resource == "accounts" {
		return brokerAccountDetail(s, id, target, members)
	}
	if target != "" && resource == "clients" {
		return brokerClientDetail(s, id, target, members)
	}
	if resource == "effective-settings" {
		a, err := brokerAccount(s, id, target)
		if err != nil {
			return nil, err
		}
		symbol := f.Symbol
		if symbol == "" {
			symbol = "EURUSD"
		}
		i, ok := s.Instruments[domain.MarketKey(id.TenantID, symbol)]
		if !ok {
			return nil, domain.Err("INSTRUMENT_NOT_FOUND", "Symbol not found")
		}
		return broker.Resolve(s, a, i, time.Now().UTC())
	}
	if kind := profileKind(resource); kind != "" {
		rows := []domain.BrokerProfile{}
		for _, p := range s.Broker.Profiles {
			if p.TenantID == id.TenantID && p.Kind == kind && (f.Status == "" || p.Status == f.Status) && brokerSearch(f.Search, p.Name, p.Description) {
				if target != "" {
					if p.ID == target {
						return p.Clone(), nil
					}
					continue
				}
				rows = append(rows, p.Clone())
			}
		}
		if target != "" {
			return nil, domain.Err("NOT_FOUND", "Profile not found")
		}
		sort.Slice(rows, func(i, j int) bool { return rows[i].Name < rows[j].Name })
		return brokerLimit(rows, f), nil
	}
	switch resource {
	case "dashboard":
		return brokerDashboard(s, id, members), nil
	case "accounts":
		return brokerLimit(brokerAccounts(s, id, f, members), f), nil
	case "clients":
		return brokerLimit(brokerClients(s, id, f, members), f), nil
	case "symbols":
		rows := []domain.Instrument{}
		for _, i := range s.Instruments {
			if i.TenantID == id.TenantID && (f.Symbol == "" || i.Symbol == f.Symbol) && (f.Status == "" || i.TradingStatus == f.Status) && brokerSearch(f.Search, i.Symbol, i.DisplayName, i.AssetClass) {
				if target != "" {
					if i.Symbol == target {
						return i, nil
					}
					continue
				}
				rows = append(rows, i)
			}
		}
		if target != "" {
			return nil, domain.Err("INSTRUMENT_NOT_FOUND", "Symbol not found")
		}
		sort.Slice(rows, func(i, j int) bool {
			if rows[i].SortOrder == rows[j].SortOrder {
				return rows[i].Symbol < rows[j].Symbol
			}
			return rows[i].SortOrder < rows[j].SortOrder
		})
		return brokerLimit(rows, f), nil
	case "trading-groups":
		rows := []domain.TradingGroup{}
		for _, g := range s.Broker.Groups {
			if g.TenantID == id.TenantID && (f.Status == "" || g.Status == f.Status) && brokerSearch(f.Search, g.Name, g.Description) {
				if target != "" {
					if g.ID == target {
						return g.Clone(), nil
					}
					continue
				}
				rows = append(rows, g.Clone())
			}
		}
		if target != "" {
			return nil, domain.Err("NOT_FOUND", "Trading group not found")
		}
		sort.Slice(rows, func(i, j int) bool { return rows[i].Name < rows[j].Name })
		return brokerLimit(rows, f), nil
	case "symbol-groups":
		rows := []domain.SymbolGroup{}
		for _, g := range s.Broker.SymbolGroups {
			if g.TenantID == id.TenantID && brokerSearch(f.Search, g.Name, g.Description) {
				if target != "" {
					if g.ID == target {
						return g, nil
					}
					continue
				}
				rows = append(rows, g)
			}
		}
		if target != "" {
			return nil, domain.Err("NOT_FOUND", "Symbol group not found")
		}
		sort.Slice(rows, func(i, j int) bool { return rows[i].Name < rows[j].Name })
		return brokerLimit(rows, f), nil
	case "settings":
		settings, ok := s.Broker.Settings[id.TenantID]
		if !ok {
			return nil, domain.Err("NOT_FOUND", "Broker settings not found")
		}
		return settings, nil
	case "risk/exposure":
		return brokerLimit(brokerExposures(s, id, f), f), nil
	case "risk/accounts":
		return brokerLimit(brokerRiskAccounts(s, id, f, members), f), nil
	case "dealer/positions":
		return brokerLimit(brokerPositions(s, id, f), f), nil
	case "dealer/orders":
		return brokerLimit(brokerOrders(s, id, f), f), nil
	case "dealer/executions":
		return brokerLimit(brokerFills(s, id, f), f), nil
	case "transactions":
		return brokerLimit(brokerTransactions(s, id, f), f), nil
	case "audit":
		return brokerAudit(s, id, f), nil
	}
	return nil, domain.Err("NOT_FOUND", "Administrative resource not found")
}

func brokerAccounts(s *domain.State, id domain.Identity, f BrokerFilter, members []BrokerMember) []domain.Account {
	rows := []domain.Account{}
	for _, a := range s.Accounts {
		member, _ := brokerMember(members, id.TenantID, a.UserID)
		if a.TenantID == id.TenantID && (f.AccountID == "" || a.ID == f.AccountID) && (f.Status == "" || a.Status == f.Status) && brokerSearch(f.Search, a.AccountNumber, a.Name, member.Email) && brokerTimeFilter(a.CreatedAt, f) {
			a.MaxLeverageOverride = domain.CopyDecimal(a.MaxLeverageOverride)
			rows = append(rows, a)
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].AccountNumber < rows[j].AccountNumber })
	return rows
}
func brokerClients(s *domain.State, id domain.Identity, f BrokerFilter, members []BrokerMember) []BrokerClient {
	rows := []BrokerClient{}
	for _, member := range members {
		if member.TenantID != id.TenantID {
			continue
		}
		if status := s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, member.ID)]; status != "" {
			member.Status = status
		}
		if (f.Status != "" && member.Status != f.Status) || !brokerSearch(f.Search, member.Name, member.Email) {
			continue
		}
		row := BrokerClient{BrokerMember: member}
		for _, a := range s.Accounts {
			if a.TenantID == id.TenantID && a.UserID == member.ID {
				row.AccountCount++
				activity := a.UpdatedAt
				if row.LastActivity == nil || activity.After(*row.LastActivity) {
					row.LastActivity = &activity
				}
			}
		}
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Email < rows[j].Email })
	return rows
}
func brokerClientDetail(s *domain.State, id domain.Identity, target string, members []BrokerMember) (BrokerClientDetail, error) {
	detail := BrokerClientDetail{Accounts: []domain.Account{}, Memberships: []BrokerMember{}, Activity: []domain.Event{}}
	found := false
	for _, client := range brokerClients(s, id, BrokerFilter{}, members) {
		if client.ID == target {
			detail.Client = client
			detail.Memberships = append(detail.Memberships, client.BrokerMember)
			found = true
			break
		}
	}
	if !found {
		return detail, domain.Err("NOT_FOUND", "Client not found")
	}
	for _, a := range brokerAccounts(s, id, BrokerFilter{}, members) {
		if a.UserID == target {
			detail.Accounts = append(detail.Accounts, a)
		}
	}
	for _, event := range s.Events {
		if event.TenantID != id.TenantID {
			continue
		}
		a, ok := s.Accounts[event.AccountID]
		if ok && a.UserID == target {
			event.Payload = append([]byte(nil), event.Payload...)
			detail.Activity = append(detail.Activity, event)
		}
	}
	if len(detail.Activity) > 100 {
		detail.Activity = detail.Activity[len(detail.Activity)-100:]
	}
	return detail, nil
}
func brokerAccountDetail(s *domain.State, id domain.Identity, target string, members []BrokerMember) (BrokerAccountDetail, error) {
	a, err := brokerAccount(s, id, target)
	if err != nil {
		return BrokerAccountDetail{}, err
	}
	a.MaxLeverageOverride = domain.CopyDecimal(a.MaxLeverageOverride)
	f := BrokerFilter{AccountID: a.ID}
	detail := BrokerAccountDetail{Account: a, Positions: brokerPositions(s, id, f), Orders: brokerOrders(s, id, f), Fills: brokerFills(s, id, f), Transactions: brokerTransactions(s, id, f), Audit: []domain.Event{}, Effective: []any{}}
	if m, ok := brokerMember(members, id.TenantID, a.UserID); ok {
		if status := s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, a.UserID)]; status != "" {
			m.Status = status
		}
		detail.Client = &m
	}
	for _, event := range s.Events {
		if event.TenantID == id.TenantID && event.AccountID == a.ID {
			event.Payload = append([]byte(nil), event.Payload...)
			detail.Audit = append(detail.Audit, event)
		}
	}
	if len(detail.Audit) > 100 {
		detail.Audit = detail.Audit[len(detail.Audit)-100:]
	}
	for _, key := range sortedKeys(s.Instruments) {
		i := s.Instruments[key]
		if i.TenantID == id.TenantID {
			effective, resolveErr := broker.Resolve(s, a, i, time.Now().UTC())
			if resolveErr != nil {
				return detail, resolveErr
			}
			detail.Effective = append(detail.Effective, effective)
		}
	}
	return detail, nil
}
func brokerPositions(s *domain.State, id domain.Identity, f BrokerFilter) []domain.Position {
	rows := []domain.Position{}
	status := f.Status
	if status == "" {
		status = "OPEN"
	}
	for _, p := range s.Positions {
		if p.TenantID == id.TenantID && (f.AccountID == "" || p.AccountID == f.AccountID) && (f.Symbol == "" || p.Symbol == f.Symbol) && (f.Side == "" || p.Side == f.Side) && (status == "ALL" || p.Status == status) && brokerSearch(f.Search, p.Symbol, s.Accounts[p.AccountID].AccountNumber) && brokerTimeFilter(p.OpenedAt, f) {
			rows = append(rows, p.Clone())
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].OpenedAt.Equal(rows[j].OpenedAt) {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].OpenedAt.After(rows[j].OpenedAt)
	})
	return rows
}
func brokerOrders(s *domain.State, id domain.Identity, f BrokerFilter) []domain.Order {
	rows := []domain.Order{}
	for _, o := range s.Orders {
		if o.TenantID == id.TenantID && (f.AccountID == "" || o.AccountID == f.AccountID) && (f.Symbol == "" || o.Symbol == f.Symbol) && (f.Side == "" || o.Side == f.Side) && (f.Status == "" || f.Status == "ALL" || o.Status == f.Status) && brokerSearch(f.Search, o.Symbol, o.ClientOrderID, s.Accounts[o.AccountID].AccountNumber) && brokerTimeFilter(o.CreatedAt, f) {
			rows = append(rows, o.Clone())
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].CreatedAt.Equal(rows[j].CreatedAt) {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].CreatedAt.After(rows[j].CreatedAt)
	})
	return rows
}
func brokerFills(s *domain.State, id domain.Identity, f BrokerFilter) []domain.Fill {
	rows := []domain.Fill{}
	for _, fill := range s.Fills {
		if fill.TenantID == id.TenantID && (f.AccountID == "" || fill.AccountID == f.AccountID) && (f.Symbol == "" || fill.Symbol == f.Symbol) && (f.Side == "" || fill.Side == f.Side) && brokerSearch(f.Search, fill.Symbol, fill.ExecutionReason, s.Accounts[fill.AccountID].AccountNumber) && brokerTimeFilter(fill.CreatedAt, f) {
			rows = append(rows, fill)
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].CreatedAt.Equal(rows[j].CreatedAt) {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].CreatedAt.After(rows[j].CreatedAt)
	})
	return rows
}
func brokerTransactions(s *domain.State, id domain.Identity, f BrokerFilter) []domain.Transaction {
	rows := []domain.Transaction{}
	for _, tx := range s.Transactions {
		if tx.TenantID == id.TenantID && (f.AccountID == "" || tx.AccountID == f.AccountID) && (f.Status == "" || tx.Type == f.Status) && brokerSearch(f.Search, tx.Reference, tx.Reason, tx.Type, s.Accounts[tx.AccountID].AccountNumber) && brokerTimeFilter(tx.CreatedAt, f) {
			rows = append(rows, tx)
		}
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CreatedAt.After(rows[j].CreatedAt) })
	return rows
}
func brokerAudit(s *domain.State, id domain.Identity, f BrokerFilter) []domain.Event {
	rows := []domain.Event{}
	for i := len(s.Events) - 1; i >= 0; i-- {
		event := s.Events[i]
		if event.TenantID == id.TenantID && event.AggregateType == "broker_admin" && (f.AccountID == "" || event.AccountID == f.AccountID) && (f.Before == 0 || event.Sequence < f.Before) && (f.Status == "" || event.Type == f.Status) && brokerSearch(f.Search, event.Type, event.AggregateID, event.ActorUserID) && brokerTimeFilter(event.OccurredAt, f) {
			event.Payload = append([]byte(nil), event.Payload...)
			rows = append(rows, event)
		}
	}
	return brokerLimit(rows, f)
}
func brokerExposures(s *domain.State, id domain.Identity, f BrokerFilter) []BrokerExposure {
	bySymbol := map[string]BrokerExposure{}
	owners := map[string]map[string]bool{}
	for _, p := range brokerPositions(s, id, BrokerFilter{AccountID: f.AccountID, Symbol: f.Symbol, Side: f.Side, Status: "OPEN", Search: f.Search}) {
		row := bySymbol[p.Symbol]
		row.Symbol = p.Symbol
		i := s.Instruments[domain.MarketKey(id.TenantID, p.Symbol)]
		contract := i.ContractSize
		currency := i.QuoteCurrency
		if p.Economics != nil {
			contract = p.Economics.ContractSize
			currency = p.Economics.QuoteCurrency
		}
		row.NotionalCurrency = currency
		notional := p.Quantity.Mul(contract).Mul(p.CurrentPrice)
		if p.Side == "BUY" {
			row.LongQuantity = row.LongQuantity.Add(p.Quantity)
			row.LongNotional = row.LongNotional.Add(notional)
			row.LongPositions++
		} else {
			row.ShortQuantity = row.ShortQuantity.Add(p.Quantity)
			row.ShortNotional = row.ShortNotional.Add(notional)
			row.ShortPositions++
		}
		row.UnrealizedClientPnL = row.UnrealizedClientPnL.Add(p.UnrealizedPnL)
		if owners[p.Symbol] == nil {
			owners[p.Symbol] = map[string]bool{}
		}
		owners[p.Symbol][p.AccountID] = true
		row.Accounts = len(owners[p.Symbol])
		row.NetQuantity = row.LongQuantity.Sub(row.ShortQuantity)
		row.NetNotional = row.LongNotional.Sub(row.ShortNotional)
		bySymbol[p.Symbol] = row
	}
	rows := []BrokerExposure{}
	for _, row := range bySymbol {
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		switch f.Sort {
		case "net":
			return rows[i].NetQuantity.Abs().GreaterThan(rows[j].NetQuantity.Abs())
		case "pnl":
			return rows[i].UnrealizedClientPnL.LessThan(rows[j].UnrealizedClientPnL)
		default:
			return rows[i].Symbol < rows[j].Symbol
		}
	})
	return rows
}
func brokerRiskAccounts(s *domain.State, id domain.Identity, f BrokerFilter, members []BrokerMember) []BrokerRiskAccount {
	rows := []BrokerRiskAccount{}
	for _, a := range brokerAccounts(s, id, BrokerFilter{AccountID: f.AccountID, Search: f.Search}, members) {
		row := BrokerRiskAccount{Account: a, RiskStatus: a.MarginStatus}
		if row.RiskStatus == "STOP_OUT_REQUIRED" {
			row.RiskStatus = "STOP_OUT"
		}
		member, _ := brokerMember(members, id.TenantID, a.UserID)
		row.ClientEmail = member.Email
		for _, p := range s.Positions {
			if p.AccountID == a.ID && p.TenantID == id.TenantID && p.Status == "OPEN" {
				row.OpenPositions++
			}
		}
		if a.Equity.IsPositive() {
			row.MarginUtilization = a.MarginUsed.Mul(domain.D("100")).DivRound(a.Equity, 8)
		}
		if f.Status == "" || row.RiskStatus == f.Status {
			rows = append(rows, row)
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		a, b := rows[i].Account, rows[j].Account
		if f.Sort == "loss" {
			return a.UnrealizedPnL.LessThan(b.UnrealizedPnL)
		}
		if f.Sort == "utilization" {
			return rows[i].MarginUtilization.GreaterThan(rows[j].MarginUtilization)
		}
		if a.MarginUsed.IsPositive() != b.MarginUsed.IsPositive() {
			return a.MarginUsed.IsPositive()
		}
		if a.MarginLevel.Equal(b.MarginLevel) {
			return a.AccountNumber < b.AccountNumber
		}
		return a.MarginLevel.LessThan(b.MarginLevel)
	})
	return rows
}
func brokerDashboard(s *domain.State, id domain.Identity, members []BrokerMember) BrokerDashboard {
	result := BrokerDashboard{ExecutionMode: "SIMULATED_INTERNAL", Currency: "USD", Clients: len(brokerClients(s, id, BrokerFilter{}, members)), Exposure: brokerExposures(s, id, BrokerFilter{Sort: "net"}), RecentActions: brokerAudit(s, id, BrokerFilter{Limit: 8}), UpdatedAt: time.Now().UTC()}
	for _, a := range s.Accounts {
		if a.TenantID != id.TenantID {
			continue
		}
		if a.Status == "ACTIVE" {
			result.ActiveAccounts++
		}
		result.TotalBalance = result.TotalBalance.Add(a.Balance)
		result.TotalEquity = result.TotalEquity.Add(a.Equity)
		result.ClientFloatingPnL = result.ClientFloatingPnL.Add(a.UnrealizedPnL)
		if a.MarginStatus == "MARGIN_CALL" || a.MarginStatus == "STOP_OUT" || a.MarginStatus == "STOP_OUT_REQUIRED" {
			result.MarginCallAccounts++
		}
	}
	result.OpenPositions = len(brokerPositions(s, id, BrokerFilter{}))
	result.PendingOrders = len(brokerOrders(s, id, BrokerFilter{Status: "ACCEPTED"}))
	if len(result.Exposure) > 8 {
		result.Exposure = result.Exposure[:8]
	}
	return result
}
