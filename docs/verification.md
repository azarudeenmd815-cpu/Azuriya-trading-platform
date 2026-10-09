# Foundation verification — 2026-10-03

Evidence applies to local source on `codex/foundation`, not a production deployment. The original repository was empty. All application code was created for the supplied Prompt 1.

## Automated checks

| Check | Result |
| --- | --- |
| `DATA_DIR=./artifacts/migration-verification npm run db:migrate` | Passed; 3 migrations and shared catalog persisted |
| Same migration command again | Passed; checksummed migrations and seeding repeat safely |
| `npm run typecheck` (also within final build) | Passed |
| `npm run lint` | Passed for all source, scripts and tests |
| `npm test` | 86 passed, 6 files, 37.97 seconds in final run |
| `npm run build` | Passed; Vite web bundle and TypeScript server output |
| `npm audit` | 0 vulnerabilities |

| Test file | Passing tests | Coverage |
| --- | ---: | --- |
| `tests/database.test.ts` | 23 | Restricted runtime role, repeatable schema, durable persistence, RLS SELECT/UPDATE/WITH CHECK, Core catalog privileges, composite scope foreign keys, unique domains, immutable audit, atomic rollback, context cleanup and production login privilege guard |
| `tests/domain.test.ts` | 33 | Atomic provisioning, isolated branding, shared six-provider fresh catalog, Brokerage/Prop requests and Core triage, note redaction, hashed scoped keys/revocation, DNS lifecycle, staff/roles, disabled webhooks, standalone Trading Hub, safe lists, active scope, trading operation capability registry, SSL/edge/routing boundaries, scope-bound vault and 9 invalid hostname cases |
| `tests/api.test.ts` | 12 | HTTP auth/CSRF/origin, two organizations, forged ownership/host denial, blank branding URLs, API key boundaries, separate client access, no Core impersonation, late initial staff assignment, session expiry/MFA, unavailable scope discovery and logout |
| `tests/security-boundaries.test.ts` | 13 | Secure production cookies, cross-site denial, session-bound CSRF, immediate MFA/user suspension checks, narrow API context, unavailable brand/product/environment/subscription denial, role reactivation escalation denial, forged Core-client membership/assignment denial and login rate limits |
| `tests/security.test.ts` | 4 | Salted scrypt, high entropy secrets/digests, authenticated encryption/missing key failure and recursive credential redaction |
| `tests/runtime.test.ts` | 1 | Built SPA fallback and preserved API/health/mutation 404 responses |

Tests use real embedded PostgreSQL, production SQL migrations and the restricted application role. Injected DNS adapters exist only in deterministic tests; the running application performs actual TXT resolution. Test fixtures do not make external connectors or SSL appear operational.

## Compiled server smoke test

Started `node dist/server/index.js` with port 3002, development configuration and a separate persistent `artifacts/build-runtime` database. It booted after correcting duplicate Fastify fallback registration. The regression failed before the fix and passed afterward.

| Route | Result |
| --- | --- |
| `/health/live` | 200, process available |
| `/health/ready` | 200, database healthy; pending outbox worker and catalog-only connectors stated explicitly |
| `/login` | 200, built HTML |
| `/core/organizations` | 200, SPA HTML; API authentication remains required |
| `/api/v1/core/organizations` without credentials | 401, standard traced JSON error |
| `/api/v1/does-not-exist` | 404, standard traced JSON error |

Stopped the temporary built server after verification. Original development API/Vite remain available at ports 3001/5173.

## Browser verification

Used the in-app browser and isolated `artifacts/runtime-db` fixtures. The normal database is not seeded with demo users. Browser-created records survived reloads.

- Core overview, Organizations, creation and standalone Trading Hub provisioning: verified real organization, brand, subscription and instance records.
- Product instances, White labels, Plans & billing, provider status, API metadata, Infrastructure and System settings: verified actual API-backed records with truthful unavailable capability labels.
- Branding: saved color `#3A967C` and custom footer; persisted configuration propagated to Brokerage CRM, Prop CRM, Trading Hub and client shell. Context refresh now preserves the save confirmation.
- Domains: creation generated a real TXT challenge. Live DNS lookup timed out (`DNS_ETIMEOUT`); domain stayed `awaiting_dns`, SSL pending and routing inactive.
- Both CRM marketplaces: shared heading/catalog; both submitted real requests. Core displayed both and triage saved reviewing status, team and internal notes. The upgraded verification database preserves legacy providers and therefore contains more records than a fresh six-provider seed.
- API keys: visually checked list/form and scope controls. Generation/hash/scope/revocation exercised by HTTP/domain tests; no extra browser credential created.
- Core Staff: form populated non-Core identities, instances and organization-filtered roles. Late initial assignment exercised by the HTTP regression.
- Client: inherited brand, own profile and authorized product chooser verified. Client session attempting Core URL was denied and recovered to its own workspace.
- Final stable console warning/error inspection returned no entries. Temporary development reloads caused proxy failures during edits; subsequent stable saves and views succeeded.

Screenshots in ignored `artifacts/screenshots`: Core organizations, Core integration requests, business branding, domain verification, Brokerage integrations and client profile. They show isolated verification records.

## Independent review and limits

Independent review covered RLS/constraints, runtime privilege rejection, sessions, API scopes, role activation, Core/business/customer separation and late staff/static serving changes. Regression checks pass for every actionable correction.

No external PostgreSQL server or Docker is available. Network adapter, deployment grants, pooling, TLS and target-server migration behavior remain unverified. Production requires PostgreSQL and HTTPS; local tests do not establish production operational readiness.

Viewport overrides requested 320, 768, 1024 and 1440 px, but the browser reported 1250 px for all four. No horizontal overflow appeared at the actual width. Responsive CSS and keyboard drawer behavior were reviewed; mobile/tablet visual coverage is not claimed.

SSL/edge deployment, concrete trading adapters, OAuth authorization, signed webhook delivery, idempotent replay, distributed rate limiting, usage metering and full billing/quota enforcement remain documented subsequent phases. Current disabled/fail-closed states are intentional boundaries.
