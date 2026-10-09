# Trading connectors

TradeLocker **Brand API** is the first installed trading connector. It uses the provider's documented broker protocol and the existing `TradingProviderAdapter` boundary. It does not implement an Azuriya trading engine. Trading accounts, balances, positions and trades remain provider-owned state.

## Selection and external acceptance

The Prompt 4 audit found no configured trading provider credential names in the process environment and no trading provider credentials in the project's `.env`. The current configuration contains local application settings and the credential encryption key. Existing brokerage connection records and catalog entries are not evidence of authorized external access.

TradeLocker was selected according to the requested preference order because its official Brand API documents legitimate broker user/account creation, account management and account-filtered trading reads. The retail Public API uses trader JWT credentials and is a separate protocol; it is not used for brokerage account provisioning.

**External TradeLocker acceptance is pending authorized Brand API credentials.** Protocol fixtures and injected transport tests exercise real documented request/response contracts locally. They do not prove that a live TradeLocker server accepted an Azuriya operation. No provider test account or real-money transaction was created during local protocol verification.

## Environments and credentials

Every connection has one explicit environment, and its encrypted credential must declare that same environment:

| Azuriya connection environment | Fixed API origin | Provider account type | Purpose |
| --- | --- | --- | --- |
| `sandbox` | `https://api-dev.tradelocker.com` | `LIVE` | TradeLocker development accounts on the staging platform |
| `demo` | `https://api.tradelocker.com` | `DEMO` | Provider production infrastructure with demo trading accounts |
| `production` | `https://api.tradelocker.com` | `LIVE` | Live brokerage accounts; excluded from the acceptance harness |

TradeLocker explicitly requires `LIVE` type for its development environment. Treating `sandbox` as the production API's `DEMO` environment would be incorrect. Account references are also checked against the corresponding `L#`/`D#` prefix.

Store these fields through the scoped encrypted vault:

```json
{
  "brand_api_key": "<authorized-provider-key>",
  "environment": "sandbox"
}
```

Obtain a Brand API key through TradeLocker's authorized broker onboarding process. Provisioning requires a provider-issued read-write key. A read-only key can pass the safe groups-listing connection test, but that test does not prove write permission. Do not place a manager password, retail trader JWT, arbitrary API base URL or production key in a sandbox connection.

The adapter has no global environment variable holding a shared tenant API key. It reads the key from `context.vault` using the connection's organization/provider/product-instance binding for every operation. `SECRET_ENCRYPTION_KEY` remains an application-level prerequisite for that vault. API origins are fixed in code, credentials cannot silently switch environments, redirects are rejected by the connector runtime, and raw request/response bodies are not logged.

## Supported operations

Installed connector version: `1.0.0`.

| Normalized operation | Provider method and path | Supported capability |
| --- | --- | --- |
| Connection health | `POST /brand-api/v1/groups/all` | Nonmutating authenticated read |
| Create/reuse trader identity | `POST /brand-api/v1/users/check-by-email`, then `POST /brand-api/v1/users/create` when absent | Provisioning helper |
| Create account | `POST /brand-api/v1/accounts/create` | `account.create` |
| Read account | `POST /brand-api/v1/accounts/details` | `account.read` |
| Enable account | `PUT /brand-api/v1/accounts/activate` | `account.enable` |
| Disable account | `PUT /brand-api/v1/accounts/suspend` | `account.disable` |
| Assign group | `PUT /brand-api/v1/accounts/set-group` | `account.group.set` |
| Read balance/equity/margin | `POST /brand-api/v1/accounts/details` | `balance.read`, `equity.read`, `margin.read` |
| Read orders | `POST /brand-api/v1/orders/all` | `orders.read` |
| Read positions | `POST /brand-api/v2/positions/get-open-positions` | `positions.read` |
| Read trades | `POST /brand-api/v2/reports/trades-history-report` | `trades.read` |
| Synchronize/reconcile account | Account detail reads and account-scoped provisioning lookup | `account.sync` |

The adapter does not declare reset, direct leverage changes, arbitrary account updates, balance writes, funding, position closing, symbol metadata or realtime subscription capabilities. These operations cannot be enabled by changing a catalog flag. TradeLocker Brand Sockets require separate provider enablement; this phase uses durable polling and reconciliation.

Leverage is governed by provider groups/risk plans. The account-create protocol does not accept a leverage field. Account details requested with `withRiskDetails: true` may return `accountLeverage`, which is cached by TradeLocker for ten minutes. If the provider omits leverage, Azuriya leaves the normalized provider value absent instead of copying the requested offering leverage into a supposed provider receipt.

