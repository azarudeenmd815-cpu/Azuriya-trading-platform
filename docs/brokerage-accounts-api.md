# Brokerage accounts, verification and connections

Staff prefix: `/api/v1/instances/:instanceId/brokerage`. Client prefix: `/api/v1/client/instances/:instanceId/brokerage`.

All mutations require `Idempotency-Key`. Reads return `{data:[...],pagination:{total,limit,offset}}` for lists, `{data:{...}}` for individual objects. Mutations return `{data:{...}}`. List parameters are `limit` (1–100, default 25), `offset`, optional `status`, `client_id`, and `search`. Client routes derive the customer from the authenticated membership; no client identifier is accepted from a client request.

| Staff route | Permission | Body / result |
| --- | --- | --- |
| GET `/offerings` | `brokerage.accounts.read` | Scoped configured offerings |
| POST `/offerings` | `brokerage.accounts.write` | `{name,provider_id,account_type:'live'|'demo',currencies:['USD'],leverage_options:[100],minimum_funding:'0.00',enabled:true,requires_kyc:true,connection_id?,provider_mapping?:{server?,group?},eligibility?:{allowed_countries?,restricted_countries?,client_types?,minimum_age?,required_terms?:[{document_type,version}]}}` |
| PATCH `/offerings/:id` | `brokerage.accounts.write` | Any offering field above; provider mapping changes are audited |
| GET `/accounts` and `/accounts/:id` | `brokerage.accounts.read` | Registry rows with offering/client name, request/sync state; no provider passwords |
| POST `/accounts/requests` | `brokerage.accounts.write` | `{client_id,offering_id,currency,leverage}`; validates eligibility and records provider-neutral request |
| POST `/accounts/:id/status` | `brokerage.accounts.write` + recent MFA | `{status,reason,external_account_id?,external_login?,external_reference?}`; manual active confirmation requires external account ID and evidence reference |
| GET `/kyc` | `brokerage.kyc.read` | Paginated KYC cases with client name |
| POST `/kyc/cases` | `brokerage.kyc.review` | `{client_id,provider_id?}`; defaults to manual strategy |
| POST `/kyc/:id/review` | `brokerage.kyc.review` + recent MFA | `{status:'in_review'|'additional_information'|'approved'|'rejected'|'expired',reason,external_reference?}`; approval requires evidence reference |
| GET `/kyc/:id/documents` | `brokerage.kyc.read` | Safe document metadata; sensitive metadata access audited |
| POST `/kyc/documents` | `brokerage.kyc.review` | `{case_id,kind,filename,content_type,size_bytes}`; metadata record only, awaiting private upload |
| GET `/connections` | `brokerage.connections.read` | Provider, status, actual capabilities, health/sync fields, credential presence boolean |
| POST `/connections` | `brokerage.connections.write` + recent MFA | `{provider_id,label,credentials?:{...}}`; optional credentials encrypted with existing vault; unavailable connectors remain requested |
| POST `/connections/:id/rotate` | `brokerage.connections.write` + recent MFA | `{credentials:{...}}`; previous credential revoked, response redacted |
| DELETE `/connections/:id` | `brokerage.connections.write` + recent MFA | Disables connection and revokes stored envelope |

| Client route | Body / result |
| --- | --- |
| GET `/offerings` | Enabled offerings with `eligible:boolean` and `eligibility_reasons:string[]` |
| GET `/accounts` and `/accounts/:id` | Customer's own registry only |
| POST `/accounts/requests` | `{offering_id,currency,leverage}` |
| GET `/verification` | `{client_id,kyc_status,cases:[...],documents:[...],storage:{available:false}}`; metadata has no object keys or public URLs |
| POST `/kyc/cases` | `{provider_id?}` |
| POST `/kyc/documents` | `{case_id,kind,filename,content_type,size_bytes}`; case must belong to customer |

Account states: `requested`, `provisioning`, `provider_pending`, `active`, `read_only`, `disabled`, `restricted`, `failed`, `closed`, `archived`. Connectors without a real adapter cannot produce `active` or available operations. Manual activation is a distinct, audited CRM linkage to an externally confirmed account. Confirmed external account identifiers are immutable. No handler moves balances or executes trades.

All list routes accept Core's bounded `sort` and `direction` parameters. Ordering uses a static per-resource column whitelist; unsupported columns fall back to creation time. KYC submission advances eligible onboarding profiles to `kyc_pending`; a review or approval advances `kyc_pending` to `kyc_review`. Approval updates KYC status and leaves business activation to a separate, eligibility-checked client decision.

Private KYC storage is an extension boundary. This phase records truthful `awaiting_upload` document metadata and manual review evidence; it does not return pretend upload URLs or local production paths. External KYC strategies are pluggable and report unavailable until configured. Account eligibility uses current KYC, country, client type, age and durable versioned consent.
