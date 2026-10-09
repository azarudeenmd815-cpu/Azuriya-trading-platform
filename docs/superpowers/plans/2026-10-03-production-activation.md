# Azuriya Core production activation implementation plan

> **For agentic workers:** Use the subagent-driven-development workflow with disjoint file ownership, regression tests and independent security review. Track each deliverable below.

**Goal:** Implement the supplied Prompt 2 while retaining all 86 baseline tests and every tenant/brand/identity boundary; prove network PostgreSQL and local operational behavior, then perform external two-tenant HTTPS acceptance on the user's staging resources.

**Architecture:** Extend the existing modular monolith, SQL migrations and PostgreSQL adapter. Transactional services create durable jobs; a separate leased worker processes side effects. Domain/certificate/edge/email/storage implementations remain behind typed boundaries. Shared PostgreSQL state provides distributed limiting without a parallel database architecture.

**Tech Stack:** Existing React, Fastify, TypeScript, PostgreSQL/PGlite, Node cryptography, SQL migrations and Vitest. Preserve the supplied logo byte-for-byte.

**Spec:** User-pasted Prompt 2 at `C:/Users/Azaru/.codex/attachments/2774d46c-f853-44b4-bc3e-de8f206434b7/Pasted text.txt`; user explicitly confirmed implementation of Prompt 2 and logo.

## Global constraints

- Preserve the original migrations and all baseline tests; add new migrations.
- No trading engine, financial execution, full CRM operations or marketing work.
- Secrets do not appear in logs, ordinary list responses, audit metadata or plaintext job payloads.
- Production/staging must use PostgreSQL, verified TLS, secure host-only cookies, mandatory Core MFA and required shared limiting/worker health.
- Host resolution selects context, while authenticated membership still grants authority.
- No domain is active without actual DNS, certificate and edge confirmation. External acceptance remains pending until staging resources are supplied.
- Existing working code and original tenant-brand behavior remain authoritative.

## Review focus

- A forged host or Origin, a stale certificate or a disabled tenant cannot route or authenticate another business.
- MFA steps, recovery codes and invitation tokens must be scope-bound, expire and remain one-time under concurrency.
- A worker crash, duplicated lease or retry cannot silently lose an event or repeat an unprotected side effect.
- Idempotency result persistence and the business change must commit together; replay cannot reveal one-time secrets.
- Webhook DNS changes, redirects or nonpublic IPv4/IPv6 addresses cannot turn delivery into SSRF.

## Ownership and deliverables

### 1. Preserve baseline and platform identity

**Files:** `public/brand/azuriya-logo.png`, `src/client/components/PlatformMark.tsx`, existing shell/login/favicon; baseline source unchanged elsewhere.

- [x] Copy the exact asset and verify matching SHA-256 hashes.
- [x] Apply only to Core/platform login; retain customer logo/fallback behavior.
- [x] Verify typecheck, frontend lint and 86-test baseline.

### 2. PostgreSQL, domain lifecycle and recovery

**Owner:** database agent. **Files:** existing `src/server/db/*`, new `src/server/domain/domain-activation.ts`, new infrastructure domain provider, `migrations/004_production_domains.sql`, network/domain tests and isolated PostgreSQL acceptance scripts. Existing domain foundation methods are modified only with explicit coordination.

**Interfaces:** `DomainActivationService` takes `Database`, DNS verification and certificate/edge provider implementations. It exposes rotate challenge, verify, reconcile and disable for an authorized tenant scope. `DomainProvider` reports safe external reference/state/expiry/failure metadata. Runtime host lookup uses only verified active mappings.

- [x] Add failing network tests for grants/RLS, cross-tenant constraints, context cleanup, pools and migration concurrency.
- [x] Activate an isolated local real PostgreSQL database using the existing adapter; add verified TLS options, advisory migration locking and safe recovery behavior.
- [x] Add domain challenge expiry/rotation and certificate/edge lifecycle migration and services; use actual provider calls, never manufacture active status.
- [x] Test DNS mismatch/expiry/duplicate, unavailable scopes, certificate transitions and resolver behavior.
- [x] Perform isolated backup/restore and document configurable RPO/RTO, retention, encryption and PITR procedure in `docs/disaster-recovery.md` and `docs/domain-routing.md`.

### 3. MFA, invitations and session policy

**Owner:** domain agent. **Files:** existing `src/server/security/auth.ts`, new MFA/invitation/email services, `src/server/api/identity-routes.ts`, `migrations/005_identity_activation.sql`, identity tests, `docs/mfa.md`. Root owns existing route registry and tenant context changes.

**Interfaces:** Export `registerIdentityRoutes(app,db,auth,tenancy,options)`. MFA enrollment/status/confirmation/challenge/recovery/disable routes use `/auth/mfa/*`; tenant invitations use `/instances/:instanceId/invitations`. Share exact DTOs with UI/root before implementation. Email jobs reference encrypted payloads and use an `EmailProvider.send()` boundary; no plaintext invitation secret in outbox/audit.

