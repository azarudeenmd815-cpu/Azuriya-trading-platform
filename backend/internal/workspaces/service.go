package workspaces

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"azuriya/backend/internal/domain"
)

const MaximumWorkspaces = 20

type Service struct {
	repo     Repository
	snapshot func() domain.State
}

func New(repo Repository, snapshot func() domain.State) *Service {
	return &Service{repo: repo, snapshot: snapshot}
}

func validIdentity(id domain.Identity) error {
	if id.UserID == "" || id.TenantID == "" {
		return domain.Err("UNAUTHENTICATED", "An authenticated workspace owner is required")
	}
	return nil
}
func event(id domain.Identity, w Workspace, kind string) Event {
	payload, err := json.Marshal(w)
	if err != nil {
		panic(err)
	}
	return Event{ID: domain.NewID(), TenantID: id.TenantID, UserID: id.UserID, WorkspaceID: w.ID, Type: kind, Payload: payload, OccurredAt: w.UpdatedAt}
}
func find(items []Workspace, workspaceID string) (int, error) {
	for index, w := range items {
		if w.ID == workspaceID {
			return index, nil
		}
	}
	return -1, domain.Err("WORKSPACE_NOT_FOUND", "Workspace not found")
}
func newest(items []Workspace) []Workspace {
	sort.Slice(items, func(i, j int) bool {
		if items[i].UpdatedAt.Equal(items[j].UpdatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].UpdatedAt.After(items[j].UpdatedAt)
	})
	return items
}
func (s *Service) List(ctx context.Context, id domain.Identity) ([]Workspace, error) {
	if err := validIdentity(id); err != nil {
		return nil, err
	}
	items, err := s.repo.List(ctx, id)
	if err != nil {
		return nil, err
	}
	if len(items) > 0 {
		return newest(items), nil
	}
	items, err = s.repo.Mutate(ctx, id, func(items []Workspace) ([]Workspace, []Event, error) {
		if len(items) > 0 {
			return items, nil, nil
		}
		w, err := s.defaults(id)
		if err != nil {
			return nil, nil, err
		}
		return []Workspace{w}, []Event{event(id, w, "WORKSPACE_CREATED")}, nil
	})
	return newest(items), err
}
func (s *Service) Get(ctx context.Context, id domain.Identity, workspaceID string) (Workspace, error) {
	if err := validIdentity(id); err != nil {
		return Workspace{}, err
	}
	items, err := s.repo.List(ctx, id)
	if err != nil {
		return Workspace{}, err
	}
	index, err := find(items, workspaceID)
	if err != nil {
		return Workspace{}, err
	}
	return items[index], nil
}
func (s *Service) Create(ctx context.Context, id domain.Identity, patch Patch) (Workspace, error) {
	if err := validIdentity(id); err != nil {
		return Workspace{}, err
	}
	var result Workspace
	_, err := s.repo.Mutate(ctx, id, func(items []Workspace) ([]Workspace, []Event, error) {
		if len(items) >= MaximumWorkspaces {
			return nil, nil, domain.Err("WORKSPACE_LIMIT", "A maximum of 20 workspaces is supported")
		}
		w, err := s.defaults(id)
		if err != nil {
			return nil, nil, err
		}
		apply(&w, patch)
		if err = s.validate(id, &w); err != nil {
			return nil, nil, err
		}
		result = w
		return append(items, w), []Event{event(id, w, "WORKSPACE_CREATED")}, nil
	})
	return result, err
}
func (s *Service) Update(ctx context.Context, id domain.Identity, workspaceID string, patch Patch) (Workspace, error) {
	if err := validIdentity(id); err != nil {
		return Workspace{}, err
	}
	var result Workspace
	_, err := s.repo.Mutate(ctx, id, func(items []Workspace) ([]Workspace, []Event, error) {
		index, err := find(items, workspaceID)
		if err != nil {
			return nil, nil, err
		}
		w := items[index]
		if patch.Revision != nil && *patch.Revision != w.Revision {
			return nil, nil, domain.Err("WORKSPACE_CONFLICT", "Workspace changed in another session. Reload before saving.")
		}
		apply(&w, patch)
		if err = s.validate(id, &w); err != nil {
			return nil, nil, err
		}
		w.Revision++
		w.UpdatedAt = time.Now().UTC()
		items[index] = w
		result = w
		return items, []Event{event(id, w, "WORKSPACE_UPDATED")}, nil
	})
	return result, err
}
func (s *Service) Duplicate(ctx context.Context, id domain.Identity, workspaceID, name string) (Workspace, error) {
	if err := validIdentity(id); err != nil {
		return Workspace{}, err
	}
	var result Workspace
	_, err := s.repo.Mutate(ctx, id, func(items []Workspace) ([]Workspace, []Event, error) {
		if len(items) >= MaximumWorkspaces {
			return nil, nil, domain.Err("WORKSPACE_LIMIT", "A maximum of 20 workspaces is supported")
		}
		index, err := find(items, workspaceID)
		if err != nil {
			return nil, nil, err
		}
		w := Clone(items[index : index+1])[0]
		w.ID = domain.NewID()
		if name == "" {
			name = w.Name + " copy"
		}
		w.Name = name
		w.CreatedAt = time.Now().UTC()
		w.UpdatedAt = w.CreatedAt
		w.Revision = 1
		if err = s.validate(id, &w); err != nil {
			return nil, nil, err
		}
		result = w
		return append(items, w), []Event{event(id, w, "WORKSPACE_DUPLICATED")}, nil
	})
	return result, err
}
func (s *Service) Reset(ctx context.Context, id domain.Identity, workspaceID string) (Workspace, error) {
	if err := validIdentity(id); err != nil {
		return Workspace{}, err
	}
	var result Workspace
	_, err := s.repo.Mutate(ctx, id, func(items []Workspace) ([]Workspace, []Event, error) {
		index, err := find(items, workspaceID)
		if err != nil {
			return nil, nil, err
		}
		old := items[index]
		w, err := s.defaults(id)
		if err != nil {
			return nil, nil, err
		}
		w.ID = old.ID
		w.Name = old.Name
		w.CreatedAt = old.CreatedAt
		w.Revision = old.Revision + 1
		items[index] = w
		result = w
		return items, []Event{event(id, w, "WORKSPACE_RESET")}, nil
	})
	return result, err
}
func (s *Service) Delete(ctx context.Context, id domain.Identity, workspaceID string) ([]Workspace, error) {
	if err := validIdentity(id); err != nil {
		return nil, err
	}
	items, err := s.repo.Mutate(ctx, id, func(items []Workspace) ([]Workspace, []Event, error) {
		index, err := find(items, workspaceID)
		if err != nil {
			return nil, nil, err
		}
		deleted := items[index]
		deleted.UpdatedAt = time.Now().UTC()
		items = append(items[:index], items[index+1:]...)
		events := []Event{event(id, deleted, "WORKSPACE_DELETED")}
		if len(items) == 0 {
			w, err := s.defaults(id)
			if err != nil {
				return nil, nil, err
			}
			items = append(items, w)
			events = append(events, event(id, w, "WORKSPACE_CREATED"))
		}
		return items, events, nil
	})
	return newest(items), err
}
func (s *Service) Events(ctx context.Context, id domain.Identity, limit int) ([]Event, error) {
	if err := validIdentity(id); err != nil {
		return nil, err
	}
	if limit < 1 || limit > 1000 {
		return nil, domain.Err("INVALID_PAGINATION", "limit must be 1 to 1000")
	}
	return s.repo.Events(ctx, id, limit)
}