Provider `ACTIVE` with no trading-disabled reason normalizes to `enabled`. `RESTRICTED`, `SUSPENDED` and accounts disabled by a provider risk rule normalize to `disabled`; the safe provider status is retained for reconciliation. The adapter does not infer a KYC decision or local business approval from provider account status.

## Provisioning and external idempotency

Core must persist a durable operation and its stable UUID keys before network access. A trader identity command carries the selected client's email and a securely generated trader password only in memory. The password is encrypted before use and handled by Core's dedicated credential delivery lifecycle; it is never returned in the account DTO or stored in general account metadata.

The identity helper first checks the normalized email. An existing provider user is reused without changing their password. A provider 404 permits the first creation with a stable `Idempotency-Key` UUID only after the journal records `user_creation_started`. Other errors do not imply absence. The encrypted trader envelope binds the client/account and all four tenant dimensions, plus a hash of the chosen login identity. The secret is eligible for one-time release only when the successful create-user receipt explicitly confirms that this operation created the provider identity. Finding an identity after a lost response does not prove which password it uses; Azuriya removes the staged password instead of disclosing it.

Account creation requires a verified provider user UUID, an account name, currency, optional group and durable external reference. The adapter first lists that user's accounts and checks the exact `externalId`. A matching account is accepted only when the provider user, environment, currency and configured group match. Multiple matching accounts or a conflicting ownership/mapping result create an explicit reconciliation error instead of attaching an arbitrary account.

The create request carries the operation UUID in `Idempotency-Key` and the internal CRM account UUID in the stable `externalId` marker. Retrying the same request or creating a later recovery journal never changes that account marker. The identity step derives its own stable UUID key from the operation key. Both user-create and account-create document idempotency headers. `externalId` is a lookup marker; the documentation says the server stores it, and does not promise uniqueness. Azuriya's durable operation record, ownership validation and collision detection remain necessary.

On timeout or response loss, do not generate a new operation key. User/account creation sends the provider key but disables blind transport retries. Its durable marker remains set across process crashes, malformed success receipts and ambiguous errors. Recovery checks the normalized user identity and that user's accounts before another decision. If a started create has no verifiable result, it enters manual reconciliation rather than posting again. Legacy retries lacking the current durable marker protocol are also read-only recovery. The published documentation does not state an idempotency-cache retention guarantee; there is no invented 24-hour safe replay window for TradeLocker.

A proven rejection response (`400`, `401`, `403`, `422` or `429`), or an explicit runtime admission rejection before a request is sent, clears only that attempt's started marker. A later authorized/delayed retry still uses the original UUID. A 429 does not become a duplicate provisioning action: the worker respects the provider's backoff, performs the ownership lookup again and then issues the same approved request. Timeouts, 408s, malformed success responses and provider server failures cannot clear the marker by this rule.

All network access occurs outside a long-running database transaction. Before user/account mutation and when applying the receipt, scoped transactions recheck the current client/account ownership, approved KYC, offering availability/options, country and client type, age, required current consent hashes and brokerage request settings. The receipt's account/client/offering rows are locked for the commit. A client or account restriction arriving during provider I/O remains authoritative locally, one-time credentials remain unavailable and a durable provider disable is queued. A disconnected connection must not acquire new work, and a worker must not restore a disconnected connection merely because an earlier network request succeeded.

## Reads, synchronization and limits

All monetary/volume/price fields are validated as decimal **strings**, as required by the official endpoint schemas. The lossless JSON parser rejects duplicate keys and preserves numeric tokens until validated; a numeric financial field is rejected instead of converting a rounded JavaScript number back to a string. Only documented optional leverage converts to a safely representable number. Only selected safe DTO fields leave the adapter. Provider passwords, user emails, access tokens, raw payloads and broker comments are excluded from normalized account/trading responses.

Account IDs returned by details, orders, positions and trades must match the requested account. Account details also require a valid provider user UUID and explicit trading-disabled evidence. Before an enable/disable command, the worker authenticates the account's provider user against the previously verified owned snapshot, durable identity reference or a safe identity lookup. It checks the owner again on the resulting account and balance read. Position and trade requests include explicit provider account filters. Trades allow a valid date window of at most 31 days and a bounded output limit; current order reads support bounded offset/limit. Unexpected provider owners are rejected before output limits are applied.

Scheduled account synchronization stores at most **100 orders, 100 open positions and 100 recent trades** in `brokerage_accounts.trading_observations`. The object records its observation time, connector version and `limited: true`. Trade history polling covers the last 30 days; it is not a complete historical archive or a new `history.read` capability. The balance snapshot remains separate. A denied or failed trading-data read fails the sync operation and preserves the last successful observations rather than fabricating an empty successful result. The Admin and owning Client may view these provider observations through authorized read surfaces; neither can author orders, prices, margin or balances through this storage.

