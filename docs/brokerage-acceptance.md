# Brokerage CRM acceptance evidence

The reproducible acceptance runner is `scripts/brokerage-acceptance.ts`. Its latest successful run used an isolated PostgreSQL 16 database, a verified private TLS certificate, and a separate runtime login with `NOSUPERUSER`, `NOBYPASSRLS`, and no ownership of application tables. The restricted runtime assumed `azuriya_app`; the migration connection was separate.

Run it with:

```powershell
npx tsx scripts/brokerage-acceptance.ts
```

The existing workspace-owned PostgreSQL QA cluster must be available on `127.0.0.1:54841`. The runner reads its local CA and owner-password files from `artifacts/pg-acceptance`, never prints their contents, and creates a dedicated database and login for each run. It does not modify the existing PostgreSQL acceptance database or `.env` file. It retains its new database for browser follow-up; repeated runs replace only the brokerage acceptance fixture files and leave previous databases intact.

Generated files are ignored under `artifacts/brokerage-acceptance`:

- `evidence.json`: non-secret structured controls, lifecycle evidence, database metrics and timings.
- `runtime.env`: private API configuration, port `3006`, origin `http://127.0.0.1:5174`, restricted database login and encryption key.
- `fixture.json`: private development-only login fixture for both businesses, instance IDs, MFA seeds and recovery codes. Do not publish or print this file.

## Independent businesses and operational workflows

ABC Markets and XYZ Markets were independently provisioned through the existing Core foundation. Each business has its own organization, brand, environment, product instance, staff, invited client, offering, requested provider connection and offline payment method. ABC uses MetaTrader 5 catalog configuration and a blue brand color; XYZ uses cTrader catalog configuration and a teal brand color.

For each business, the runner exercises the actual API with persisted PostgreSQL data:

1. Enroll three separate business staff identities through the real password login, MFA setup and TOTP verification endpoints. MFA state is encrypted and staff sessions are genuinely verified.
2. Create a brokerage lead as business staff, issue an encrypted Core invitation, accept it into a new Core identity, sign in as the client, and link the invited CRM record by saving a profile.
3. Publish exact versioned business terms, reject a stale consent hash, and persist the exact accepted consent.
4. Open a manual KYC case, register honest document metadata, review it, and approve it using an independently supplied operational evidence reference. Activate the eligible client.
5. Store encrypted provider connection credentials and verify that response and audit projections exclude their plaintext.
6. Create a live offering and request an account. Confirm the initial `provider_pending` state. Reject activation without operational evidence, then manually confirm a linkage with an external identifier and reference. A second account remains `provider_pending`.
7. Record a deposit with an exact eight-decimal amount. Reject maker self-review, clear it as a separate reviewer, then process and complete it with a confirmed offline reference.
8. Record a withdrawal with an encrypted payout destination. Clear it as a separate reviewer, reject the reviewer also approving it, then have a third staff identity approve, process and record a confirmed offline payment.
9. Persist a tag, immutable note revisions, an account-manager assignment and a staff task. Verify that the client profile excludes internal risk, staff assignment and note data.
10. Apply for an IB partnership as the client; review, approve and activate it as staff. Attribute a distinct referred lead, assign a commission plan, record a manual commission observation, and create a separately reviewed and approved payout allocation.
11. Confirm relevant persisted audit events and confirm that they exclude provider credentials and unmasked bank destinations.

These are CRM operational observations. The run does not claim to create external trading accounts, execute trades, transfer provider balances, settle funds, or deliver configured-provider email.

## PostgreSQL isolation controls

All **28 brokerage tables** contain positive-control data in ABC Markets. Every table was inspected for both enabled and forced row-level security. Unfiltered direct SQL through the restricted runtime returns only rows in the exact authorized organization, brand, environment and product-instance scope.

For every table, the runner tests ten unauthorized contexts: no context, organization only, each missing subordinate scope, foreign brand, foreign environment, foreign instance, a valid same-organization sibling brand/environment/instance, and another valid product instance in the same organization/brand/environment. Those contexts return zero rows.

Every table also rejects a copied record with foreign-business ownership through an authorized ABC transaction with PostgreSQL error `42501`. Foreign-scope updates return zero rows; tables with revoked mutation privileges reject updates with `42501`. Positive reads make these tests meaningful even for supporting tables such as consent snapshots, note revisions, KYC events and payout allocations.

The runner separately verifies composite foreign keys. A payment request in the same instance that claims a different client but uses the original client's account is rejected with `23503`. A note referencing another brokerage's client is also rejected with `23503`.

HTTP checks cover foreign staff access across nine business resources, client access to staff routes, foreign client-portal access, a foreign client record, a foreign account, profile overposting and selecting another finance owner. These controls return the expected `403`, `404` or `400`, without leaking the foreign record.

## Performance baseline

The successful run made **50 requests per operation**, **five concurrent requests per batch**, using the real TLS PostgreSQL pool. Queries include current shared-page search, status, sort, direction, limit and offset fields; paginated endpoints verify the `{ data, pagination: { total, limit, offset } }` response shape. The client-list fixture contains 252 clients, including 250 synthetic leads inserted solely for query measurement.

| Operation | p50 | p95 | p99 | Requests | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Scoped filtered/sorted clients list, offset 20 | 56.23 ms | 227.43 ms | 247.01 ms | 50 | 0 |
| Client profile | 64.54 ms | 70.15 ms | 70.65 ms | 50 | 0 |
| Scoped filtered accounts | 48.12 ms | 52.73 ms | 55.08 ms | 50 | 0 |
| Scoped filtered transactions | 41.74 ms | 49.41 ms | 52.81 ms | 50 | 0 |
| Scoped date-filtered dashboard | 45.50 ms | 61.73 ms | 65.92 ms | 50 | 0 |

These results are a local acceptance baseline. Fastify injection includes application authentication, authorization, request limits, persistence and serialization, but excludes network latency and browser rendering. The small account and transaction fixture is not a production-volume capacity test. The p99 of 50 samples is the slowest sample and should not be interpreted as a statistically stable production percentile.

An initial benchmark attempt reused the maker session beyond its normal 180-request-per-minute budget and captured ten non-200 responses. That attempt did not retain the individual response codes, so a session-limit cause is an inference from the configured budget and the passing session-distribution change. The successful run retains the normal controls and distributes read measurements across the already enrolled maker, reviewer and approver sessions. It does not disable the limiter or clear its state to obtain the reported timings.

## Honest limitations

- Provider adapters and payment connectors are not configured. Requested connections remain `requested`, unavailable account provisioning remains `provider_pending`, and provider balances remain unavailable.
- KYC document registration persists `awaiting_upload` metadata, `pending` scan state and `encryption_confirmed=false`. The client verification response reports private storage unavailable; the unconfigured private upload abstraction rejects access. No uploaded or scanned private object is claimed.
- The isolated fixture confirms manual CRM workflows and database controls, not regulatory compliance or operational settlement. Manual KYC/account/payment decisions require external operational references.
- These API/database results are separate from the root task's browser checks. Browser rendering, responsive behavior and navigation require browser verification against the retained fixture.
