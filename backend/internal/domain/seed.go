package domain

import "time"

func NewAccount(tenantID, userID, mode string) Account {
	now := time.Now().UTC()
	id := NewID()
	return Account{ID: id, TenantID: tenantID, UserID: userID, AccountNumber: "AZ-" + id[:8], Name: "Azuriya Demo", Mode: mode, Status: "ACTIVE", Currency: "USD", PositionMode: "HEDGING", Balance: D("100000"), Equity: D("100000"), MarginFree: D("100000"), MarginStatus: "NORMAL", Leverage: D("100"), CreatedAt: now, UpdatedAt: now}
}

func Seed(tenantID, userID string) State {
	s := EmptyState()
	a := NewAccount(tenantID, userID, "BROKER_DEMO")
	s.Accounts[a.ID] = a
	s.Transactions = append(s.Transactions, Transaction{ID: NewID(), TenantID: tenantID, AccountID: a.ID, Type: "INITIAL_BALANCE", Amount: a.Balance, BalanceAfter: a.Balance, Currency: a.Currency, CreatedAt: a.CreatedAt})
	SeedMarkets(&s, tenantID)
	return s
}

func SeedMarkets(s *State, tenantID string) {
	rows := []struct {
		symbol, name, asset, base, quote, tick, contract, min, max, step, leverage, bid, ask string
		digits                                                                               int32
	}{
		{"EURUSD", "Euro / US Dollar", "FOREX", "EUR", "USD", "0.00001", "100000", "0.01", "100", "0.01", "100", "1.08450", "1.08462", 5},
		{"GBPUSD", "Pound / US Dollar", "FOREX", "GBP", "USD", "0.00001", "100000", "0.01", "100", "0.01", "100", "1.27120", "1.27136", 5},
		{"USDJPY", "US Dollar / Japanese Yen", "FOREX", "USD", "JPY", "0.001", "100000", "0.01", "100", "0.01", "100", "149.850", "149.864", 3},
		{"XAUUSD", "Gold / US Dollar", "METAL", "XAU", "USD", "0.01", "100", "0.01", "100", "0.01", "100", "2648.20", "2648.55", 2},
		{"US100", "US Tech 100", "INDEX", "US100", "USD", "0.1", "1", "0.1", "1000", "0.1", "50", "19942.5", "19944.0", 1},
		{"BTCUSD", "Bitcoin / US Dollar", "CRYPTO", "BTC", "USD", "0.01", "1", "0.01", "100", "0.01", "10", "63480.00", "63498.00", 2},
	}
	for _, r := range rows {
		key := MarketKey(tenantID, r.symbol)
		if _, ok := s.Instruments[key]; ok {
			continue
		}
		s.Instruments[key] = Instrument{ID: NewID(), TenantID: tenantID, Symbol: r.symbol, DisplayName: r.name, AssetClass: r.asset, BaseCurrency: r.base, QuoteCurrency: r.quote, Digits: r.digits, TickSize: D(r.tick), ContractSize: D(r.contract), MinQuantity: D(r.min), MaxQuantity: D(r.max), QuantityStep: D(r.step), DefaultLeverage: D(r.leverage), TradingStatus: "OPEN"}
		s.Quotes[key] = Quote{TenantID: tenantID, Symbol: r.symbol, Bid: D(r.bid), Ask: D(r.ask), Sequence: 1, Timestamp: time.Now().UTC(), Simulated: true}
	}
}
