package workspaces

import (
	"regexp"
	"sort"
	"strings"
	"time"

	"azuriya/backend/internal/domain"
)

var preferenceNumber = regexp.MustCompile(`^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,10})?$`)
var intervals = map[string]bool{"1s": true, "5s": true, "15s": true, "30s": true, "1m": true, "3m": true, "5m": true, "15m": true, "30m": true, "1h": true, "4h": true, "1D": true}

func (s *Service) defaults(id domain.Identity) (Workspace, error) {
	state := s.snapshot()
	accounts := []domain.Account{}
	symbols := []string{}
	for _, a := range state.Accounts {
		if a.TenantID == id.TenantID && a.UserID == id.UserID {
			accounts = append(accounts, a)
		}
	}
	if len(accounts) == 0 {
		return Workspace{}, domain.Err("ACCOUNT_NOT_FOUND", "An owned trading account is required for a workspace")
	}
	sort.Slice(accounts, func(i, j int) bool { return accounts[i].AccountNumber < accounts[j].AccountNumber })
	for _, instrument := range state.Instruments {
		if instrument.TenantID == id.TenantID {
			symbols = append(symbols, instrument.Symbol)
		}
	}
	sort.Strings(symbols)
	if len(symbols) == 0 {
		return Workspace{}, domain.Err("INSTRUMENT_NOT_FOUND", "Workspace instruments are unavailable")
	}
	preferred := []string{"EURUSD", "GBPUSD", "XAUUSD", "BTCUSD"}
	panes := []Pane{}
	for index, symbol := range preferred {
		if _, ok := state.Instruments[domain.MarketKey(id.TenantID, symbol)]; !ok {
			symbol = symbols[index%len(symbols)]
		}
		panes = append(panes, Pane{ID: []string{"chart-1", "chart-2", "chart-3", "chart-4"}[index], Symbol: symbol, Interval: "1m"})
	}
	now := time.Now().UTC()
	return Workspace{ID: domain.NewID(), TenantID: id.TenantID, UserID: id.UserID, Name: "Trading workspace", Layout: "SINGLE", SelectedAccount: accounts[0].ID, ChartPanes: panes, SelectedChart: panes[0].ID, SelectedSymbol: panes[0].Symbol, SelectedInterval: panes[0].Interval, Panels: Panels{Markets: true, Ticket: true, Bottom: true, MarketsWidth: 260, TicketWidth: 300, BottomHeight: 280}, Watchlist: Watchlist{Symbols: symbols, Favorites: []string{}, Category: "ALL"}, OrderTicket: Ticket{QuantityMode: "LOTS", RiskMode: "PERCENT", Quantity: "0.10", RiskValue: "0.50", ProtectionMode: "PRICE", ShowAsk: true}, Revision: 1, CreatedAt: now, UpdatedAt: now}, nil
}
func apply(w *Workspace, p Patch) {
	if p.Name != nil {
		w.Name = *p.Name
	}
	if p.Layout != nil {
		w.Layout = *p.Layout
	}
	if p.SelectedAccount != nil {
		w.SelectedAccount = *p.SelectedAccount
	}
	if p.ChartPanes != nil {
		w.ChartPanes = *p.ChartPanes
	}
	if p.SelectedChart != nil {
		w.SelectedChart = *p.SelectedChart
	}
	if p.SelectedSymbol != nil {
		w.SelectedSymbol = *p.SelectedSymbol
	}
	if p.SelectedInterval != nil {
		w.SelectedInterval = *p.SelectedInterval
	}
	if p.Panels != nil {
		w.Panels = *p.Panels
	}
	if p.Watchlist != nil {
		w.Watchlist = *p.Watchlist
	}
	if p.Sync != nil {
		w.Sync = *p.Sync
	}
	if p.OrderTicket != nil {
		w.OrderTicket = *p.OrderTicket
	}
}
func (s *Service) validate(id domain.Identity, w *Workspace) error {
	w.Name = strings.TrimSpace(w.Name)
	if len(w.Name) < 1 || len(w.Name) > 80 {
		return domain.Err("INVALID_WORKSPACE_NAME", "Workspace name must contain 1 to 80 characters")
	}
	counts := map[string]int{"SINGLE": 1, "TWO_VERTICAL": 2, "TWO_HORIZONTAL": 2, "GRID_4": 4}
	count, ok := counts[w.Layout]
	if !ok {
		return domain.Err("INVALID_WORKSPACE_LAYOUT", "Unsupported chart layout")
	}
	state := s.snapshot()
	a, ok := state.Accounts[w.SelectedAccount]
	if !ok || a.TenantID != id.TenantID || a.UserID != id.UserID {
		return domain.Err("ACCOUNT_NOT_FOUND", "Selected account is not owned by this user")
	}
	if len(w.ChartPanes) < count || len(w.ChartPanes) > 16 {
		return domain.Err("INVALID_CHART_PANES", "Provide enough chart panes for the selected layout, up to 16")
	}
	seen := map[string]bool{}
	selected := false
	for index, pane := range w.ChartPanes {
		if len(pane.ID) < 1 || len(pane.ID) > 64 || seen[pane.ID] {
			return domain.Err("INVALID_CHART_PANES", "Chart identifiers must be unique and nonempty")
		}
		seen[pane.ID] = true
		if _, ok := state.Instruments[domain.MarketKey(id.TenantID, pane.Symbol)]; !ok {
			return domain.Err("INSTRUMENT_NOT_FOUND", "Chart instrument is not available in this tenant")
		}
		if !intervals[pane.Interval] {
			return domain.Err("INVALID_INTERVAL", "Unsupported chart interval")
		}
		if pane.ID == w.SelectedChart {
			if index >= count {
				w.SelectedChart = w.ChartPanes[0].ID
			} else {
				selected = true
				w.SelectedSymbol = pane.Symbol
				w.SelectedInterval = pane.Interval
			}
		}
	}
	if !selected {
		w.SelectedChart = w.ChartPanes[0].ID
		w.SelectedSymbol = w.ChartPanes[0].Symbol
		w.SelectedInterval = w.ChartPanes[0].Interval
	}
	if w.Panels.MarketsWidth < 160 || w.Panels.MarketsWidth > 600 || w.Panels.TicketWidth < 240 || w.Panels.TicketWidth > 600 || w.Panels.BottomHeight < 100 || w.Panels.BottomHeight > 700 {
		return domain.Err("INVALID_PANEL_SIZE", "Panel sizes are outside supported bounds")
	}
	for _, list := range [][]string{w.Watchlist.Symbols, w.Watchlist.Favorites} {
		if len(list) > 100 {
			return domain.Err("INVALID_WATCHLIST", "A watchlist supports up to 100 instruments")
		}
		seenSymbols := map[string]bool{}
		for _, symbol := range list {
			if _, ok := state.Instruments[domain.MarketKey(id.TenantID, symbol)]; !ok || seenSymbols[symbol] {
				return domain.Err("INVALID_WATCHLIST", "Watchlist symbols must be unique tenant instruments")
			}
			seenSymbols[symbol] = true
		}
	}
	if !map[string]bool{"ALL": true, "All": true, "Favorites": true, "FOREX": true, "FX": true, "METAL": true, "Metals": true, "INDEX": true, "Indices": true, "CRYPTO": true, "Crypto": true}[w.Watchlist.Category] {
		return domain.Err("INVALID_WATCHLIST", "Unsupported watchlist category")
	}
	t := w.OrderTicket
	if (t.QuantityMode != "LOTS" && t.QuantityMode != "RISK") || (t.RiskMode != "PERCENT" && t.RiskMode != "AMOUNT") || (t.ProtectionMode != "PRICE" && t.ProtectionMode != "DISTANCE") || !preferenceNumber.MatchString(t.Quantity) || !preferenceNumber.MatchString(t.RiskValue) {
		return domain.Err("INVALID_TICKET_PREFERENCES", "Unsupported ticket preferences or decimal input")
	}
	if w.Watchlist.Symbols == nil {
		w.Watchlist.Symbols = []string{}
	}
	if w.Watchlist.Favorites == nil {
		w.Watchlist.Favorites = []string{}
	}
	return nil
}
