# Trading workspaces

Workspaces are server-owned preferences scoped to the authenticated tenant and user. They never own or change trading balances, orders, or positions. Changing or deleting a workspace only changes the terminal view.

## Stored configuration

Each workspace stores its name, selected account, layout, pane array, selected pane/symbol/interval, panel visibility and dimensions, watchlist ordering/favorites/category/compactness, symbol/interval synchronization, and ticket sizing/protection/ask-line preferences. Financial preference inputs remain decimal strings. Workspace timestamps and an integer revision support ordering and optimistic concurrency.

`SINGLE`, `TWO_VERTICAL` (side-by-side columns), `TWO_HORIZONTAL` (stacked rows), and `GRID_4` are implemented. Hidden pane configurations survive switching to a smaller layout. The selected pane controls the ticket symbol. Per-pane changes are independent unless the corresponding synchronization setting is enabled. Crosshair/time-range synchronization and additional layout sizes are future work.

Panel widths and bottom height are bounded server-side. Desktop handles support pointer resizing and keyboard arrows. At narrower widths the terminal stacks charts and enabled panels; toggles allow focusing on one area. Overflow is confined to scrollable ticket/table surfaces.

## Persistence and lifecycle

- `GET /api/v1/workspaces` creates the initial default if none exists.
- Create, rename, duplicate, reset, and delete are available in the workspace menu.
- Autosave waits 650 ms after configuration changes and PATCHes the canonical server workspace with its revision. Save can also be requested explicitly.
- The browser retains only the preferred workspace ID in localStorage. Configuration loads from authenticated REST, including after reload.
- Concurrent stale revisions return `WORKSPACE_CONFLICT` (409); failed saves remain visibly unsaved and never silently overwrite another revision. Reload to load the latest saved version before reapplying conflicting changes.
- Switching workspaces waits for outstanding save work. Deleting the final workspace atomically creates a usable default replacement.
- The backend caps workspaces at 20 per owner and validates account ownership, symbols, intervals, layout, preference enums, and dimensions.

Each mutation and immutable `workspace_events` record commit together. Events have tenant, user, workspace, type, timestamp, and configuration payload. They use a separate stream from engine trading sequences. Activity can filter trading-account or workspace events; `GET /api/v1/workspaces/events` is owner-scoped and returns at most 500 recent events.

## Chart and watchlist workflow

All twelve intervals are available: 1s, 5s, 15s, 30s, 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D. Each pane loads history once per symbol/interval and applies incremental forming/completed candle deltas. Time comparison uses parsed instants so database and WebSocket timezone representations cannot duplicate or misorder bars. Float conversion is confined to chart rendering and temporary drag coordinates.

Markets support search, favorites, categories, compact rows, adding/removing instruments, drag reorder, and accessible up/down reorder buttons. Rows select their own symbol quote; price flashes and stale indicators do not require the entire watchlist to subscribe to every quote.

Chart trade lines reflect canonical positions and pending orders. SL/TP and pending entry handles allow a temporary drag preview and server validation on release. Arrow keys adjust a focused handle by a visual tick; Enter confirms and Escape cancels. Accepted changes arrive through canonical events/refetch. Rejection restores the stored price and displays the reason. Price lines outside the visible chart scale are managed through the position/order dialogs.

The command palette can open symbols, switch accounts/workspaces, create a workspace, toggle panels, open activity tabs, or fit the selected chart. It contains no destructive trading commands and no one-key BUY/SELL actions.
