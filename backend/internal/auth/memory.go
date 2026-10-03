package auth

import (
	"context"
	"sort"
	"sync"
	"time"
)

// MemoryRepository is for explicit ephemeral development and isolated tests only.
type MemoryRepository struct {
	mu       sync.Mutex
	users    map[string]User
	sessions map[string]Session
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{users: map[string]User{}, sessions: map[string]Session{}}
}
func (m *MemoryRepository) CreateUser(_ context.Context, u User, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, v := range m.users {
		if v.Email == u.Email {
			return ErrExists
		}
	}
	m.users[u.ID] = u
	return nil
}
func (m *MemoryRepository) UserByEmail(_ context.Context, email string) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.Email == email {
			return u, nil
		}
	}
	return User{}, ErrCredentials
}
func (m *MemoryRepository) PutSession(_ context.Context, s Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[s.Hash] = s
	return nil
}
func (m *MemoryRepository) SessionUser(_ context.Context, hash string, now time.Time) (User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[hash]
	if !ok || !s.ExpiresAt.After(now) {
		return User{}, ErrSession
	}
	u := m.users[s.UserID]
	if u.Status != "ACTIVE" {
		return User{}, ErrSession
	}
	return u, nil
}
func (m *MemoryRepository) DeleteSession(_ context.Context, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, hash)
	return nil
}

func (m *MemoryRepository) TenantMembers(_ context.Context, tenantID string) ([]User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := []User{}
	for _, user := range m.users {
		if user.TenantID != tenantID {
			continue
		}
		user.PasswordHash = ""
		result = append(result, user)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Email < result[j].Email })
	return result, nil
}
