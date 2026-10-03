# Broker administration UI implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the tasks in order. Steps use checkbox syntax for tracking.

**Goal:** Build a separate authenticated broker operations app whose account operations and typed trading policy forms update the native simulated trading core.

**Architecture:** Next.js pages provide explicit routes and a persistent operations shell. React Query owns canonical API state; local React state owns filters and unsaved form input. Every financial field remains a decimal string, and dashboard charts consume server aggregates.

**Tech stack:** Next.js 16.3.6, React 19.3.0, TypeScript 5.9.3, the already installed React Query 5.x, Phosphor 2.1.10, Instrument Sans, local Gotham numeral files, native CSS and SVG, existing Playwright and Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-broker-os-design.md` and the canonical JSON contracts being prepared in `docs/phase3-contracts.md`.

## Global constraints

- Start product implementation only after the root worker confirms baseline completion.
- Native simulated execution is the only enabled execution mode.
- Never bypass order validation, risk checks, or authenticated tenant/account ownership.
- Financial values use exact decimal strings. Floats are permitted only at the chart rendering boundary.
- Tenant and actor identity come from the authenticated session.
- Ledger and audit records are append-only; the server applies changes atomically before publishing events.
- No editable JSON policy blob, fake chart history, fabricated broker revenue, decorative action, or unsupported live-routing control.
- Preserve the existing marketing site and terminal layouts. Shared theme exports are additive.
- Backend mutation capability checks are authoritative. The UI reflects the capability list returned by `/admin/me`.
- Admin is served on `http://localhost:3001`; the trading API is `http://localhost:8080`. Both HTTP and WebSocket origin policy must explicitly allow the separate app origin.
- Read the installed Next.js docs before implementation. Guides for layouts/pages, server/client components, CSS, fonts, dynamic routes, navigation, and CLI have been read during preparation.
- Run formatting, relevant deterministic tests, TypeScript, both app builds, and real backend browser checks before completion.

## Review focus

1. A logged-in trader or suspended membership receives an explicit access state and cannot load privileged data or apply configuration.
2. A stale revision or failed request retains the operator's decimal input, displays the server error, and never reports the draft as saved.
3. A repeated balance-operation submission retains its idempotency key until canonical success and cannot duplicate a ledger transaction.
4. Empty tenants, long account/client names, large decimal values, and phones retain full readable values with bounded table scrolling.
5. A theme switch preserves the current form, selection, filter, and expanded detail; unavailable storage still permits appearance switching.

## Visual direction

Use the current product dashboard's Instrument Sans text and Gotham numeral stack. The page canvas is `#0f1014` in dark and `#ffffff` in light; panels are `#191a21` / `#f7f8fb`; raised controls are `#303238` / `#eef0f5`; borders are `#2e3038` / `#dfe2e9`; primary action blue is `#3869fc`. Text is `#ffffff` / `#172235`; supporting text is `#9b9da6` / `#56657a`. Dark positive/negative colors are `#36d69d` / `#fd606c`, with the marketing dashboard's darker semantic text equivalents in light mode.

Retain the labelled sidebar, blue active navigation, rounded panels, pill filters, and white circular appearance/refresh utilities from the mock. Use a full-height 244px sidebar, a 72px header, 28px page gutters, 20px card corners, and 14px primary text. Financial tables use tabular numerals, right-aligned money/quantity columns, sticky table headings, restrained 1px row separators, and 44px minimum row/action height. The dashboard can use four canonical aggregate cards and two useful charts, but other routes begin with their actual table or form.

The dashboard charts are a horizontal gross-exposure chart from server symbol aggregates and a margin-state distribution from server counts. A blue summary card can show the canonical aggregate equity; it must name its currency and server snapshot time. If the backend returns multiple currencies without a converted total, display separate currency totals. No trend arrow, sparkline, or historical line appears unless the API supplies that series.

At 1100px the sidebar becomes a compact labelled drawer, controlled by an accessible menu button. At 768px gutters become 16px, summary cards use two columns, and editor/detail layouts become one column. At 389px cards stack. Tables stay inside an explicitly scrollable container; the page itself cannot overflow horizontally. Forms use 16px input text on phones, wrapping labels, and full-width primary actions. Dialogs fit within 20px viewport margins and scroll internally.

## Route and API map

Each route is a real Next page. List pages filter canonical records; row links open details or typed editors. The API endpoint names and wire fields come from the root's admin API contract, without independently inventing transport semantics.

