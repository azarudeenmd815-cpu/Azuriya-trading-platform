package engine

import (
	"azuriya/backend/internal/audit"
	"azuriya/backend/internal/domain"
	"context"
	"testing"
	"time"
)

func TestRecentEventWindowPersistsAndPublishesBeforePruning(t *testing.T) {
	state := domain.EmptyState()
	for range domain.RecentEventLimit {
		audit.Append(&state, "tenant", "account", "account", "account", "ACCOUNT_EQUITY_UPDATED", map[string]string{"equity": "100000"}, time.Now())
	}
	persisted := false
	e := New(state, func(_ context.Context, candidate domain.State) error {
		if len(candidate.Events) != domain.RecentEventLimit+2 {
			t.Fatal("new audit records pruned before persistence")
		}
		persisted = true
		return nil
	})
	published := []domain.Event{}
	e.SetPublisher(func(event domain.Event) {
		if !persisted {
			t.Fatal("event published before persistence")
		}
		published = append(published, event)
	})
	err := e.change(context.Background(), func(s *domain.State) error {
		for range 2 {
			audit.Append(s, "tenant", "account", "account", "account", "ACCOUNT_EQUITY_UPDATED", map[string]string{"equity": "100001"}, time.Now())
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	snapshot := e.Snapshot()
	if len(snapshot.Events) != domain.RecentEventLimit || snapshot.Events[0].Sequence != 3 || snapshot.Sequence != domain.RecentEventLimit+2 {
		t.Fatal("recent window or global sequence incorrect")
	}
	if len(published) != 2 || published[0].Sequence != domain.RecentEventLimit+1 || published[1].Sequence != domain.RecentEventLimit+2 {
		t.Fatal("new notifications lost or reordered during pruning")
	}
}
