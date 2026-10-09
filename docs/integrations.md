# Shared Integration Hub

One global `integration_providers` catalog serves Brokerage CRM, Prop CRM and future modules. Product-aware queries show relevant definitions; no separate CRM provider lists are stored. Initial definitions are Azuriya Brokerage, MT5, MT4, TradeLocker, cTrader and Match-Trader. These are catalog entries with request-only availability. Brokerage CRM operational clients/accounts/KYC/finance/IB are implemented; concrete external trading/payment connectors and an internal trading engine are not.

Both CRM marketplaces display `100+ One-Click Integrations` as the product heading, with explicit catalog/request-only states and only six actual seeded entries. The heading does not assert 100 working adapters. Catalog status and `connector_available` distinguish discovery from functional connection. Capabilities are separate metadata, not proof of a working adapter. DXtrade, other future platforms and custom providers can enter the scoped integration-request workflow and be implemented behind the same normalized contracts.

The initial six entries apply to a fresh installation. Catalog seeding adds missing definitions and preserves previously persisted providers and connection configuration. An upgraded local database can therefore contain additional legacy catalog records. Every unavailable connector exposes an empty `capabilities` array and a separate `planned_capabilities` array. Planning entries use the `planned.` namespace in stored capability metadata; they express desired adapter observations and cannot enable an operation. `connection_mode:request` denotes the current request workflow, while `status:request_only` denotes availability; these are separate fields.

Business admins submit provider name, website, category, current provider and notes. The service assigns trusted organization, brand, environment and product instance context, persists `integration_requests`, writes audit and outbox records, and exposes the request in Core triage. Core staff can assign a Core user/team, update priority/status and internal notes. Tenant lists omit internal notes and engineering-only information. Requested, reviewing, assigned, in development, testing, ready, connected, rejected and failed states are supported. Moving a request to connected must not claim an unimplemented connector is operational.

## Provider boundary

Provider operations belong behind a typed normalized trading-provider interface and capability registry. Future adapters expose account creation/read/update, enable/disable/reset, balance/equity/margin, group/leverage, orders/positions/trades/history/symbols, position closure and account event subscription as supported. Each adapter must declare capabilities and reject unsupported operations explicitly.

`src/server/domain/trading-provider.ts` defines those typed operations and their normalized account, account snapshot, order, position, trade, history, symbol and event records. Monetary amounts and volumes are decimal strings, and provider commands carry an idempotency key and reason. The operation registry requires both an available adapter implementation and its declared capability. `src/server/domain/integrations.ts` defines the shared adapter descriptor, vault-bound connection context and health boundary. No concrete external adapter is installed, so the registry exposes no functional trading operations in this phase.

Brokerage CRM and Prop CRM consume the Integration Hub. Azuriya Brokerage should implement the same provider interface. Prop rules consume normalized observations and emit decisions/provider commands; they must not contain provider-specific HTTP calls or trading execution.

External CRMs integrate through Azuriya API, keeping all six supported relationships possible: both CRMs with Azuriya Brokerage, both with external providers, and external Broker/Prop CRMs with Azuriya Brokerage through the API. Credentials belong in an authenticated AES-GCM vault abstraction with tenant/provider scope binding and an external secret reference, never in request logs or catalog rows. Secret storage fails closed without a configured 32-byte encryption key.

Future connector enablement must evaluate global availability, product, plan, organization and environment eligibility before connection. Real provider OAuth, credential testing, synchronization and remote health/reconciliation are the next integration phase; stored planned capabilities cannot enable them.

## Brokerage connections and account requests

Brokerage adds a scoped `brokerage_connections` registry referencing the shared provider ID. It records safe label/status, credential presence, health/synchronization timestamps and errors; credentials live in the existing encrypted vault. Creation/rotation/disconnection obey business role permissions and interactive confirmation for sensitive operations. Normal results never return the stored envelope/reference or plaintext credential.

`brokerage_offerings` optionally links a connection from the same four-field scope and same provider, with currencies, leverage, KYC/terms/business eligibility and provider server/group mapping. `brokerage_accounts` retains the provider-neutral request/linkage and synchronization state. Provider operations require both an available concrete adapter and the matching declared executable capability. Without one, connections remain `requested`, account requests remain `provider_pending`, sync remains unavailable and the UI reports that state.

Staff may confirm an independently created external account with its immutable identifier and evidence reference. That manual CRM linkage never asserts remote API provisioning, available execution or changed balances. Core migrations 013–014 upgrade the existing Brokerage product module metadata/full-admin permissions without rewriting foundational migrations or converting request-only providers into working adapters.

## KYC, payments and communication adapters

Manual KYC is a working CRM strategy. `KycProvider` defines normalized creation/status/additional-information/cancellation/webhook methods for future adapters. An unconfigured external provider reports unavailable rather than approved. Private-document storage is a separate capability: registered metadata remains awaiting upload until an encrypted private object store, receipt validation, scanning and short-lived access are implemented.

`PaymentProvider` defines the payment extension boundary. Provider-backed requests remain pending/unavailable; internal transfers cannot complete without actual provider balance movement. Manual deposits, withdrawals and payouts record independently confirmed offline references through the business review/approval workflow. They do not create remote settlement or an accounting ledger. Automatic trading-derived commissions await verified provider activity.

The existing email provider abstraction is wired to encrypted invitations and Brokerage event templates through the durable worker. Real email requires `EMAIL_API_KEY`, `EMAIL_FROM` and a verified sender. Matching audit/business events fan out through scoped signed webhooks; encrypted internal email envelopes do not. Missing email handlers retry/fail honestly. External effects depend on the provider honoring stable event idempotency keys.

See [brokerage-crm.md](brokerage-crm.md) for account/KYC/finance models, [brokerage-accounts-api.md](brokerage-accounts-api.md) for connection/registry contracts and [brokerage-finance-api.md](brokerage-finance-api.md) for operational payment/IB contracts. Public staging validation must prove any new adapter's remote effects, signed callbacks, permission/capability failures and reconciliation before advertising it as connected.
