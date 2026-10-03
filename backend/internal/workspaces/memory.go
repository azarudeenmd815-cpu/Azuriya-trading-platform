package workspaces

import (
	"azuriya/backend/internal/domain"
	"context"
	"sync"
)

type MemoryRepository struct {
	mu     sync.Mutex
	items  map[string][]Workspace
	events map[string][]Event
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{items: map[string][]Workspace{}, events: map[string][]Event{}}
}
func ownerKey(id domain.Identity) string { return id.TenantID + ":" + id.UserID }
func (m *MemoryRepository) List(ctx context.Context, id domain.Identity) ([]Workspace, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return Clone(m.items[ownerKey(id)]), nil
}
func (m *MemoryRepository) Mutate(ctx context.Context, id domain.Identity, change Mutation) ([]Workspace, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	key := ownerKey(id)
	items, events, err := change(Clone(m.items[key]))
	if err != nil {
		return nil, err
	}
	m.items[key] = Clone(items)
	m.events[key] = append(m.events[key], events...)
	return Clone(items), nil
}
func (m *MemoryRepository) Events(ctx context.Context, id domain.Identity, limit int) ([]Event, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	events := m.events[ownerKey(id)]
	if len(events) > limit {
		events = events[len(events)-limit:]
	}
	result := make([]Event, len(events))
	for index, event := range events {
		event.Payload = append([]byte(nil), event.Payload...)
		result[index] = event
	}
	return result, nil
}