An owned authenticated receipt can resolve only matching account-state, missing-provider-record or ambiguous-operation discrepancies, with a bounded commit and audited resolution time. A successfully queued retry is not resolution evidence. Protected closed/restricted/read-only intent and any remaining provider mismatch keep their discrepancies open.

Provider account ownership checks complement local authorization: the caller must resolve the provider account reference from the authorized scoped CRM registry. An arbitrary account ID supplied by a client must never be passed directly to the adapter merely because the provider brand key can access it.

The documented default Brand API rate limit is **100 requests per ten seconds per token**. The shared runtime handles timeouts, bounded safe transport retries, 429 responses, circuit state, concurrency limits, safe errors and bounded metrics. Core's distributed PostgreSQL request gate permits at most 90 TradeLocker requests per ten-second token window and serializes its counters across workers/connections using the same token. The token is represented by a SHA-256 credential fingerprint; the raw key does not appear in counter rows or broad telemetry. This gate requires the shared PostgreSQL database and does not account for traffic sent by an unrelated external application using that provider token.

## External sandbox acceptance procedure

Use one isolated brokerage with an authorized development Brand API key and an offering mapped to the provider's approved group/risk plan. Confirm that the connection environment is `sandbox`, credentials say `sandbox`, and the resolved target is `api-dev.tradelocker.com`.

1. Run the safe connection test and record the provider environment, connector version and last checked time.
2. Complete the client's scoped eligibility/KYC workflow and request a test account through the CRM.
3. Let the durable worker create/reuse the trader identity and create the provider account using persisted UUID keys.
4. Fetch the created account, verify its provider user, `externalId`, currency, group and status, then read its exact balance/equity/margin snapshot.
5. Simulate a lost create response in the local transport harness and verify that recovery finds the same provider account reference. Do not create duplicate external accounts just to test retry behavior.
6. Reconcile a safe provider-side suspension if the sandbox permission allows it; record the discrepancy and source-of-truth decision.
7. Use a safe sandbox disable action when cleanup is required. Do not fund a live account, send real money or close real client positions.

Record real provider receipts and timings separately from local test fixtures. External latency, Azuriya internal latency and total elapsed time must be measured separately. A connection test failure caused by missing/invalid credentials is an honest unavailable state, not proof that the adapter protocol is accepted externally.

## Verification and official references

The targeted adapter and orchestration suites cover safe health/authentication, supported capabilities, environment binding, scope-bound vault rejection, UUID idempotency, durable user/account creation markers, provisioning reconciliation/collisions, lost-response recovery, proven rate-limit rejection, user reuse/creation, exact decimal snapshots, duplicate JSON keys, missing leverage, owner substitution before mutation, current eligibility revocation, compensating disable, bounded provider trading reads and matching discrepancy resolution. These are local contract and persistence tests with injected transport; their passing count does not establish external provider acceptance.

Primary documentation used:

- [TradeLocker Brand API setup](https://brand-docs.tradelocker.com/docs/getting-started)
- [Development, demo and live environments](https://brand-docs.tradelocker.com/docs/available-environments)
- [Create a provider user](https://brand-docs.tradelocker.com/reference/userscontroller_createuser_v1)
- [Check user by email](https://brand-docs.tradelocker.com/reference/userscontroller_getusersbyemail_v1)
- [Create a provider account](https://brand-docs.tradelocker.com/reference/accountcontroller_createaccount_v1)
- [Read account details](https://brand-docs.tradelocker.com/reference/accountcontroller_getaccountdetails_v1)
- [Read a user's accounts](https://brand-docs.tradelocker.com/reference/accountcontroller_getaccounts_v1)
- [Read orders](https://brand-docs.tradelocker.com/reference/orderscontroller_getallorders_v1)
- [Read open positions](https://brand-docs.tradelocker.com/reference/positionscontroller_getopenpositionsv2_v2)
- [Read trade history](https://brand-docs.tradelocker.com/reference/reportscontroller_gettradeshistoryreportv2_v2)
- [Brand API rate limits](https://brand-docs.tradelocker.com/docs/rate-limits)
- [Brand Socket enablement](https://brand-docs.tradelocker.com/docs/live-data-streaming)

The official reference pages expose their OpenAPI definitions through the corresponding `.md` pages. The documentation UI reports v1.8.0 while the embedded OpenAPI metadata currently reports 1.7.0. Account/create-user/create-account/order/position/trade endpoint schemas were rechecked on 9 October 2026; monetary fields remain documented strings and the create-user/create-account headers accept UUID idempotency keys. No undocumented account mutation or fabricated protocol version is used.
