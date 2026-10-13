# W06 Cycle 3: timestamp precision and snapshot provenance

Baseline: `8b0b567ec625403f9b710b15aa2b580774e1d7e8`.

Cycle 3 hardens the existing normalized quote path at the timestamp and
snapshot boundaries. Quote timestamps are canonical UTC values with six
fractional digits (microsecond precision); values with more precision,
invalid calendar values, or a source event later than its receipt are rejected.
Ordering compares trusted source sequence values first and source timestamps at
microsecond precision, then uses the stable event identity tie-breaker. This
keeps sub-millisecond events replay-safe instead of collapsing them to a
JavaScript millisecond `Date` value.

Migration 065 stores `provenance` and `source_kind` on each latest snapshot and
backfills existing rows from the registered source under the explicit Core
context required by forced RLS. Snapshot reads use the persisted values, so
changing a source's mutable catalog fields cannot relabel an already stored
simulated quote as verified provider data. A database check and immutable
trigger keep snapshot source identity and provenance source-matched and prevent
Core maintenance writes from relabeling or replacing it. Migration 066 adds the matching database invariant
that a source event cannot be later than its receipt, so trusted maintenance
writes cannot bypass normalized-ingestion ordering.

## Acceptance criteria

1. Accepted source and receipt timestamps round-trip in canonical six-digit UTC
   form, including through restart and non-UTC session settings.
2. More-than-six-digit, invalid, future-dated, or source-after-receipt timestamps
   are rejected before persistence.
3. Distinct events inside one millisecond order deterministically; replay,
   stale delivery, and equal-timestamp tie behavior remain unchanged.
4. Every latest snapshot carries immutable-at-ingestion source provenance, and
   reads do not join mutable source labels to determine whether data was
   simulated or provider-sourced.

# W06 Cycle 2: instrument entitlements

Baseline: `574b5464ed93ab9f5f7d55d9ca2242903def1220`.

Cycle 1 supplies the canonical instrument catalog, approved sources, normalized
quotes, durable snapshots and authenticated quote routes. This bounded cycle
adds explicit per-product-instance access to instruments, reusing those models.
There are no provider calls, subscription changes or trading actions.

## Acceptance criteria

1. An instrument is listed and can receive quotes only with an enabled access
   row matching organization, brand, environment and product instance.
2. Missing or disabled access denies ingestion and hides current snapshots
   from single and batch reads, including direct restricted-role SQL reads.
3. Tenants cannot grant themselves access, modify the global catalog or read
   another scope's access rows. Only trusted Core transactions administer these
   records; `azuriya_app` remains subject to forced RLS.
4. Staff and client instrument routes reuse existing brokerage authentication
   and authorization. Lists are deterministic and capped at 100 instruments.
5. Accepted snapshots retain canonical decimal strings, advance successfully,
   survive restart and preserve existing stale/duplicate behavior.

## Interfaces and rollout

`MarketDataService.listInstruments(scope, limit = 100)` returns id, symbol,
displayName, priceScale, tickSize and zeroSpreadAllowed. Limits outside 1-100
are rejected. Existing `getLatest` and `listLatest` now enforce access too.

Authenticated GET routes:

- `/api/v1/instances/:instanceId/brokerage/quotes/instruments`
- `/api/v1/client/instances/:instanceId/brokerage/quotes/instruments`

Migrations 061-066 create scoped access records, enable trusted Core catalog
administration through the restricted runtime role, and add a restrictive
snapshot SELECT policy. Migration 065 also snapshots source provenance on each
quote; migration 066 enforces source/receipt ordering in the database. Runtime
source updates are limited to slug/active:
source kind and provenance cannot change after registration, preventing old
simulated quotes from being relabeled as provider prices. Migration 060 is unchanged. The migration runner
checksums and transactionally applies each migration once.

Access starts denied. W01 must explicitly provision enabled access rows for
intended scopes when deploying these changes; no implicit backfill is safe.
Disabling or deleting access hides persisted quotes without deleting them.
Re-enabling access exposes the original snapshot and its original timestamps;
consumers must continue applying their freshness policy. An inactive instrument
is omitted from instrument listing and rejected on ingestion.

## W06 Cycle 4: ingestion scope lifecycle

Internal quote ingestion now requires the complete active tenant hierarchy:
organization, brand, environment, product, subscription, and product instance.
The supplied product slug must also match the canonical product bound to the
instance. Suspending any hierarchy member or presenting a mismatched product
scope rejects the quote before normalization or snapshot mutation.

Quote reads require exactly one selector: a single `instrument_id` or a
comma-separated `instrument_ids` list. Supplying both selectors or an empty
list is rejected before snapshot lookup, avoiding silent selector precedence or
an ambiguous successful empty response.

Direct market-data reads also require the complete active ownership hierarchy
and a product slug matching the provisioned instance. Suspended organizations,
brands, environments, products, subscriptions, or instances return no catalog
or snapshot rows, even when an old tenant context or entitlement remains.

Database-backed validation also uncovered two defects in the integrated quote
implementation: unused UPDATE parameters prevented newer snapshots from being
stored, and numeric columns returned padded price strings. Both update paths
now bind contiguous parameters, and snapshot/catalog decimal fields use the
existing exact canonicalizer on reads.

No shared TypeScript contract is changed. Internal callers supply a trusted
TenantContext; HTTP callers obtain it through the existing brokerage context.
Ingestion remains internal with no HTTP write endpoint. Source provisioning and
access administration are trusted Core operations, with no new management API.

## Verification boundaries

The focused tests use the project's PGlite PostgreSQL runtime and restricted
`azuriya_app` transactions to exercise RLS. Embedded transactions serialize;
this is not evidence of multi-connection PostgreSQL concurrency performance.
The controller must run the regular Vitest and build scripts if this sandbox
cannot start Vite/esbuild subprocesses.
