# Activated platform deployment

`DEPLOYMENT_ENV` accepts development, test, staging or production. Staging and production share security requirements: PostgreSQL, verified TLS, HTTPS origin, host enforcement, Secure cookies, mandatory Core TOTP, a valid 32-byte encryption key and a recent worker heartbeat for readiness. They never automatically migrate/seed. Use separate databases, keys, domains, email senders and provider accounts. PGlite remains for development/tests. Reserved local/test hostnames are rejected in deployed configuration and registration.

## Database roles and releases

The first migration needs DBA role-management privileges to bootstrap the no-login `azuriya_app` role. Later releases use a schema owner through MIGRATION_DATABASE_URL. DATABASE_URL must use a separate non-superuser, NOBYPASSRLS login that owns no public tables and belongs to no owner role. Grant `azuriya_app` to that login. Each checkout verifies privileges; each transaction sets restricted role and transaction-local context. Missing context sees no tenant rows; composite foreign keys and FORCE RLS supplement API authorization.

Run `npm run db:migrate` as a release job before deployment. Advisory locking, atomic migrations and checksum validation protect concurrent/repeated runs. Do not include migration credentials in protected web/worker environments. Each runtime pool permits ten connections with connection, statement and idle-transaction timeouts; budget connections across all processes. Failed clients are discarded. TLS validates both CA and hostname. Set DB_TLS_CA_FILE for private CA deployments; URL sslmode overrides are rejected. Reject plaintext at the database/network layer too.

## Processes and ingress

Build with `npm run build`; run `npm start` and `npm run worker:start` as separately supervised processes with restricted database credentials. The API binds loopback. Place an ingress beside it; APP_ORIGIN is the exact external Core HTTPS origin. Only actual ingress IPs/CIDRs belong in TRUSTED_PROXY_IPS. Untrusted forwarded headers cannot select a tenant or bypass HTTPS redirects.

The worker requires network PostgreSQL. It handles leased outbox events, encrypted invitation email, signed webhook delivery, coordinated domain/certificate polling and cleanup, and expired session/idempotency/limiter cleanup. Multiple workers can run safely. External effects remain at least once; stable provider/event IDs require deduplication. Monitor dead-letter states and worker heartbeats.

## External services and secrets

Configure DOMAIN_CNAME_TARGET and the operator's authenticated DOMAIN_PROVIDER_URL/TOKEN bridge. Its actual certificate/edge service must be deployed; the included adapter performs real HTTPS calls but does not create a vendor account. See [domain-routing.md](domain-routing.md). Configure EMAIL_API_KEY and EMAIL_FROM for Resend with a verified sender. Production invitations require an active branded portal domain. No real external email/certificate delivery is claimed by fixture tests.

SECRET_ENCRYPTION_KEY is base64 for 32 random bytes. Store it in a secret manager, back it up separately and prepare rotation. It encrypts seeds, scoped signing secrets and queued invitation messages. API/service secrets are hash-only and visible once. See [mfa.md](mfa.md), [webhooks.md](webhooks.md) and [security.md](security.md).

## Health and release acceptance

The shared limiter uses PostgreSQL buckets, fails closed with 503, and returns 429/Retry-After/RateLimit headers on exhaustion. `/health/live` checks process availability; `/health/ready` checks database, limiter and worker heartbeat. Core infrastructure/metrics expose safe bounded request latency/status samples, database/pool counters, queue lag/failures and worker health. Logs omit bodies, headers, cookies, SQL parameters and secrets. Deploy independent collectors/alerts.

Follow [disaster-recovery.md](disaster-recovery.md) for encrypted backup and empty-target restore. Ignored artifacts/pg-acceptance contain real local PostgreSQL/TLS/RLS/migration/restore evidence, not public staging or scalability proof. Public four-host HTTPS, real sender/receiver, offsite retention and PITR remain staging acceptance gates. Brokerage CRM customer, manual KYC, account-linkage, operational finance and IB workflows are implemented; see [brokerage-crm.md](brokerage-crm.md). A full OAuth authorization server, billing collection, trading execution, concrete trading/payment adapters and encrypted private KYC object storage/scanning remain separate work. The local Brokerage acceptance fixture is not a production deployment configuration.
