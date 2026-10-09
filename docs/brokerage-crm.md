# Azuriya Brokerage CRM

Brokerage CRM adds persisted brokerage business operations to the existing Azuriya Core platform. A business receives separate, branded administration and client experiences, an independent client lifecycle, configurable account offerings, KYC orchestration, operational finance, IB foundations, staff work and audit history. Core identity and tenancy are reused; trading execution and accounting balances remain provider-owned.

## Ownership and runtime architecture

| Product | Ownership |
| --- | --- |
| Azuriya Core | Organizations, brands, environments, product provisioning, identity, memberships, roles, domains, white-label configuration, security, global catalog, keys, webhooks, outbox and orchestration |
| Brokerage CRM | Customer records, onboarding, consent, account requests/linkages, KYC cases, payment requests, workflow observations, IB relationships, segmentation, notes, tasks and operational reports |
| Azuriya Brokerage | Trading infrastructure, provider/server/group operations, execution, pricing, trading balances and risk |
| Prop CRM | Challenge, phase and rule logic |
| Azuriya API | External connectivity and credentials |
| Trading Hub | Trader collaboration; a separately provisioned product boundary |

The implementation remains a modular monolith: `src/server/brokerage/clients.ts`, `accounts.ts` and `finance.ts` own business services; their route modules expose strict HTTP contracts; `common.ts` reuses Core authentication, authorization, transactional idempotency and safe business events. `communications.ts` owns allowlisted plain-text templates and the durable email handler. Existing Core modules remain responsible for identity, tenancy, branding and provider catalog definitions.

Every Brokerage row carries `organization_id`, `brand_id`, `environment_id` and `product_instance_id`. Normal business services use the full scope, and clients are additionally resolved from their authenticated identity. FORCE RLS and composite foreign keys enforce these boundaries below the application layer. A Brokerage record is not a Core user: an invited lead can exist before an identity, and identity acceptance plus matching-email profile linking attaches it to an authorized client membership.

## Client model and onboarding

`brokerage_clients` stores a UUID and separate display client number, optional Core identity, normalized email, name, country/residence, date of birth, individual/corporate type, preferred currency, lifecycle/onboarding/KYC state, acquisition source, risk level, account-manager assignment and operational timestamps. Staff can create and invite leads; client profile saves derive identity and email from the active membership. Clients cannot choose a user, risk level, staff assignment, acquisition fields or lifecycle state.

The controlled lifecycle supports `lead`, `invited`, `registered`, `onboarding`, `kyc_pending`, `kyc_review`, `active`, `restricted`, `suspended`, `closed` and `rejected`. It uses explicit allowed transitions and persisted reasons. Closed is terminal. Activation checks current country, age, client type, consent and configured KYC requirements. Restricted, suspended, rejected and closed clients cannot use profile editing to restore eligibility.

`brokerage_settings` configures allowed/restricted countries, permitted client types, minimum age, KYC requirement, account-request availability and onboarding steps. Published terms/privacy/disclosure documents have immutable text, version and SHA-256 hash. Client acceptance persists the exact text/version/hash, authenticated user, timestamp and request evidence; stale hashes fail. A newer required active document needs a new acceptance.

Changes to approved identity/eligibility fields, including full name, country, residence, birth date or client type, invalidate approval and require renewed onboarding/KYC review. Safe audit events retain the previous and resulting states without duplicating identity text.

Segmentation uses scoped tags and client-tag assignments. Lists support search, lifecycle/KYC state, country/type, acquisition source, responsible staff, tag, registration dates and bounded pagination. Staff assignments validate an active membership authorized for the exact environment/instance. Notes are staff/private, author-controlled, revisioned and soft-deleted. History endpoints check both the current note's visibility and each historical revision's visibility, so sharing a current note does not expose an older private revision. Staff tasks have an owner, client association, priority, due time and controlled status.

## Trading-account model

`brokerage_offerings` configures a provider/catalog ID, optional scoped connection, live/demo type, allowed currencies, leverage choices, exact minimum funding, enabled/KYC flags, country/type/age/terms eligibility and provider mapping such as server, group, commission/spread/swap plan. Existing offerings do not imply a connector is available.

`brokerage_accounts` is a provider-neutral request/linkage registry. It records the client and offering, provider/connection, display account number, currency/leverage/type, lifecycle, external identifier/login, provider server/group, provisioning mode, sync status, revision/time and safe failure code. Account states are `requested`, `provisioning`, `provider_pending`, `active`, `read_only`, `disabled`, `restricted`, `failed`, `closed` and `archived`.

