# Azuriya Core foundation implementation plan

**Goal:** Implement the supplied Prompt 1 as a durable, tenant-isolated shared platform, preserving the empty repository audit.

**Architecture:** A modular monolith with a Fastify API, React portal application, SQL migrations and shared domain services. PostgreSQL row security and composite foreign keys supplement authorization. Local embedded PostgreSQL and server PostgreSQL share migrations.

**Scope authority:** The user's supplied request already defines product ownership, portal boundaries, mandatory entities and workflows, acceptance tests, and exclusions. Routine implementation choices follow that specification. No marketing pages, connector simulations, payment processing or trading execution will be added.

## Tasks

- [x] Database: transactional migrations, tenant composite keys, row security, global product/provider catalog, persistence adapters; exercise real PostgreSQL constraints and cross-tenant reads.
- [x] Domain services: organization creation, brand/environment/subscription/instance provisioning, branding, domain state and DNS/SSL/routing abstractions, integration requests and triage, API keys, staff/RBAC, webhooks, audit/outbox; use transactions and safe metadata.
- [x] Security/API: password hashing, opaque hashed sessions, CSRF, membership-derived tenant context, separate client membership, scoped API authentication, versioned validation/errors/pagination, request IDs, rate limits, explicitly disabled idempotency replay and health.
- [x] Portals: separate Core, business and client shells; real list/detail/forms; provision organizations/products, branding, domains, shared integration marketplace and request triage, staff/roles, keys, webhooks, feature flags and audit.
- [x] Documentation: architecture, integrations, API architecture, tenancy, white-labeling, setup and deployment, known operational boundaries.
- [x] Verification: migrations, typecheck, lint, all unit/integration tests, production build, runtime smoke tests and browser verification, fresh security review.

## Review focus

Host and forwarded-host spoofing cannot select unauthorized tenants. Cross-tenant brand/environment/role IDs fail foreign-key or ownership validation. Idempotency must bind principal, tenant, route and request body and never persist raw generated secrets. Client users cannot enter staff or Core surfaces. Domain activation needs actual DNS ownership plus SSL and edge confirmation.

Verification evidence and external PostgreSQL/browser viewport limitations are recorded in [verification.md](verification.md).
