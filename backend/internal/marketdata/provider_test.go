package marketdata_test

import (
	"azuriya/backend/internal/domain"
	"azuriya/backend/internal/marketdata"
	"context"
	"testing"
)

func TestSimulatorDeterministicWalkAndSpread(t *testing.T) {
	s := domain.Seed("tenant", "user")
	i := s.Instruments[domain.MarketKey("tenant", "EURUSD")]
	one := marketdata.NewSimulator(42)
	two := marketdata.NewSimulator(42)
	one.SpreadTicks = 20
	two.SpreadTicks = 20
	q1 := s.Quotes[domain.MarketKey("tenant", "EURUSD")]
	q2 := q1
	for n := 0; n < 100; n++ {
		var err error
		q1, err = one.Next(context.Background(), i, q1)
		if err != nil {
			t.Fatal(err)
		}
		q2, err = two.Next(context.Background(), i, q2)
		if err != nil {
			t.Fatal(err)
		}
		if !q1.Bid.Equal(q2.Bid) || !q1.Ask.Equal(q2.Ask) || q1.Sequence != uint64(n+2) {
			t.Fatal("deterministic stream diverged")
		}
		if !q1.Ask.Sub(q1.Bid).Equal(domain.D("0.00020")) {
			t.Fatal("configured spread was not applied")
		}
	}
}
