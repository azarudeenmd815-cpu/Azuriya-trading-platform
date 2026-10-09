# Azuriya Core architecture

## Confirmed product ownership

Azuriya Core owns tenancy, identity, organizations, brands, environments, subscription and product-instance provisioning, white-label configuration, domains, RBAC, integration catalog, feature flags, plan/limit records, API infrastructure, audit, and orchestration. Azuriya Brokerage owns trading infrastructure: provider accounts, servers, groups, execution, pricing, ledger, risk and market data. Brokerage CRM owns broker customer/business operations. Prop CRM owns challenges, phases, rule evaluation, progression and payouts. Azuriya API owns connectivity. Trading Hub owns trader communities, communication and collaboration.

Each product is independently subscribable. Affiliate Portal and Trading Terminal are provisionable extensions. CRM provisioning supports distinct business administration and customer portal experiences. Trading Hub provisions without either CRM and inherits the brand and tenant scope. A product instance is a durable entitlement and configuration boundary, not an assertion that every future product feature has been implemented.

## Runtime structure

The platform is a modular monolith. `src/server/db` owns SQL persistence and migrations. `src/server/security` owns identity, MFA, sessions, CSRF, shared request limits and authorization-derived tenant context. `src/server/domain` owns provisioning, branding, domains, integration requests, provider interfaces, credentials, staff, invitations, audit and durable worker infrastructure. `src/server/api` validates external input and translates Core HTTP contracts. `src/server/brokerage` owns the Brokerage CRM business services/routes and communications handler. `src/client` owns the three portal shells and product-specific operations; it never decides tenant authority. `src/shared` holds typed product definitions, permissions and request contracts.

React and Vite serve a same-origin browser application. Fastify exposes `/api/v1`. PostgreSQL provides foreign keys, unique constraints, JSONB configuration and row security. PGlite is a real embedded PostgreSQL engine used for durable local development and tests; production uses node-postgres with a PostgreSQL server and restricted runtime login.

## Hierarchy and portals

```text
Core → Organization → Brand → Environment
                         → Subscription → Product Instance
                                          → Provider/Server → Group → User → Trading Account
```

Provider/server/group levels remain trading-provider contracts. Brokerage CRM adds a real provider-neutral account request/linkage registry, with pending provisioning and evidence-backed manual external confirmation; it does not create a matching engine or manufacture external trading accounts. Core portal routes `/core/:section` require a Core staff session. Business routes `/admin/:instanceId/:section` require active scoped staff memberships. Customer routes `/portal/:instanceId/:section` require separate client memberships. Shared authentication does not merge these authorization levels.

Core manages organization/product provisioning, brands, environments, domains, catalog/request triage, API infrastructure, staff/roles, feature flags and immutable audit. Business admins retain those scoped management surfaces and gain Brokerage customer, consent, KYC, account, finance, IB, communication, task and report workflows. Customers receive inherited branding and their own onboarding, verification, account requests, payment requests, transaction observations, IB status, notifications and security workflows. See [brokerage-crm.md](brokerage-crm.md) for the complete product/route inventory.

## Transactions and events

Multi-step mutations, audit and relevant outbox events commit in one transaction. Transactional idempotency claims/results bind the actor, credential, full scope, route/resource and payload. The real PostgreSQL worker uses durable leases, retries, delivery attempts and stable provider/event idempotency keys. It processes encrypted invitations and Brokerage email, matching scoped webhook fanout, domain/certificate reconciliation and cleanup. External side effects remain at least once and require provider deduplication. Internal encrypted email envelopes never enter business webhook fanout.

## Brokerage persistence and security

Forward migrations 009–012 add 28 fully scoped Brokerage tables; 013–014 upgrade existing product metadata and full-admin permissions under the correct migration context; 015 allows repeated legitimate payment-state observations while preserving request locks/idempotency. Applied Core migrations 001–008 are preserved.

FORCE RLS uses organization, brand, environment and instance context; child composite keys protect client/account, KYC, payment and partner/payout ownership. Immutable grants/triggers protect consent content/snapshots, note revisions, KYC decisions, referrals, accruals and financial workflow observations. PostgreSQL runtime logins must be non-owner, non-superuser and NOBYPASSRLS; migrations use a separate owner connection. Tenant Core support is approved, audited and read-only for Brokerage mutations and sensitive destination access.

Finance uses decimal strings and `numeric(28,8)`. Operational requests/observations do not become a trading ledger. Maker/checker defaults on; high-risk approvals/processing require interactive business staff, current password confirmation and enrolled recent MFA. Destinations and provider credentials use authenticated encryption and safe projections.

## Deliberate phase boundaries

Billing collection and quotas on every future resource remain separate work. Brokerage client/KYC/manual finance/IB operations are implemented, but remote trading execution, balances, settlement/reconciliation, concrete trading/payment/KYC adapters, private document storage/scanning, production commission calculations, Prop rules, Trading Hub messaging and mobile/desktop apps remain separate boundaries. Service accounts, scoped API credentials, signed webhooks, shared PostgreSQL limits, transactional idempotency and tenant-approved support access are implemented. A full OAuth authorization server and developer SDK/WebSocket platform are not.

Production rollout requires public HTTPS/edge/SSL validation, configured senders/providers, secret management, operational monitoring, offsite backup/restore and staging threat/reconciliation exercises. [Brokerage acceptance](brokerage-acceptance.md) records isolated real PostgreSQL/TLS/full-scope controls and local latency measurements; [security review](brokerage-security-review.md) records implementation findings/fixes. They do not certify public deployment, browser checks, remote settlement or production scale.
