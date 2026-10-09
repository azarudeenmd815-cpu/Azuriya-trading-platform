# Azuriya Core

Shared foundation for Azuriya Brokerage, white-label Brokerage CRM, white-label Prop CRM, Azuriya API and Trading Hub. This repository contains the platform foundation; trading execution and business-specific workflows are deliberately outside this phase.

## Local setup

Requires Node 22.12+ (tested on Node 24.11.0).

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env`: set `CORE_BOOTSTRAP_EMAIL` and a strong `CORE_BOOTSTRAP_PASSWORD` of at least 12 characters. Do not commit this file. No default account or known password is installed.

```powershell
npm run db:migrate
npm run bootstrap
npm run dev
```

Open http://127.0.0.1:5173 and sign in with your configured credentials. Embedded PostgreSQL development data (PGlite) persists under `data/azuriya`; it is real database state, not browser fixture data. Stop the API before running maintenance commands against the embedded database directory.

Create identities from Core User identities, then create an organization with an existing owner's email. Organization provisioning creates the brand, environment, owner role, membership, subscriptions and selected product instances atomically. If the owner is assigned later, use Core Staff → Assign staff access, selecting the existing business identity, product instance and organization role. Its API is `POST /api/v1/core/staff-memberships`. Sign in with that business identity to open its authorized admin portals. Assign customers from Core Client memberships (`POST /api/v1/core/client-memberships`), then sign in with their credentials to open their client portals. Core staff accounts require separate business/customer identities.

The bootstrap password remains solely in your local configuration and its salted hash in the database. Remove `CORE_BOOTSTRAP_PASSWORD` from `.env` once bootstrap is complete if you no longer need it there.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

## Production

Production startup intentionally rejects embedded database mode and HTTP origins. Use PostgreSQL with separate migration owner and runtime logins; see [deployment.md](docs/deployment.md). Run migrations and bootstrap using deployment secrets. Set `NODE_ENV=production`, `APP_ORIGIN=https://core.yourcompany.com`, and `DATABASE_URL` for the runtime login. The runtime role must be a non-superuser without `BYPASSRLS` and must be granted `azuriya_app`. SQL migrations run through `MIGRATION_DATABASE_URL`.

```powershell
npm run build
npm start
```

The server serves the built application and `/api/v1` on port 3004 by default. Vite proxies to the same port; set API_TARGET when using another server port. Use an HTTPS reverse proxy on the same origin. Never expose development Vite publicly.

## Documentation

- [Repository assessment](docs/repository-assessment.md)
- [Architecture and product ownership](docs/architecture.md)
- [Tenant authorization and database boundaries](docs/tenancy.md)
- [White-label branding](docs/white-label.md)
- [Integration contracts and catalog states](docs/integrations.md)
- [API and security contract](docs/api-architecture.md)
- [Deployment and operational boundaries](docs/deployment.md)
- [Implementation plan](docs/implementation-plan.md)
- [Verification evidence and limitations](docs/verification.md)
- [Prompt 2 activation verification](docs/activation-verification.md)
- [Azuriya UI implementation](docs/ui-design.md)
- [Domain routing and certificates](docs/domain-routing.md)
- [MFA and recovery](docs/mfa.md)
- [Idempotency](docs/idempotency.md)
- [Signed webhooks](docs/webhooks.md)
- [Disaster recovery](docs/disaster-recovery.md)
