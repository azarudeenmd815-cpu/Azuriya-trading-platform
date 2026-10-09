# Core activation and Brokerage CRM security

Prompt 1 membership/RBAC, canonical ownership, composite foreign keys, FORCE RLS and restricted runtime grants are preserved. Host selection never grants access. Cookies are host-only, HttpOnly, SameSite=Strict, Secure in protected environments, and database-bound to the origin hostname. Same-origin/CSRF checks remain; no broad cookie scope or cross-domain token passing exists. Only explicit proxy allowlists enable forwarded headers.

API/service credentials are random, hash-only, explicitly scoped, expiring/revocable and optionally bounded by an active application's permissions. Authentication checks active identity/organization/brand/environment/product/subscription/instance. Rotation invalidates previous secrets. Credentials cannot discover sessions or enter Core/client portals. See [mfa.md](mfa.md) for identity requirements and [webhooks.md](webhooks.md) for signing/SSRF.

Support requires a tenant-approved grant to a named active Core user, exact scope, reason and at most four hours. Every use rechecks expiry/revocation and audits it. Support cannot delegate access, alter staff/roles, issue invites, create persistent credentials or weaken tenant MFA. The UI displays reason/expiry and Leave. The in-memory selected grant is discarded on logout/reload. No unrestricted impersonation exists.

Leases fence stale acknowledgements; external effects are at least once and require deduplication. Idempotency claims and business writes share a transaction. Shared PostgreSQL limits fail closed. Runtime cannot modify/delete audit or completed delivery attempts. HTTP/DB telemetry omits raw SQL, parameters, URLs, passwords/seeds/tokens/receiver bodies. A DBA still controls storage: independent encrypted exports/tamper-evident retention are operational responsibilities. Manage/back up encryption keys separately; automatic historical key-version migration is not included.

Review fixes include resource-bound retries, one-time recovery consumption, copied-cookie rejection, portal-bound invites and membership reactivation, concurrent identity locks, blocked support escalation, application scope checks, DNS expiry fencing, stale certificate rejection, durable cleanup, exact-address HTTPS lookup, inactive-tenant delivery blocking and failed owner-client disposal. Public ingress/provider behavior still requires staging proof.

## Brokerage business scope and identities

Brokerage CRM reuses Core identity, session, invitation, role and tenant checks. A customer/business record is separate from a Core identity. Client profile linking requires a matching authenticated email and active client membership in the complete instance scope; client bodies cannot select another identity, status, staff owner or finance client. A disabled identity, membership, organization, brand, environment, subscription, product or instance blocks access. A hostname only selects an authorized workspace.

Every one of the 28 Brokerage tables has enabled and forced RLS using organization, brand, environment and product instance. Missing subordinate context fails closed, including same-organization sibling brand/environment/instance access. Composite keys bind clients to account/offering/connection, KYC case/document, payments, partner/referral and payout/accrual ownership. Immutable grants and the consent-content trigger protect accepted terms, note revisions, KYC events, transaction observations, referrals and accruals. Migration 015 permits distinct allowed retry observations rather than overwriting history.

An isolated PostgreSQL 16 run with verified TLS, a non-owner NOSUPERUSER/NOBYPASSRLS runtime login and positive data in all 28 tables passed unfiltered direct SQL isolation, foreign insert/update and composite client-account ownership controls. See [brokerage-acceptance.md](brokerage-acceptance.md). This is local engineering evidence, not a production security certification.

## Interactive approvals and exact finance

Money is accepted as decimal strings and stored as `numeric(28,8)`; requests reject floating JSON numbers, exponent notation, signs, zero and excess precision. Transactions are immutable operational observations, not a provider balance or accounting ledger. Confirmation of a manual account/payment requires an independent operational reference, and an unavailable provider cannot fabricate account creation or settlement.

Maker/checker is enabled by default. Makers cannot review/process their own requests; approvals require a separate identity from maker and reviewer. High-risk approvals, processing, manual confirmation, sensitive connection actions and destination access require the appropriate role permission, an interactive business session, correct current password and enrolled MFA verified within 15 minutes. API/service credentials and approved Core support cannot perform these interactive actions. Current authorization and high-risk confirmation are checked before idempotency replay, so neither expired MFA nor a wrong password can be bypassed with an old key.

Withdrawal and partner-payout destinations use authenticated encryption bound to request, client, purpose and all four tenant IDs. Normal lists/results disclose only a masked summary; immutable observations, outbox, audit and replay results omit plaintext. A copied envelope cannot authenticate in a different request/client/scope. Reveal requires finance processing authorization, recent confirmation and an audit event. Provider credentials reuse the authenticated scoped vault and fail closed without the configured key.

## Customer information, documents and communication

Approved full-name/country/residence/date-of-birth/client-type edits require renewed verification rather than retaining approved/active status. Safe transition events capture prior/resulting states without identity text. Versioned consent records retain exact accepted text/hash and cannot be rewritten; staff consent-history projections exclude accepted content, client IP and user-agent.

Notes remain internal. Historical reads enforce the current note visibility and each revision's original visibility; private text cannot be revealed by changing the current note to staff visibility. Author/edit policies, deletion history, tenant/client identifiers and permissions apply to note history as well as current notes. Profiles and client notifications do not expose notes, risk fields or staff assignments.

KYC document registration stores validated metadata in `awaiting_upload` state. Actual object upload/access requires an encrypted private-storage implementation with validated receipts, content/size checks, scan results and short-lived authorization. The unconfigured implementation rejects upload/access. No public file URLs, local storage paths, object keys, uploaded documents or compliance certification are claimed.

Brokerage templates allow simple named variables only; expressions, property access, prototype variables and malformed braces fail validation. React displays stored notes/tags/document/template text as text. Encrypted email messages use durable worker delivery, active recipient/tenant membership checks and a stable event idempotency key. Internal email envelopes are excluded from webhook fanout; missing handlers fail/retry. No real sender delivery is claimed without configured provider/sender evidence.

## Review findings and remaining operational work

[brokerage-security-review.md](brokerage-security-review.md) records reproduced and corrected webhook scope, email-handler/fanout, identity re-review, note-history, payment retry, consent-history and referral-link findings. The exact overall test and browser totals belong to the final implementation verification report.

Private object storage/scanning, concrete live trading/payment/KYC adapters, provider settlement/reconciliation, configured external email/edge service validation, public HTTPS multi-domain testing, offsite key/backup protection and external security assessment remain operational dependencies. Local/API acceptance and provider test implementations do not establish those external outcomes.
