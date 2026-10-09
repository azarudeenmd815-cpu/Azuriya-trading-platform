# API architecture

The API uses `/api/v1`. JSON input is validated with strict Zod schemas; unknown ownership fields are rejected. Paginated domain and workflow lists return `{data, pagination:{total,limit,offset}}` with bounded offset/limit, allowlisted sort and supported search/status filters. Configuration endpoints may return `{data}` without a pagination envelope; portal tables filter and paginate these returned collections locally. Errors return `{error:{code,message,details,request_id}}`. `X-Request-ID` is generated or accepted only with bounded safe characters, returned to callers, and stored with audit records.

## Authentication and mutation boundary

`POST /auth/login` creates an eight-hour server-side session using a random 256-bit token whose hash alone is stored. Session and CSRF cookies are HttpOnly and SameSite Strict; cookies are Secure in protected environments and bound to the origin hostname. Login uses salted scrypt password verification and generic credential errors. Enrolled/MFA-required identities receive a short-lived host-bound challenge; `/auth/mfa/setup` and `/auth/mfa/verify` perform real TOTP enrollment/verification. Encrypted seeds, replay prevention, one-time recovery hashes and tenant staff security policies are implemented. Core MFA is mandatory in staging/production. Shared PostgreSQL limits enforce IP/session/credential/user/instance and tenant-environment budgets and fail closed when unavailable.

`GET /auth/me` discovers authorized staff/customer instances for a user session. `POST /auth/logout` deletes the server session. Every session mutation requires the matching `X-CSRF-Token`, and cross-site/disallowed Origin mutations are rejected. API credentials use Authorization Bearer authentication and explicit scopes; they cannot discover all memberships or enter Core/customer authentication flows.

## Core and tenant routes

Core routes provide real lists, organization creation, product provisioning, integration request triage, feature flags and safe identities. Tenant routes `/instances/:instanceId` provide context, overview, branding, domains, shared integrations, requests, roles/staff, API keys, webhooks, audit and settings. Client `/client/instances/:instanceId/context` uses separate customer membership, and `/client/profile` reads only the signed-in user's safe profile.

Authenticated Core identity creation: `POST /core/users` with `email`, a password of at least 12 characters and `display_name`; optional `core_role:super_admin` is Core-only. Assign an existing customer with `POST /core/client-memberships` containing `user_id` and `product_instance_id`. No identity endpoint returns password hashes.

Core can assign initial or subsequent business staff with `POST /core/staff-memberships` containing `user_id`, `product_instance_id` and `role_id`. The service derives organization/environment from an active instance, requires an organization-owned role and an existing active non-Core identity, and atomically records membership, audit and outbox. This supports workspaces provisioned before an owner is selected without granting Core impersonation.

## API keys

Business administrators create keys with `/instances/:instanceId/api-keys`. Secrets contain 256 random bits and use the `azk_` prefix. The raw value is returned once on creation, marked no-store, and kept only in the immediate UI disclosure. Database rows store a SHA-256 digest, safe display prefix, scopes, owner context, expiry, issuing user, last-used time and revocation timestamp. High-entropy random secrets do not need password-style slow hashing. List responses never include the digest or secret. Creation and revocation are audited. Cross-instance, revoked, expired or insufficient-scope credentials are rejected server-side.

## Events and future advanced API

Scoped API applications, service accounts and keys have active permission/expiry/revocation/rotation checks. Webhook delivery uses the durable worker, signed envelopes, outbound SSRF protections, leases, retry/attempt records and exact-instance fanout. Audit/outbox rows commit with mutations. Internal encrypted invitation/Brokerage email events are excluded from business webhook fanout. Provider callbacks and external duplicate effects still require adapter-specific verification/deduplication. OAuth client records do not constitute a full OAuth authorization server.

`Idempotency-Key` is a validated 8–128-character key for transactional mutation/result replay, retained for 24 hours by default. Claims bind the actor/credential, all four tenant IDs, route/resource and canonical payload hash. A matching request replays its result and returns `Idempotency-Replayed`; a different payload conflicts with 409. Authorization and high-risk checks are repeated before replay. Secret-producing routes redact replay disclosures, and sensitive Brokerage destinations never enter normal replay results. Internal transaction replay does not make external side effects exactly once.

WebSocket subscriptions, resume tokens, public SDKs, broader signed inbound API requests and a complete OAuth developer platform remain separate API work. The existing API provides safe request/status latency metrics and shared PostgreSQL request limits; it does not claim a billing/usage-metering platform. Route documentation/OpenAPI can be extended from the stable schemas.

## Brokerage CRM routes

Staff base: `/api/v1/instances/:instanceId/brokerage`. Client base: `/api/v1/client/instances/:instanceId/brokerage`. Routes require an active Brokerage CRM product and the full active organization/brand/environment/product/subscription hierarchy. Staff use explicit `brokerage.*` permissions; customers use their own interactive session, active client membership and derived CRM ownership. API/service credentials cannot perform interactive approval or destination-reveal actions. Tenant-approved Core support may read its permitted records but cannot mutate Brokerage operations or reveal destinations.

| Domain | Staff resources | Customer resources |
| --- | --- | --- |
| Clients/onboarding | `/clients`, profile/status/invite, activity, consent history, notes/revision history, assignments, tags, tasks, settings and consent documents | `/profile`, `/onboarding`, `/consents` |
| Accounts/KYC/providers | `/offerings`, `/accounts`, `/accounts/requests`, account status, `/kyc`, cases/review/document metadata and `/connections` create/rotate/disconnect | Offerings, own account list/detail/request, `/verification`, own KYC cases/document metadata |
| Finance | `/finance-settings`, `/payment-methods`, deposits/withdrawals/transfers, review/status, destination reveal and immutable `/transactions` | Enabled methods, own requests/history and supported cancellation |
| IB | Partners/status/plan, referrals, commission plans, evidence-backed accruals, payouts/review/status/destination | `/ib`, `/ib/apply`, `/ib/attribution` and own payout requests/history |
| Communications/reports | Dashboard, date-filtered reports, notifications and event templates | Own notifications/read state |

Account/KYC/connection mutations and monetary POSTs require `Idempotency-Key`; other Brokerage mutations use the same transactional wrapper and support a supplied key. Session writes require CSRF and an allowed same origin. Lists have scoped totals, a maximum of 100 rows and bounded offsets; search/status/resource filters and sort/direction are server-validated. Clients cannot submit `client_id` to override their ownership.

`GET /clients/:id/consents` returns bounded historical acceptance metadata, including document title/version/hash and acceptance time; it excludes accepted content, IP and user-agent. Per-note and client-wide history reads enforce current and historical visibility. Money is represented as exact decimal strings. Manual KYC/account activation and settlement observations require operational evidence; unsupported connectors/storage retain truthful unavailable/pending states.

High-risk routes require the current `X-Reauth-Password`, enrolled MFA, session verification within 15 minutes and an interactive business session. Finance reviews/approvals also honor the configured default maker/checker separation. See [brokerage-crm.md](brokerage-crm.md), [client contracts](brokerage-clients-api.md), [account/KYC contracts](brokerage-accounts-api.md), [finance/IB contracts](brokerage-finance-api.md) and [idempotency](idempotency.md).