| Route                         | Purpose and usable action                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`                  | Canonical account, client, exposure, margin-state and execution overview; link cards to actual filtered workspaces.                    |
| `/clients`                    | Tenant client search/status/role filters; open client records; change permitted membership status with a reason.                       |
| `/clients/[id]`               | Client identity, status, capability context and owned accounts; permitted status update.                                               |
| `/accounts`                   | Account status/group/client/currency filters; create an account through its typed server command; open account details.                |
| `/accounts/[id]`              | Canonical balances, positions, orders, fills, ledger, group assignment, effective settings/provenance and permitted account overrides. |
| `/trading/symbols`            | Instrument list and typed specification/status editor; structural lock errors remain visible.                                          |
| `/trading/categories`         | Symbol-category list; create/update membership and typed permitted category rules.                                                     |
| `/trading/groups`             | Trading-group list; create/update status, policy assignments, default designation and permitted symbol access.                         |
| `/trading/pricing`            | Typed pricing profile CRUD and profile assignment context.                                                                             |
| `/trading/commissions`        | Typed commission profile CRUD with mode-specific fields and clear charging basis.                                                      |
| `/trading/swaps`              | Typed financing profile CRUD with side rates, rollover timezone/time and triple weekday.                                               |
| `/trading/leverage`           | Typed leverage profile CRUD; account cap is edited on the account detail page.                                                         |
| `/trading/margin`             | Typed margin profile CRUD with call/stop-out thresholds and permitted policy controls.                                                 |
| `/trading/execution`          | Typed native simulated execution policy CRUD; immutable simulation boundary is stated.                                                 |
| `/trading/sessions`           | Typed timezone and weekly session-window editor, including overnight windows and OPEN/CLOSE_ONLY/CLOSED state.                         |
| `/risk/exposure`              | Server exposure aggregates by symbol, group and side; bounded tables plus server aggregate chart.                                      |
| `/risk/accounts`              | Canonical account margin states and affected accounts; links to account details and effective margin policy.                           |
| `/dealer/positions`           | Tenant-wide position monitor with account/client/group/symbol/status filters and permitted validated management actions.               |
| `/dealer/orders`              | Tenant order monitor with canonical state/rejection and permitted validated cancellation.                                              |
| `/dealer/executions`          | Immutable fills with reference quote, executable price, costs and execution reason.                                                    |
| `/finance/balance-operations` | Typed account balance command and immutable recent operations; reason/reference/currency/idempotency required.                         |
| `/reports`                    | Named server report selection and filters; download server CSV.                                                                        |
| `/audit`                      | Tenant append-only audit pagination, actor/target/type/date filters, and before/after inspection.                                      |
| `/settings`                   | Permitted tenant operating settings form and simulation/environment summary.                                                           |

## File ownership and structure

- Create `apps/broker-admin/package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `AGENTS.md`, `.env.example`, `vitest.config.ts`, and `playwright.config.ts`.
- Create `apps/broker-admin/src/app/layout.tsx`, `globals.css`, `numeric-fonts.css`, `page.tsx`, `not-found.tsx`, and explicit route pages from the map above.
- Create `src/components/providers.tsx`, `auth.tsx`, `admin-shell.tsx`, `theme.tsx`, `page-header.tsx`, `data-table.tsx`, `resource-editor.tsx`, `policy-editor.tsx`, `session-editor.tsx`, `record-detail.tsx`, and `aggregate-chart.tsx`.
- Create focused page components for `dashboard`, `clients`, `accounts`, `configuration`, `risk`, `dealer`, `balance-operations`, `reports`, `audit`, and `settings` under `src/features/`.
- Create `src/lib/api.ts`, `navigation.ts`, `format.ts`, `form-schema.ts`, `profile-schema.ts`, `admin-queries.ts`, and meaningful deterministic schema tests.
- Copy the existing licensed Gotham WOFF2 files and source manifest into `apps/broker-admin/public/fonts/gotham/`.
- Create only `packages/api-types/src/broker.ts` and its export in the package index. The root worker owns changes to existing trading contracts.
- Add `packages/ui/src/product-tokens.css` and the additive package export. Existing `tokens.css` stays in place.
- Coordinate root `package.json` scripts with the root worker before editing; app dependencies reuse existing installed versions and lockfile entries.

## Typed form schema

`form-schema.ts` defines labelled control descriptors, presentation validation and draft construction. It does not perform financial calculations. Export `FormField<T>` as a discriminated union of text, decimal, integer, enum, boolean, timezone, time, reference and reference-list fields, where each field key is a real key of `T`. Decimal inputs are controlled strings with `inputMode="decimal"`; percentage/rate fields explain their unit. No `type="number"`, `parseFloat`, `Number`, or exponent encoding is used for financial inputs.

Export `validateDraft<T>(fields: readonly FormField<T>[], draft: T): Record<string, string>` and `buildDraft<T>(fields: readonly FormField<T>[], source: T): T`. Basic required/format/length validation improves input feedback; server validation remains authoritative for tick alignment, financial bounds, references, permission, policy ordering, account funds and state-dependent structural restrictions.

`profile-schema.ts` supplies a descriptor per canonical typed profile kind. The profile union and field wire names are copied from `docs/phase3-contracts.md` and exported as broker API types. The editor renders only the payload belonging to that profile kind. Metadata includes immutable identity, editable name/status, current revision and required change reason. Writes send the current revision and change reason; successful responses replace the displayed canonical record.