An account request checks the current business rules, offering options, KYC and exact terms. An unavailable connection or creation capability yields `provider_pending`, manual provisioning mode and unavailable synchronization. Staff can confirm a manual linkage only with an external account ID and operational evidence reference. Confirmed external IDs cannot be rewritten. This records a confirmed external account; it does not create one in a trading platform.

Provider synchronization is represented by explicit states, timestamps and a capability-gated adapter boundary. No scheduled live trading synchronization, provider balance, execution, order/position mutation or password reset is claimed without an implemented adapter.

## KYC workflow and private documents

`brokerage_kyc_cases` separates strategy, provider status and the CRM decision. Manual KYC is a working strategy; pluggable providers implement creation, status, additional information, cancellation and signed-webhook behavior. External strategies remain unavailable until configured. CRM states are `required`, `submitted`, `in_review`, `additional_information`, `approved`, `rejected` and `expired`. An open-case uniqueness rule prevents simultaneous open cases for one scoped client.

Staff review requires a reason; approval also requires a review-evidence reference. Decisions write immutable KYC events and update the client's verification state. Business activation remains a separate eligibility-checked action. These engineering workflows do not establish legal or regulatory compliance.

Document registration accepts bounded metadata only: case, kind, safe filename, allowed content type and size. It persists `awaiting_upload`, pending scan state and `encryption_confirmed=false`. Verification returns safe metadata and an honest unavailable-storage flag. It exposes no public object URL, local production path, storage object key or uploaded bytes.

The `PrivateKycDocumentStorage` boundary requires encrypted private objects, validated server-side receipts, content/size checks, scan state and short-lived authorized access. `UnconfiguredPrivateKycStorage` rejects upload/access until such an implementation is configured. Manual review uses independently held evidence; registered metadata must not be mistaken for submitted or scanned private documents.

## Operational finance

Payment methods may be manual or provider-backed, with currency, deposit/withdrawal and enabled controls. Deposit and withdrawal requests require an active live account owned by the client in the requested currency. Internal transfers require two different, eligible accounts owned by that same client. Composite database relationships prevent a request from claiming another client's account even within one instance.

Amounts are exact decimal strings with up to 20 integer digits and eight decimal places; PostgreSQL stores `numeric(28,8)`. JSON numbers, signs, exponent notation, zero and excessive precision are rejected. No JavaScript floating-point arithmetic computes money. Payout totals are summed in PostgreSQL.

| Workflow | Behavior |
| --- | --- |
| Deposit | `pending → processing/requires_action → completed`, with failure/cancellation paths and confirmed-reference reversal. Clear review is required before completion. Legitimate retries create separate immutable observations. |
| Withdrawal | `requested → review → approved → processing → paid`, with rejection/cancellation/failure paths. Clear review precedes approval/payment. |
| Internal transfer | An intent remains `provider_pending` while provider movement is unavailable; cancellation/rejection are supported. No balance is changed. |
| Transaction history | Immutable observations of allowed payment-request transitions, not a double-entry ledger or proof of provider balance movement. |

Manual completion/payment requires an independently confirmed external operational reference. Provider-backed methods cannot be marked settled through manual status changes while their adapter is unavailable. The CRM does not credit/debit a trading balance, execute a transfer, reconcile a remote statement or fabricate settlement.

Maker/checker is enabled by default. The maker cannot review/process the request; approval requires a staff identity distinct from both maker and reviewer. The successful acceptance fixture uses three distinct finance staff per business. Authorized finance policy changes can configure maker/checker and the referral attribution window, but require interactive high-risk confirmation.

Approval, processing, completion/payment, reversal, manual account/KYC confirmation, credential-sensitive connection actions and destination reveal require an interactive business staff session, a correct current `X-Reauth-Password`, enrolled MFA and session MFA verification within 15 minutes where the route invokes the high-risk guard. Service/API credentials cannot perform these interactive actions. The guard runs before idempotency replay.

Withdrawal and partner-payout destinations use authenticated encryption bound to the request, client, purpose and all four tenant IDs. Normal responses expose a masked summary. Plaintext destinations are excluded from lists, transaction observations, audit, outbox and replay results; reveal requires finance processing authorization and is audited.

## IB and affiliate foundations

