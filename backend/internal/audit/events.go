package audit

import (
	"azuriya/backend/internal/domain"
	"encoding/json"
	"time"
)

func Append(s *domain.State, tenantID, accountID, aggregateType, aggregateID, eventType string, payload any, now time.Time) domain.Event {
	encoded, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	s.Sequence++
	e := domain.Event{ID: domain.NewID(), TenantID: tenantID, AccountID: accountID, AggregateType: aggregateType, AggregateID: aggregateID, Sequence: s.Sequence, Type: eventType, Payload: encoded, OccurredAt: now}
	if a, ok := s.Accounts[accountID]; ok {
		e.UserID = a.UserID
	}
	s.Events = append(s.Events, e)
	return e
}
