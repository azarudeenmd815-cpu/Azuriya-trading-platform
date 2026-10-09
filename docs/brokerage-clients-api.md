# Brokerage clients API

Admin base: `/api/v1/instances/:instanceId/brokerage`.
Client base: `/api/v1/client/instances/:instanceId/brokerage`.
All mutations reuse Core CSRF/origin controls and the shared transactional idempotency wrapper. All records carry organization, brand, environment, and product instance scope.

Admin endpoints:

| Method / path | Body / query | Result | Permission |
| --- | --- | --- | --- |
| GET `/clients` | search, status, kyc_status, country, client_type, assigned_staff_id, source, tag_id, registered_from/to, limit, offset | `{data: Client[],pagination}` | brokerage.clients.read |
| POST `/clients` | full_name, email, country?, residence_country?, client_type?, preferred_currency?, birth_date?, source?, assigned_staff_id?, referral_source? | `{data: Client}` | brokerage.clients.write |
| GET `/clients/:id` | — | `{data: Client}` with tags and staff assignments | brokerage.clients.read |
| PATCH `/clients/:id` | Editable profile fields; risk_level and assigned_staff_id admin only | `{data: Client}` | brokerage.clients.write |
| POST `/clients/:id/status` | status, reason | `{data: Client}` | brokerage.clients.write |
| POST `/clients/:id/invite` | expires_in_hours? | `{data: invitation}` | brokerage.clients.write and staff.write |
| GET/POST `/clients/:id/notes` | category?, text, visibility?, pinned? on POST | `{data: Note[]}` / `{data: Note}` | brokerage.notes.read/write |
| PATCH/DELETE `/clients/:id/notes/:noteId` | category?, text?, visibility?, pinned? | `{data: Note}` | brokerage.notes.write; author policy |
| GET `/clients/:id/activity` | limit, offset | `{data: Event[],pagination}` | brokerage.clients.read |
| GET/POST `/tags` | name, color? on POST | `{data: Tag[]}` / `{data: Tag}` | brokerage.clients.read/write |
| PATCH `/tags/:id` | name?, color?, archived? | `{data: Tag}` | brokerage.clients.write |
| POST/DELETE `/clients/:id/tags/:tagId` | empty body | `{data: {assigned}}` | brokerage.clients.write |
| POST `/clients/:id/assignments` | role (account_manager/compliance_reviewer/support_owner), staff_id or null | `{data: Assignment[]}` | brokerage.clients.write |
| GET/POST `/tasks` | list: status?, owner_id?, client_id?, limit/offset; create: client_id?, owner_id?, title, notes?, due_at?, priority? | paginated tasks / task | brokerage.tasks.read/write |
| PATCH `/tasks/:id` | title?, notes?, owner_id?, due_at?, priority?, status? | `{data: Task}` | brokerage.tasks.write |
| GET/PUT `/settings` | allowed_countries, restricted_countries, allowed_client_types, minimum_age, require_kyc, allow_account_requests, onboarding_steps | `{data: Settings}` | brokerage.clients.read / brokerage.settings.write |
| GET/POST `/consent-documents` | POST document_type (terms/privacy/disclosure), version, title, content, required?, active? | `{data: Document[]}` / document | brokerage.clients.read / brokerage.settings.write |
| PATCH `/consent-documents/:id` | active?, required? only; published version text immutable | `{data: Document}` | brokerage.settings.write |

Client endpoints:

| Method / path | Body | Result |
| --- | --- | --- |
| GET `/profile` | — | `{data: Client|null}` (no notes, staff assignments, risk/source fields) |
| PATCH `/profile` | full_name, country, residence_country, client_type, preferred_currency, birth_date (each optional; name required on first save) | `{data: Client}` |
| GET `/onboarding` | — | `{data:{profile,settings,documents,consents,steps,eligibility}}` |
| POST `/consents` | document_id, document_hash | `{data: Consent}` records exact accepted text, hash, version and authenticated user |

Client records have `id`, `client_number`, `full_name`, `email`, `user_id`, `status`, `onboarding_status`, `country`, `residence_country`, `birth_date`, `client_type`, `preferred_currency`, `risk_level`, `kyc_status`, `source`, `referral_source`, `assigned_staff_id`, created/updated/activated/closed timestamps. New staff records start as `lead`; first self-profile save becomes `onboarding`. Internal UUIDs and display identifiers are separate. Lists default to 25 and cap at 100 rows; totals are scoped.

Lifecycle transitions are explicit: leads can be invited, registered, onboarded, rejected or closed; invited clients can register or onboard; registered clients can onboard or be restricted/closed; onboarding and KYC clients can progress toward review or activation, return for information, or be restricted/rejected/closed. Active clients can be restricted, suspended or closed. Restricted and suspended clients can be restored only by authorized staff, subject to current eligibility. Rejected clients can restart onboarding or close; closed clients remain terminal. Every status change requires an audit reason. Activation always validates current country/type/age/KYC/consent requirements, including when KYC is optional in business settings.

Settings default to no country restrictions, individual/corporate types, minimum age 18, required KYC, and enabled account requests. Eligibility returns `eligible` and explicit business rule reasons; onboarding does not claim regulatory compliance. Minimum age uses supplied date of birth; missing date blocks when an age threshold applies. Mandatory current consent versions must be accepted.

Notes remain internal and have immutable revision history. Non-author changes require `staff.write`. Client routes never join or return notes. Staff assignment verifies an active membership authorized for the product environment. Each meaningful mutation records safe audit/event metadata.

Identity linking uses the authenticated Core identity's email after active client membership is verified. A lead is claimed only in the same full scope and only if no other identity is linked. The invitation acceptance service retains password validation for existing identities and queues encrypted white-label email through the existing outbox. CRM profile creation does not create Core identities. Customer profile changes cannot supply status, user identity, staff assignment, risk or acquisition fields. Linked email changes use the Core identity workflow. Changing an approved client's country, residence, birth date or type invalidates approval and returns the profile to review; restricted/suspended/closed/rejected customers cannot self-edit.

`brokerage_consents` columns consumed by other modules: four scope IDs, `client_id`, `user_id`, `document_id`, `document_type`, `version`, `document_hash`, `accepted_content`, `accepted_at`, `request_id`, `ip_address`, `user_agent`. `brokerage_consent_documents` stores immutable `document_type`, `version`, `title`, `content`, SHA-256 `document_hash`, flags `required` and `active`. The same scope/client/document may be accepted once. Active versions are exposed by onboarding.