Partners have controlled `applicant → review → approved → active` progression and suspension/rejection/closure paths. Clients can apply; staff make business decisions. Approved partners have a referral code and instance-scoped client-portal referral link. Attribution is first-touch, unique per client, within the configured window, restricted to an active scoped partner and rejects self-referral.

Commission plans support CPA, revenue share, per lot and hybrid models using decimal configuration. Immutable accruals require staff evidence/source references; unavailable trading data cannot automatically generate commissions. A plan already used for accruals must be replaced by a new version rather than rewritten.

Partner payout requests select available accruals. Locked rows and a unique active allocation prevent double allocation; exact PostgreSQL totals determine the amount. Cancellation/rejection releases allocations while preserving history. Payout review, approval, processing and payment follow the same separation, MFA, destination-encryption and evidence rules as finance. No provider-derived commission engine or automated settlement is included.

## White-label portals and routes

Core keeps `/core/:section`. Brokerage business administration uses `/admin/:instanceId/:section`; the customer portal uses `/portal/:instanceId/:section`. Existing domain resolution chooses the authorized instance and portal, and existing branding supplies names, colors, logos, legal/support links and footer. A hostname selects a workspace but never grants membership.

| Business section | Implemented surface |
| --- | --- |
| `overview` | Scoped customer/account/KYC/payment/partner/task aggregates with linked operational queues |
| `clients`, `tags`, `consent-documents` | Client search and filtering, detail dialog, invitations, lifecycle, profile, activity, consent history, private notes/history, segmentation, assignments, tasks and versioned documents |
| `accounts`, `offerings` | Account requests and registry, offering configuration, external linkage confirmation and state controls |
| `kyc` | Review queue, case decisions, evidence reference and safe document metadata |
| `deposits`, `withdrawals`, `transfers`, `transactions`, `payment-methods` | Operational finance lists/forms, reviews, confirmations, masked destinations and immutable observations |
| `partners`, `referrals`, `commission-plans`, `accruals`, `payouts` | Partner applications/status, attribution, plan assignment, evidence-backed accrual and payout workflow |
| `tasks` | Staff operational backlog |
| `reports` | Scoped date-filtered operational aggregates by status, kind and currency; provider balances remain unavailable |
| `notifications`, `email-templates` | Recorded notifications and event-template management |
| `connections`, integrations/request sections | Scoped provider credential/status registry and existing global marketplace/request workflow |
| `brokerage-settings` | Client eligibility, KYC/account-request rules, maker/checker and referral-window controls |
| Existing governance sections | Staff, roles, branding, domains, API/webhooks, audit and workspace security settings |
| `trading-hub` | Configured/provisioned Trading Hub handoff or an explicit awaiting-provisioning state |

Customer sections are `overview`, `onboarding`, `profile`, `accounts`, `open-account`, `verification`, `deposits`, `withdrawals`, `transfers`, `transactions`, `ib`, `notifications`, `support`, `security` and `trading-hub`. They expose only the signed-in customer's data and appropriate creation/cancellation actions. Support uses configured business contact links; a support ticketing system is not implemented. Reports are operational aggregates, and no CSV export or external business-intelligence engine is implemented.

## Permissions and HTTP contracts

The catalog adds 23 `brokerage.*` permissions to the 18 Core permissions: client and note read/write, account read/write, KYC read/review, finance read/write/approve/process, partner read/write, report read/export, settings write, connection read/write, communications read/write and task read/write. Full business-admin roles inherit Brokerage operations; narrower existing Core roles retain their boundaries. Declaring `brokerage.reports.export` does not imply an export endpoint.

Staff prefix: `/api/v1/instances/:instanceId/brokerage`. Client prefix: `/api/v1/client/instances/:instanceId/brokerage`. See [client API](brokerage-clients-api.md), [account/KYC API](brokerage-accounts-api.md), [finance/IB API](brokerage-finance-api.md) and [API architecture](api-architecture.md) for resource contracts.

Domain and workflow lists use `{data, pagination:{total,limit,offset}}`, bounded server-side filters and allowlisted ordering. Configuration lists such as tags, consent documents, payment methods and email templates return `{data}`; their portal tables filter and paginate the returned collection locally. Notifications are server-paginated and do not offer unsupported search. Strict schemas reject ownership overposting. Session mutations retain Origin/CSRF checks. Brokerage mutations reuse transactional idempotency; account/KYC/connection and monetary mutations require `Idempotency-Key`. Replay returns the stored result in the same authorized scope without repeating the business operation; a changed payload conflicts. Authentication, current hierarchy and high-risk confirmation are checked before replay.