- [x] Test TOTP enrollment/login/replay/recovery/disable/required policy against RFC vectors and concurrency; keep existing MFA-required denial tests.
- [x] Implement encrypted TOTP and hashed recovery codes, limited setup/login challenges, reauthentication, one-time recovery and policy enforcement.
- [x] Test invite issue/accept/expiry/revoke/rotation/scope/role assignment and single-use races.
- [x] Implement staff/client invitation services, branded verified return URLs and email abstraction.
- [x] Bind sessions to validated hosts while retaining baseline localhost test behavior and safe CSRF/origin checks; coordinate host mapping with root.

### 4. Reliability, credentials and support access

**Owner:** root. **Files:** new reliability/worker/webhook/limiter/application/service-account/support modules, `migrations/006_reliability_activation.sql`, existing API registry/config/tenancy, tests and worker entrypoint.

**Interfaces:** `IdempotencyService.run()` supplies the same transaction-bound database to the business operation and durable result persistence. Secret-returning operations do not store plaintext replay results. `OutboxWorker.runOnce()` uses leases/ownership, bounded retries and crash-safe acknowledgements. `WebhookDispatcher` signs canonical event envelopes and pins validated public DNS addresses. Shared `RateLimiter.consume()` atomically checks hashed dimensions in PostgreSQL and fails closed for protected traffic.

- [x] Add failing idempotency tests for replay, payload conflict, concurrent keys, isolation, expiry and rollback; enable appropriate mutation endpoints.
- [x] Add leased outbox claiming, backoff/jitter/dead-letter and heartbeat state; test competing workers, stale leases, crash recovery and retry.
- [x] Implement endpoint secrets/rotation, subscription matching, HMAC-SHA256 delivery/retry/replay and safe delivery history. Test signature fixtures, redirects/rebinding/private-network rejection and tenant isolation.
- [x] Implement API applications, hashed machine secrets/scopes/rotation/revoke/expiry/last-used and explicit time-bound scoped support grants with audit.
- [x] Implement shared IP/user/key/organization/environment/endpoint limits, safe headers and dependency failure behavior; test two app instances.
- [x] Add startup safety, structured metrics and readiness with actual dependency/worker state.

### 5. Operational UI

**Owner:** portals agent, frontend files only. **Interfaces:** API-backed MFA enrollment/challenge/recovery, invitation lifecycle, domain states, API applications/service accounts, webhook secrets/deliveries/replay, support grants and Core operational summaries. Root/identity/database agents provide exact DTOs before UI mutations are wired.

- [x] Add the real new routes/forms to existing shells without losing branding, accessibility or existing flows.
- [x] Use one-time disclosure for newly generated secrets and recovery codes; avoid storage/analytics persistence.
- [x] Verify initial/error/loading states, permission gates, request outcomes and real iframe CSS viewport sizes; direct mobile interaction and 200% text zoom remain manual acceptance items.

### 6. Acceptance and documentation

- [x] Preserve and rerun all 86 baseline tests; run added suites, typecheck, lint, build and audit.
- [x] Run compiled web/worker runtime and real PostgreSQL smoke tests, backup/restore and platform latency benchmark.
- [x] Review hostname, MFA, invitation, idempotency, worker, SSRF, support and credential boundaries with the primary agent.
- [ ] Obtain an independent security review before production release.
- [ ] Verify two businesses under their four real HTTPS staging domains once resources are configured; record actual results and any unmet acceptance condition.
- [x] Update deployment/security docs; add webhooks, idempotency, MFA, disaster recovery and domain routing docs plus measured acceptance evidence.
- [x] Report the requested 18 final sections accurately. Do not start Brokerage CRM business operations.

## Execution record — 3 October 2026

The delegated agents could not continue because of account usage limits. The primary agent completed the implementation and review; this is not an independent security audit. Local verification passed 113 tests in 12 files, typecheck, lint, production build and a zero-vulnerability audit. Real isolated PostgreSQL TLS/RLS/concurrent migrations/connection recovery, compiled API/worker readiness, logical and authenticated encrypted restore drills, and a measured tenant-overview baseline passed.

The user's newer UI brief was applied with the exact logo and actual local Euclid Square font files, both themes, operational forms and measured business/client viewports from 320 through 1440 pixels plus landscape. Browser tooling did not honor top-level viewport overrides and could not activate iframe controls; 200% zoom and mobile drawer interaction require manual confirmation. Public four-host HTTPS, provider bridge/email acceptance, offsite recovery/PITR and independent security review remain release gates.

See [activation-verification.md](../../activation-verification.md) and [ui-design.md](../../ui-design.md) for actual evidence and limits. The original migrations 001–003 remain preserved; new migrations 004–008 supply the activation schema. Brokerage CRM operations have not started.
