package workspaces

import (
	"context"
	"sync"
	"testing"

	"azuriya/backend/internal/domain"
)

func testService() (*Service, *MemoryRepository, domain.Identity, domain.State) {
	state := domain.Seed("tenant-workspaces", "owner")
	repo := NewMemoryRepository()
	return New(repo, func() domain.State { return state.Clone() }), repo, domain.Identity{TenantID: "tenant-workspaces", UserID: "owner"}, state
}
func TestDefaultCreateUpdateDuplicateResetAndDeleteLast(t *testing.T) {
	ctx := context.Background()
	service, _, id, _ := testService()
	items, err := service.List(ctx, id)
	if err != nil || len(items) != 1 {
		t.Fatal("default workspace missing", err)
	}
	original := items[0]
	if original.Layout != "SINGLE" || len(original.ChartPanes) != 4 || original.SelectedSymbol != "EURUSD" {
		t.Fatal("default not usable")
	}
	name := "London session"
	layout := "GRID_4"
	updated, err := service.Update(ctx, id, original.ID, Patch{Name: &name, Layout: &layout, Revision: &original.Revision})
	if err != nil || updated.Name != name || updated.Revision != 2 {
		t.Fatal("workspace update failed", err)
	}
	copy, err := service.Duplicate(ctx, id, original.ID, "")
	if err != nil || copy.ID == original.ID || copy.Layout != "GRID_4" || copy.Revision != 1 {
		t.Fatal("duplicate invalid", err)
	}
	reset, err := service.Reset(ctx, id, copy.ID)
	if err != nil || reset.Layout != "SINGLE" || reset.ID != copy.ID || reset.Name != copy.Name {
		t.Fatal("reset lost identity", err)
	}
	items, err = service.Delete(ctx, id, original.ID)
	if err != nil || len(items) != 1 || items[0].ID != copy.ID {
		t.Fatal("delete damaged surviving workspace", err)
	}
	items, err = service.Delete(ctx, id, copy.ID)
	if err != nil || len(items) != 1 || items[0].ID == copy.ID {
		t.Fatal("last deletion did not atomically provide replacement", err)
	}
	events, err := service.Events(ctx, id, 100)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]bool{}
	for _, event := range events {
		kinds[event.Type] = true
		if event.UserID != id.UserID || event.TenantID != id.TenantID {
			t.Fatal("workspace audit actor missing")
		}
	}
	for _, kind := range []string{"WORKSPACE_CREATED", "WORKSPACE_UPDATED", "WORKSPACE_DUPLICATED", "WORKSPACE_RESET", "WORKSPACE_DELETED"} {
		if !kinds[kind] {
			t.Fatalf("missing audit %s", kind)
		}
	}
}
func TestWorkspaceTenantOwnershipAndAccountSelection(t *testing.T) {
	ctx := context.Background()
	service, repo, id, state := testService()
	items, _ := service.List(ctx, id)
	workspaceID := items[0].ID
	for _, foreign := range []domain.Identity{{TenantID: "other-tenant", UserID: id.UserID}, {TenantID: id.TenantID, UserID: "another-owner", Role: "ADMIN"}} {
		if _, err := service.Get(ctx, foreign, workspaceID); err == nil {
			t.Fatal("foreign workspace disclosed")
		}
		if _, err := service.Update(ctx, foreign, workspaceID, Patch{}); err == nil {
			t.Fatal("foreign workspace modified")
		}
		if _, err := service.Delete(ctx, foreign, workspaceID); err == nil {
			t.Fatal("foreign workspace deleted")
		}
		events, _ := repo.Events(ctx, foreign, 100)
		if len(events) != 0 {
			t.Fatal("foreign workspace audit exposed")
		}
	}
	account := domain.NewAccount(id.TenantID, "another-owner", "BROKER_DEMO")
	state.Accounts[account.ID] = account
	service.snapshot = func() domain.State { return state.Clone() }
	if _, err := service.Update(ctx, id, workspaceID, Patch{SelectedAccount: &account.ID}); err == nil {
		t.Fatal("selected foreign account accepted")
	}
	if _, err := service.List(ctx, domain.Identity{}); err == nil {
		t.Fatal("anonymous workspace owner accepted")
	}
}
func TestWorkspaceValidationRevisionConflictAndConcurrentDefault(t *testing.T) {
	ctx := context.Background()
	service, _, id, _ := testService()
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := service.List(ctx, id); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	items, err := service.List(ctx, id)
	if err != nil || len(items) != 1 {
		t.Fatal("concurrent default creation duplicated workspaces")
	}
	w := items[0]
	name := "Saved"
	if _, err = service.Update(ctx, id, w.ID, Patch{Name: &name, Revision: &w.Revision}); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Update(ctx, id, w.ID, Patch{Name: &name, Revision: &w.Revision}); err == nil {
		t.Fatal("stale revision overwrote newer state")
	}
	invalidName := " "
	invalidLayout := "SIXTEEN"
	badPanes := []Pane{{ID: "one", Symbol: "FOREIGN", Interval: "1m"}}
	badWatchlist := w.Watchlist
	badWatchlist.Symbols = []string{"EURUSD", "EURUSD"}
	badTicket := w.OrderTicket
	badTicket.Quantity = "1e999999"
	for _, patch := range []Patch{{Name: &invalidName}, {Layout: &invalidLayout}, {ChartPanes: &badPanes}, {Watchlist: &badWatchlist}, {OrderTicket: &badTicket}} {
		if _, err := service.Update(ctx, id, w.ID, patch); err == nil {
			t.Fatal("invalid workspace patch accepted")
		}
	}
	current, _ := service.Get(ctx, id, w.ID)
	if current.Name != name || current.Revision != 2 {
		t.Fatal("rejected change mutated canonical workspace")
	}
}