## Database and migrations

Forward migrations preserve the applied Core migrations 001–008:

| Migration | Change |
| --- | --- |
| `009_brokerage_shared.sql` | Brokerage permission definitions, full-admin role upgrade, scoped notifications and email templates |
| `010_brokerage_clients.sql` | Clients, tags, client tags, notes, immutable note revisions, assignments, tasks, settings, immutable consent documents and consent snapshots |
| `011_brokerage_accounts_kyc.sql` | Scoped provider connections, offerings, account registry, KYC cases, document metadata and immutable KYC events |
| `012_brokerage_finance_ib.sql` | Finance settings, payment methods/requests, immutable transaction observations, commission plans, partners, immutable referrals/accruals, payouts and allocations |
| `013_brokerage_catalog_activation.sql` | Upgrade existing Brokerage product modules/description and grant Brokerage permissions only to roles with the complete original business-admin permission set |
| `014_brokerage_catalog_scope.sql` | Apply the catalog metadata update under the explicit owner migration context required by forced RLS |
| `015_brokerage_workflow_observations.sql` | Remove request/status observation uniqueness so allowed processing retries each retain their immutable event; locked request rows and idempotency remain |

There are 28 Brokerage tables. All have enabled and forced RLS using the four-field scope. Composite FKs bind children to the exact client, account, offering, connection, KYC case, payment method, partner and payout/accrual ownership. Append-only mutation grants protect consents, note revisions, KYC events, transaction observations, referrals and accruals. Published consent content has a database immutability trigger.

| Domain | Tables |
| --- | --- |
| Shared communication | `brokerage_notifications`, `brokerage_email_templates` |
| Clients/onboarding/work | `brokerage_clients`, `brokerage_tags`, `brokerage_client_tags`, `brokerage_notes`, `brokerage_note_revisions`, `brokerage_staff_assignments`, `brokerage_tasks`, `brokerage_settings`, `brokerage_consent_documents`, `brokerage_consents` |
| Accounts/KYC | `brokerage_connections`, `brokerage_offerings`, `brokerage_accounts`, `brokerage_kyc_cases`, `brokerage_kyc_documents`, `brokerage_kyc_events` |
| Finance/IB | `brokerage_finance_settings`, `brokerage_payment_methods`, `brokerage_payment_requests`, `brokerage_transactions`, `brokerage_commission_plans`, `brokerage_partners`, `brokerage_referrals`, `brokerage_commission_accruals`, `brokerage_partner_payouts`, `brokerage_payout_allocations` |

Indexes cover scoped client lifecycle/KYC/staff/search, tag membership, note/client chronology, task backlog, consent versions, offering/connection state, account worklists/client ownership/external identity, KYC worklists and open cases, document/case history, payment queues/client history, partner/referral/accrual/payout work and unique active allocation. These support bounded queries; they do not certify unmeasured production scale.

## Events, notifications and email

Business changes, safe audit entries and outbox events commit atomically. Event names use `brokerage.*`; examples include client/profile/status, account request/status, KYC document/decision, deposit/withdrawal/transfer, partner/referral/commission/payout, notes/tasks/tags, templates and connection changes. The outbox uses the existing `payload.scope` envelope, with four tenant IDs, resource type/ID and audit-event ID for matching webhook fanout.

Client messages require explicitly resolved customer ownership, including partner and payout relationships. Internal note/task/assignment/risk/tag events remain staff-only. Templates allow only `business_name`, `client_name`, `client_number`, `event`, `status` and `support_email`. Expressions, property access, prototype variables and malformed braces are rejected. Text is rendered as plain text.

Queued `brokerage.email` content is encrypted. The worker rechecks the recipient's active identity, email, client membership and complete tenant/product hierarchy before delivery. Internal email envelopes are excluded from webhook fanout; a missing handler fails/retries rather than falsely completing. The existing Resend abstraction requires a configured provider key and verified sender. Local tests prove encrypted queueing and handler behavior, not external delivery. External effects remain at least once and depend on provider handling of the stable outbox event idempotency key.

## Verification and measured baseline

[Brokerage acceptance](brokerage-acceptance.md) records an isolated real PostgreSQL 16/TLS run for ABC Markets and XYZ Markets: independent workflows, three real MFA enrollments per business, exact money, maker/checker rejection, audit/redaction, positive scoped data and direct adversarial controls for all 28 tables. [Security review](brokerage-security-review.md) records the reproduced and corrected event-fanout, encrypted-email, identity re-review, note-history and payment-retry boundaries.

