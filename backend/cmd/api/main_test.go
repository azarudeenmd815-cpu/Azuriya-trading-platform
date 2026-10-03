package main

import (
	"testing"

	"azuriya/backend/internal/domain"
)

func TestSimulatedAliasUsesSourcePricesWithConservativeTickAlignment(t *testing.T) {
	// A fresh random walk for an alias would break the broker-selected native
	// source, while nearest rounding could improve one executable side unfairly.
	instrument := domain.Instrument{TenantID: "tenant", Symbol: "EURUSD.DEMO", PriceSourceSymbol: "EURUSD", TickSize: domain.D("0.0001")}
	source := domain.Quote{TenantID: "tenant", Symbol: "EURUSD", Bid: domain.D("1.08457"), Ask: domain.D("1.08461"), Sequence: 50, Simulated: true}
	quote, err := simulatedAliasQuote(instrument, source, 12)
	if err != nil || quote.Symbol != "EURUSD.DEMO" || quote.Sequence != 12 || !quote.Bid.Equal(domain.D("1.0845")) || !quote.Ask.Equal(domain.D("1.0847")) || !quote.Simulated {
		t.Fatal("alias source or quantization failed", err, quote)
	}
	source.TenantID = "foreign"
	if _, err = simulatedAliasQuote(instrument, source, 13); err == nil {
		t.Fatal("alias accepted foreign source")
	}
	instrument.TickSize = domain.D("0")
	source.TenantID = "tenant"
	if _, err = simulatedAliasQuote(instrument, source, 13); err == nil {
		t.Fatal("alias accepted invalid tick size")
	}
}
