package engine

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/permissions"
	"bytes"
	"encoding/csv"
	"strconv"
	"strings"
	"time"
)

func csvSafe(cell string) string {
	trimmed := strings.TrimLeft(cell, " \t\r\n")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return "'" + cell
	}
	return cell
}
func (e *Engine) BrokerCSV(id domain.Identity, kind string, f BrokerFilter, members []BrokerMember) ([]byte, error) {
	if err := permissions.Require(id, "reports.read"); err != nil {
		return nil, err
	}
	if len(f.Search) > 200 || (!f.From.IsZero() && !f.To.IsZero() && !f.From.Before(f.To)) {
		return nil, domain.Err("INVALID_FILTER", "Invalid report filter")
	}
	e.mu.RLock()
	defer e.mu.RUnlock()
	s := &e.state
	if s.Broker.ClientStatuses[domain.MarketKey(id.TenantID, id.UserID)] == "SUSPENDED" {
		return nil, domain.Err("FORBIDDEN", "Membership is suspended")
	}
	var header []string
	rows := [][]string{}
	timestamp := func(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }
	switch kind {
	case "accounts":
		header = []string{"account_number", "name", "client_email", "mode", "status", "currency", "trading_group_id", "balance", "equity", "client_floating_pnl", "margin_used", "free_margin", "created_at"}
		for _, a := range brokerAccounts(s, id, f, members) {
			m, _ := brokerMember(members, id.TenantID, a.UserID)
			rows = append(rows, []string{a.AccountNumber, a.Name, m.Email, a.Mode, a.Status, a.Currency, a.TradingGroupID, a.Balance.String(), a.Equity.String(), a.UnrealizedPnL.String(), a.MarginUsed.String(), a.MarginFree.String(), timestamp(a.CreatedAt)})
		}
	case "fills":
		header = []string{"execution_id", "account_number", "symbol", "side", "quantity", "price", "commission", "reason", "execution_profile_id", "created_at"}
		for _, fill := range brokerFills(s, id, f) {
			rows = append(rows, []string{fill.ID, s.Accounts[fill.AccountID].AccountNumber, fill.Symbol, fill.Side, fill.Quantity.String(), fill.Price.String(), fill.Commission.String(), fill.ExecutionReason, fill.ExecutionProfileID, timestamp(fill.CreatedAt)})
		}
	case "transactions":
		header = []string{"transaction_id", "account_number", "type", "amount", "currency", "balance_after", "actor_user_id", "reason", "reference", "created_at"}
		for _, tx := range brokerTransactions(s, id, f) {
			rows = append(rows, []string{tx.ID, s.Accounts[tx.AccountID].AccountNumber, tx.Type, tx.Amount.String(), tx.Currency, tx.BalanceAfter.String(), tx.ActorUserID, tx.Reason, tx.Reference, timestamp(tx.CreatedAt)})
		}
	case "positions":
		header = []string{"position_id", "account_number", "symbol", "side", "quantity", "open_price", "current_price", "client_floating_pnl", "margin_used", "commission_paid", "swap_accrued", "opened_at"}
		for _, p := range brokerPositions(s, id, f) {
			rows = append(rows, []string{p.ID, s.Accounts[p.AccountID].AccountNumber, p.Symbol, p.Side, p.Quantity.String(), p.OpenPrice.String(), p.CurrentPrice.String(), p.UnrealizedPnL.String(), p.MarginUsed.String(), p.CommissionPaid.String(), p.SwapAccrued.String(), timestamp(p.OpenedAt)})
		}
	case "exposure":
		header = []string{"symbol", "long_quantity", "short_quantity", "net_quantity", "long_notional", "short_notional", "net_notional", "notional_currency", "client_floating_pnl", "accounts"}
		for _, row := range brokerExposures(s, id, f) {
			rows = append(rows, []string{row.Symbol, row.LongQuantity.String(), row.ShortQuantity.String(), row.NetQuantity.String(), row.LongNotional.String(), row.ShortNotional.String(), row.NetNotional.String(), row.NotionalCurrency, row.UnrealizedClientPnL.String(), strconv.Itoa(row.Accounts)})
		}
	default:
		return nil, domain.Err("NOT_FOUND", "Report type not found")
	}
	if len(rows) > 100000 {
		return nil, domain.Err("REPORT_TOO_LARGE", "Narrow the report filters to at most 100,000 rows")
	}
	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)
	_ = writer.Write(header)
	for _, row := range rows {
		for index, cell := range row {
			row[index] = csvSafe(cell)
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	return buffer.Bytes(), writer.Error()
}