The recorded performance baseline uses 50 requests per operation at concurrency five, real PostgreSQL, 252 fixture clients and current search/status/sort/pagination parameters:

| Operation | p50 | p95 | p99 | Errors |
| --- | ---: | ---: | ---: | ---: |
| Filtered/sorted scoped clients | 56.23 ms | 227.43 ms | 247.01 ms | 0 |
| Client profile | 64.54 ms | 70.15 ms | 70.65 ms | 0 |
| Scoped accounts | 48.12 ms | 52.73 ms | 55.08 ms | 0 |
| Scoped transactions | 41.74 ms | 49.41 ms | 52.81 ms | 0 |
| Date-filtered scoped dashboard | 45.50 ms | 61.73 ms | 65.92 ms | 0 |

Fastify injection includes authentication, authorization, normal request limits, PostgreSQL and serialization; it excludes network latency and browser rendering. Account/transaction fixtures are small. With 50 samples, p99 is the slowest observation. These values are a local acceptance baseline, not production capacity evidence. The runner retains normal limits and distributes read measurements across staff sessions.

The [final verification report](brokerage-verification.md) records **190 passing tests across 16 files**, the calendar-date driver regression, exact browser interactions and the light/dark dashboard viewport matrix. It distinguishes API acceptance from browser evidence and records the final release checks separately.

The security follow-up targeted run passed 54 tests across the boundary, client and finance files, including 18 boundary regressions. This targeted count is distinct from the final overall regression-suite count.

## Deployment boundaries and next phase

Use the existing release process: verified-TLS PostgreSQL, separate runtime/migration logins, a protected HTTPS origin/ingress, explicit proxy trust, independently supervised API/worker, external secret management, backup/restore validation, heartbeat/queue monitoring and separate production domains/senders/provider accounts. Run forward migrations as a release step; staging/production do not automatically migrate/seed. Do not deploy private acceptance credentials or fixture artifacts.

Real live trading/payment adapters, remote settlement/reconciliation, provider balances, encrypted scanned private-document storage and configured external email/edge services require separate deployment integration and staging evidence. OAuth authorization-server features, automated brokerage accounting, production commission calculations, CSV exports, ticketing and Trading Hub collaboration are outside the implemented CRM operations. Existing domain/email abstractions do not constitute proof of external provisioning or delivery in this fixture.

The next logical phase is a separately authorized provider/storage integration release: implement one trading and payment adapter against the normalized interfaces, configure private KYC storage and scanning, validate receipts/webhooks/reconciliation and external idempotency in staging, then run public HTTPS multi-domain operational and disaster-recovery acceptance. Trading execution and Prop challenge logic remain in their respective products.

## Prompt 3 delivery map

| Requested final-response item | Documentation/evidence |
| --- | --- |
| 1. Baseline preserved | Architecture, API/security updates, forward-only migrations and [final regression evidence](brokerage-verification.md) |
| 2. Brokerage architecture | Ownership/runtime section above and [architecture](architecture.md) |
| 3. Client model | Client/onboarding section and [client API](brokerage-clients-api.md) |
| 4. Trading accounts | Account section and [account API](brokerage-accounts-api.md) |
| 5. KYC | Workflow/private-document section and account API |
| 6. Finance | Exact-decimal operational finance section and [finance API](brokerage-finance-api.md) |
| 7. IB/Affiliate | Partner/referral/commission section and finance API |
| 8. Brokerage Admin | Business route/surface table |
| 9. Client Portal | Customer route/workflow inventory |
| 10. Integrations | [Integration hub](integrations.md), six truthful catalog definitions and capability gating |
| 11. Database | Migration/table/index/RLS section |
| 12. API | API index and authorization/idempotency contract |
| 13. Security | [Security](security.md) and [review findings](brokerage-security-review.md) |
| 14. Tests | [Final verification report](brokerage-verification.md): 190 tests across 16 files |
| 15. Browser QA | [Final verification report](brokerage-verification.md): exact interactions, themes and viewports |
| 16. Performance | Recorded PostgreSQL baseline above and [acceptance evidence](brokerage-acceptance.md) |
| 17. Known limitations | Provider/storage/email and deployment boundaries above |
| 18. Next phase | Provider/storage integration recommendation above; not started by this documentation work |
