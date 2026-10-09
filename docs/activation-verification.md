# Prompt 2 activation and UI verification

Recorded 3 October 2026. The platform implementation and local verification are complete. Public staging acceptance remains open. This record supplements the historical Prompt 1 verification; it does not turn fixtures into externally deployed infrastructure.

## Application checks

- Vitest: **113 tests passed in 12 files**, including the original 86 tests. Final server test run: 20:28:35 India time, 114.53 seconds including startup/imports.
- TypeScript, ESLint and production build passed. The later theme/logo and client-copy changes were followed by another successful lint/typecheck/build.
- Full npm audit: **zero vulnerabilities**.
- Compiled API and compiled separate worker ran against isolated network PostgreSQL. `/health/ready` reported database healthy, limiter healthy and `worker_healthy`.
- Compiled application, theme initialization, supplied PNG logo and all three local WOFF2 assets returned HTTP 200 with appropriate content types.
- Logo SHA-256 exactly matches the attachment: `B6383475654B9C966B2B609676BB256ED08B0B0B9A9A96A8C31D9BEED2C8E317`.
- The real browser reported its font set loaded and successful checks for Euclid Square 400, 500 and 700. The white canvas/text measured rgb(255,255,255) / rgb(23,34,53), matching #FFFFFF / #172235.

Added coverage includes encrypted TOTP/recovery and policy enforcement; invitation rotation/revocation/single-use races; host-bound sessions and stale-cookie public sign-in metadata; idempotency replay/conflict/concurrency/rollback/resource scoping; competing workers and stale leases; scoped service accounts/support access/shared limits; signed webhook delivery and private/rebinding/redirect rejection; domain expiry/rotation/provider reconciliation/maintenance; safe PostgreSQL metrics and failed-client handling.

## Real PostgreSQL acceptance

An isolated PostgreSQL 16.10 cluster on loopback port 54841 uses SCRAM, TLS and a private test CA. The user's existing PostgreSQL cluster and other application's port 3001 were not modified. Evidence is retained in ignored `artifacts/pg-acceptance/evidence.json` (2026-10-03T14:43:39.995Z).

- Runtime role `azuriya_app`: no superuser or BYPASSRLS privileges. Restricted runtime connections were observed with TLS; the wrong CA was rejected.
- Concurrent migration runs and repeated checksum validation passed for migrations 001–008. Concurrent migration duration: 1,582.63 ms.
- Thirty interleaved tenant transactions tested missing context, foreign inserts, rollback and rejection of a retained transaction executor.
- Foreign overview, domains, integration connections, roles and API keys returned 403; foreign role assignment 422; forged ownership 400. Disabled organization, brand, environment and instance returned 401; revoked membership returned 403.
- A deliberately terminated backend was discarded and the next query connected successfully. Failure counters include deliberate adversarial tests.
- Logical dump: 765.85 ms; empty-target restore: 1,887.44 ms. Migration checksums, both tenant datasets and restricted-role RLS passed after restore.

The encrypted utility drill is separately retained in `encrypted-backup-evidence.json` (2026-10-03T14:44:54.781Z): AES-256-GCM backup 1,467.48 ms; authenticated restore 2,457.29 ms. Wrong key and tampering were rejected before any database write; a nonempty restore target was rejected. Restored migrations and RLS passed. These small local measurements do not establish production RPO/RTO, offsite retention or PITR.

## Performance baseline

One hundred authenticated tenant-overview requests, ten concurrent, used Fastify injection with a real TLS PostgreSQL pool. Results: **p50 135.93 ms; p95 542.34 ms; p99 588.10 ms; 50.04 requests/second; zero errors**. This includes authentication/authorization/database work but excludes public-network and ingress latency. It is a local baseline, not a capacity claim.

## Browser and UI evidence

The real browser signed in with disposable isolated acceptance identities. Staff selected both alpha Brokerage CRM and beta Prop Firm CRM; context, labels and navigation changed correctly. The client identity opened its own portal with client navigation and no administrative controls. Core administration was checked separately. Dark and white theme switching preserved the current view. Existing tenant identity/primary colors remain scoped; each theme now selects the tenant's corresponding logo with fallback.

The responsive harness uses real iframe documents with measured CSS viewports. Core, Business and client overviews were checked at 320×740, 375×812, 390×844, 480×900, 768×1024, 1024×768, 1280×900, 1440×900 and landscape 844×390. Each measured document scroll width was at or below its viewport. Mobile headings measured 24 px; larger headings measured 32 px. Compact navigation appeared below 1024 px. The fresh harness console had no warnings or errors.

Exact dimension readings are retained in `artifacts/screenshots/phase2/viewport-evidence.json`. Actual rendered screenshots include `business-dark.jpg`, `business-light.jpg`, `core-dark.jpg`, `core-light.jpg` and the mobile harness capture. Screenshot bitmap sizes are not the iframe CSS viewport sizes. The top-level viewport override was not honored by this browser, so the responsive results are explicitly iframe layout tests rather than physical-device tests.

The browser's controls cannot activate targets inside the iframe, despite resolving a visible enabled target. Native accessibility and coordinate alternatives failed too. The mobile drawer's click/Escape/focus interaction is therefore **not claimed as manually verified**. Browser zoom shortcuts also did not change the measured viewport: **200% text zoom is unverified**. Both remain manual UI acceptance items; the layout checks do not substitute for them. Development hot-reload messages from earlier edits are not included as clean-boot evidence.

## Boundaries reviewed and fixes made

Review was performed by the primary agent; delegated review agents were unavailable due to account usage limits, so this is not an independent audit. Fixed issues included stale cookies preventing public login metadata; idempotency keys crossing resource IDs; support grants creating persistent credentials or changing staff/security policy; private/rebound webhook DNS and automatic address-family lookup; deliveries surviving disabled tenant scopes; concurrent invitations assigning the wrong membership role; stale domain results activating disabled/rotated mappings; expired domain challenges completing after a slow lookup; and failed PostgreSQL clients returning to the pool.

## Remaining external acceptance

No staging PostgreSQL endpoint, deployable four-host DNS zone, working certificate/edge provider bridge or verified email sender has been supplied. No actual public certificate issuance, four-domain HTTPS browser session, external invitation delivery or external webhook receiver acceptance is claimed. The HTTPS provider adapter is implemented, but its operator-owned provider bridge and vendor provisioning still require deployment. Offsite backup scheduler/storage/KMS, alert collectors, production-scale restore timing and PITR require operational configuration and drills.

Deployment instructions are in `deployment.md`; domain routing, MFA, webhooks, idempotency, security and disaster recovery have dedicated documents. Brokerage CRM operations, trading execution, billing collection and full OAuth authorization remain outside this phase.

## Local preview sign-in correction

After the initial report, the user reported invalid credentials for `verify-owner@azuriya.local` at port 5173. The default API directory `data/azuriya` contained no identities or organizations; the existing Verification Capital database was actually in `artifacts/runtime-db`. After safely closing database inspection, the API was reconnected to that existing directory and an ignored local `.env` saved the path for normal restarts. No accounts or passwords were changed. Login, session retrieval and the original instance `806bd823-d0c8-4c27-ba8d-3014b709694e` overview each returned HTTP 200. Authorized memberships included Brokerage CRM, Prop Firm CRM and Trading Hub. This correction applies to the user's existing local preview; the isolated network PostgreSQL acceptance evidence above remains separate.
