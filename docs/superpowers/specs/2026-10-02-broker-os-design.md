# Phase 3: Azuriya Broker OS

## Outcome and scope

Extend the existing Go/PostgreSQL simulated trading core with a separate Next.js broker operations application. Administrators configure tenant trading policies through authenticated APIs and see those policies affect the existing trader terminal. The supplied Phase 3 requirements are the acceptance specification. Native simulated execution is the only enabled execution mode; live settlement, external routing, Prop OS, payments, and platform adapters remain outside this phase.

## Architecture

Keep `Engine.change` as the sole writer for all trading state and broker configuration. Its cloned candidate, PostgreSQL transaction, append-only records, and post-commit publication protect configuration changes, funds, orders, swaps, and liquidation from competing transitions. Add broker configuration to the existing canonical snapshot and materialize it in forward-only SQL migration 004. PostgreSQL remains canonical; the committed in-process configuration is the cache. Revisions change only after successful commits, eliminating stale independent configuration caches.

Pure policy types live in `internal/domain`; resolution and validation live in `internal/broker`. This package does not import HTTP or persistence. `internal/permissions` centralizes capabilities. Engine broker command and aggregate files expose tenant-scoped services used exclusively by `/api/v1/admin`. Existing trader ownership checks remain mandatory.

`apps/broker-admin` is independent from `apps/web-trader`. Shared versioned contracts and additive presentation tokens belong in workspace packages. The new app contains working dashboard, client/account operations, typed configuration forms, risk, dealer monitoring, finance, reports, audit, and settings. Server calculations supply all financial values as decimal strings. Charts may convert those strings at the rendering boundary.

## Configuration model and precedence

Canonical `State.Broker` contains settings, trading groups, symbol groups, typed policy profiles, membership status overrides, and durable rollover checkpoints. Profiles share metadata and have exactly one typed policy payload selected by kind: pricing, commission, swap, leverage, margin, execution, or session. Groups reference plans by immutable IDs. The API exposes each kind through its named resource, never an arbitrary unvalidated JSON configuration editor.

Resolution starts with platform defaults, then the tenant default group, the account's explicit group, symbol-category rules, and explicit instrument rules. Account overrides are limited to a maximum leverage cap; individual pricing overrides are disallowed. Effective settings return resolved values and profile provenance from the backend. Structural instrument changes are rejected while open positions or executable pending orders exist. Completed fills and ledger entries are immutable; opening positions retain their economic snapshots for closing costs and contract valuation.

## Financial behavior

Pricing uses nonnegative bid subtraction/ask addition and minimum/maximum spread in PRICE or POINTS, aligned to instrument tick size. Group-specific executable quotes are owner/account scoped; reference BID candle history remains tenant scoped and unchanged.

Commission NONE charges zero. PER_LOT_PER_SIDE charges the configured amount on opening and on each closed quantity. PER_LOT_ROUND_TURN charges the entire configured round-turn amount at opening and zero on closing. Commissions create immutable linked ledger entries and are included in pretrade funds checks and previews. Position commission terms are captured at opening so later plan edits do not change existing close economics.

Swap uses configured money per lot in account currency, by side, at a named timezone/time. Triple-day multiplier applies at the local rollover date. An opening must precede a rollover to accrue it. Durable position/date checkpoints make retries and restarts idempotent. Catch-up is bounded and documented. No external financing source or production swap claim is made.

Margin thresholds compare exact equity and used margin, including equality at the configured threshold. Margin calls emit only entry and recovery transitions. Stop-out closes the largest floating loss first, with opening time and ID as stable tie breakers, revalues after every close, and continues until margin is above stop-out or exposure is gone. Nonpositive equity also liquidates rather than leaving an insolvent account unprotected. Automatic risk reduction uses valid current quotes and produces normal fills, ledger, position/account events, and explicit stop-out audit in the same transaction.

Weekly sessions use explicit timezone and OPEN/CLOSE_ONLY/CLOSED windows; overnight windows extend into the following day. CLOSED prevents execution and pending triggering. CLOSE_ONLY permits exposure reduction. Server validation applies to previews and mutations. Protective and forced closes obey valid executable market availability; unavailable exits remain pending for the next executable tick.

Balance operations require signed/typed validated decimal input, account currency, reason, actor, reference, and idempotency key. Withdrawals/debits cannot overdraw the permitted available funds. Operations append a transaction, update valuation, and append administrative audit atomically.

## Security and audit

Capability checks occur at admin transport and command boundaries. Tenant and actor come from the authenticated session. SUPPORT has read capabilities, TRADER has no tenant-wide admin access, ADMIN has broker operations, and OWNER includes tenant settings authority. No request may choose its tenant. Suspended memberships cannot trade or maintain an authenticated operating session. Client suspension uses status transitions and never deletes trading history.

Audit distinguishes account owner delivery scope from authenticated administrative actor. Administrative records include target, before/after, reason, actor, and timestamp. SQL retains full append-only history beyond the snapshot window. CSV is generated server-side from tenant-scoped filtered data and escapes formula-leading cells.

## Verification and operational limits

Run the existing suite before implementation. Add deterministic policy, economic, permission, transition, concurrency, durability, migration, and report tests. Run both applications against PostgreSQL and the real Go backend, including browser admin-to-trader propagation, then rerun all existing workflows. Inspect light/dark and mobile/desktop rendered admin UI.

Preserve the single-writer snapshot architecture. It is operationally safe for the initial simulated environment, but full-state persistence, process-local event delivery, general multi-currency conversion, external settlement, distributed writers, and institutional-scale projections require later work. The UI must state this operating mode clearly and must not invent broker revenue.
