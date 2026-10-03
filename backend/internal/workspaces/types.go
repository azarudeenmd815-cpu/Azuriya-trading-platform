// Package workspaces owns trader UI preferences and their authenticated scope.
// Preferences never authorize trades or replace server-side trading validation.
package workspaces

import (
	"context"
	"encoding/json"
	"time"

	"azuriya/backend/internal/domain"
)

type Pane struct {
	ID       string `json:"id"`
	Symbol   string `json:"symbol"`
	Interval string `json:"interval"`
}
type Panels struct {
	Markets      bool `json:"markets"`
	Ticket       bool `json:"ticket"`
	Bottom       bool `json:"bottom"`
	MarketsWidth int  `json:"markets_width"`
	TicketWidth  int  `json:"ticket_width"`
	BottomHeight int  `json:"bottom_height"`
}
type Watchlist struct {
	Symbols   []string `json:"symbols"`
	Favorites []string `json:"favorites"`
	Category  string   `json:"category"`
	Compact   bool     `json:"compact"`
}
type Sync struct {
	Symbol   bool `json:"symbol"`
	Interval bool `json:"interval"`
}
type Ticket struct {
	QuantityMode   string `json:"quantity_mode"`
	RiskMode       string `json:"risk_mode"`
	Quantity       string `json:"quantity"`
	RiskValue      string `json:"risk_value"`
	ProtectionMode string `json:"protection_mode"`
	ShowAsk        bool   `json:"show_ask"`
}
type Workspace struct {
	ID               string    `json:"id"`
	TenantID         string    `json:"tenant_id"`
	UserID           string    `json:"user_id"`
	Name             string    `json:"name"`
	Layout           string    `json:"layout"`
	SelectedAccount  string    `json:"selected_account"`
	ChartPanes       []Pane    `json:"chart_panes"`
	SelectedChart    string    `json:"selected_chart"`
	SelectedSymbol   string    `json:"selected_symbol"`
	SelectedInterval string    `json:"selected_interval"`
	Panels           Panels    `json:"panels"`
	Watchlist        Watchlist `json:"watchlist"`
	Sync             Sync      `json:"sync"`
	OrderTicket      Ticket    `json:"order_ticket"`
	Revision         uint64    `json:"revision"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// Patch replaces specified top-level values. Nested preference objects are
// complete replacements. Revision, when supplied, prevents lost concurrent edits.
type Patch struct {
	Name             *string    `json:"name,omitempty"`
	Layout           *string    `json:"layout,omitempty"`
	SelectedAccount  *string    `json:"selected_account,omitempty"`
	ChartPanes       *[]Pane    `json:"chart_panes,omitempty"`
	SelectedChart    *string    `json:"selected_chart,omitempty"`
	SelectedSymbol   *string    `json:"selected_symbol,omitempty"`
	SelectedInterval *string    `json:"selected_interval,omitempty"`
	Panels           *Panels    `json:"panels,omitempty"`
	Watchlist        *Watchlist `json:"watchlist,omitempty"`
	Sync             *Sync      `json:"sync,omitempty"`
	OrderTicket      *Ticket    `json:"order_ticket,omitempty"`
	Revision         *uint64    `json:"revision,omitempty"`
}
type Event struct {
	ID          string          `json:"id"`
	TenantID    string          `json:"tenant_id"`
	UserID      string          `json:"user_id"`
	WorkspaceID string          `json:"workspace_id"`
	Type        string          `json:"event_type"`
	Payload     json.RawMessage `json:"payload"`
	OccurredAt  time.Time       `json:"occurred_at"`
}
type Mutation func([]Workspace) ([]Workspace, []Event, error)
type Repository interface {
	List(context.Context, domain.Identity) ([]Workspace, error)
	Mutate(context.Context, domain.Identity, Mutation) ([]Workspace, error)
	Events(context.Context, domain.Identity, int) ([]Event, error)
}

func Clone(items []Workspace) []Workspace {
	data, err := json.Marshal(items)
	if err != nil {
		panic(err)
	}
	result := []Workspace{}
	if err = json.Unmarshal(data, &result); err != nil {
		panic(err)
	}
	return result
}