| Form              | Controls and useful explanation                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing           | PRICE/POINTS unit; bid subtraction; ask addition; minimum/maximum spread; optional permitted category/instrument selectors. Values describe executable quote widening.                 |
| Commission        | NONE/PER_LOT_PER_SIDE/PER_LOT_ROUND_TURN; exact amount per lot; currency if required by contract. Hide irrelevant rate controls for NONE and explain when opening/closing are charged. |
| Swap              | Enabled state; exact long/short per-lot money; timezone; local rollover time; triple weekday; permitted catch-up settings. Preserve signed decimal strings.                            |
| Leverage          | Default/maximum leverage and permitted symbol/category leverage tiers if the canonical policy provides them. Explain account caps separately.                                          |
| Margin            | Exact call/stop-out percentages and available policy behavior. Show backend restrictions and resolved effective values.                                                                |
| Execution         | Permitted order types, quantity/protection constraints, simulated latency and execution statuses supplied by the typed contract.                                                       |
| Session           | Explicit timezone; repeatable weekly windows with weekday, local start/end, OPEN/CLOSE_ONLY/CLOSED; add/remove window controls; overnight indicator.                                   |
| Group             | Name/status; each named profile selected from canonical resources; symbol-category/member selectors; default flag where permitted.                                                     |
| Symbol/category   | Existing canonical spec fields and permitted profile references/rules; status; decimal step/size/leverage inputs; explicit server structural restriction errors.                       |
| Client/account    | Contract-supported name/status/group/cap fields; contextual canonical balances and effective policy; change reason.                                                                    |
| Balance operation | Account, server currency, typed operation, amount string, reference, reason; single retained idempotency key per command draft.                                                        |
| Settings          | Contract-supported tenant settings only; OWNER capability required for writes.                                                                                                         |

Form save state is explicit: unchanged, unsaved, saving, saved, or failed. Switching appearance does not remount forms. Editing a different record initializes a fresh draft from canonical data. A revision conflict offers reload canonical data; it retains the unsaved draft until the operator chooses. The page header shows a count, last refresh time, and useful create/filter actions only when implemented and permitted.

## Implementation tasks

### Task 1: Authenticated themed app and server contracts

**Interfaces:** Consume `/admin/me`, existing `/auth/login` and `/auth/logout`, and the canonical broker contract. Produce `adminApi<T>(path: string, init?: RequestInit): Promise<T>`, `AdminSession`, `AdminShell`, and additive product theme tokens.

- [ ] Confirm the baseline completion signal and final root API contract.
- [ ] Add only the listed cached dependencies, root script changes and Next app scaffolding.
- [ ] Implement credentials-included `/api/v1` requests, explicit errors, 401 session reset, capability access state and login/logout.
- [ ] Implement first-paint dark/light tokens, Instrument Sans/Gotham, labelled sidebar and real route links.
- [ ] Check TypeScript and production build; browser-test anonymous, forbidden, authenticated and storage-unavailable theme states at 320px and desktop.

### Task 2: Typed configuration resources and account operations

**Interfaces:** Consume canonical named lists/writes. Produce `ResourceEditor<T>`, `PolicyEditor`, `SessionEditor`, exact decimal field validation, and the explicit trading/client/account route features.

- [ ] Write deterministic tests proving decimal drafts remain strings, exponent inputs fail, signed swap rates survive, and profile kind selects only its typed payload.
- [ ] Implement focused forms and named resource CRUD, revision/reason metadata, reference selectors, canonical success handling and server error retention.
- [ ] Implement client/account list/details and permitted status, grouping, override and specification operations.
- [ ] Browser-test actual create/edit propagation, policy assignment, structural lock errors, stale revision, failed save and retained form/theme state.

### Task 3: Monitoring, dashboard, finance, reports and audit

**Interfaces:** Consume canonical server dashboard/risk/dealer/report/audit/account history APIs. Produce chart/table views and `BalanceOperationCommand` with retained idempotency.

- [ ] Implement useful aggregate cards and charts, with empty states when no aggregates exist.
- [ ] Implement risk/dealer tables and permitted validated actions with canonical refresh.
- [ ] Implement exact typed balance operations and immutable result history; repeated failed command retries keep their key.
- [ ] Implement named report filters and real server CSV download; audit paging and before/after inspection; permitted settings form.
- [ ] Browser-test large values, empty lists, forbidden actions, balance replay, CSV download, audit paging and 320/768/1512px bounds in both themes.

### Task 4: Integrated verification and final review

**Interfaces:** Consume both running apps, native Go API and PostgreSQL. Produce verified admin-to-trader propagation and a concrete completion record.

- [ ] Run app unit tests, TypeScript, formatting and production build.
- [ ] Run real owner/admin browser configuration and finance workflows through admin3001, then inspect actual trader3000 previews and account records in the same session.
- [ ] Inspect responsive light/dark dashboard, dense table, typed profile form and account detail screenshots.
- [ ] Give the root worker final changed files, commands/results, rendered screenshot paths and any remaining server-contract limitation; root reruns full regressions.

## Preparation status

Only this plan has been added. Product files remain untouched until the baseline completion signal. The installed Next documentation and current app/package/test contracts have been inspected. Canonical broker wire-field alignment is performed against the core worker's contract before creating shared types or forms.
