# Prompt 4: external connector activation

The user's Prompt 4 is the accepted product brief. This implementation preserves the 190 existing tests and migrations 001–015. It activates external connectivity, not a native trading engine. Provider choice is delegated by the brief; no additional routine approval is needed.

## Repository audit before implementation

- Trading operations and capability gating exist in `domain/trading-provider.ts`. All shipped catalog entries remain request-only. Account requests persist `provider_pending`; no provisioning handler or external operation journal exists.
- The scope-bound AES-GCM credential vault exists. The original connection service calls validation inside a transaction and rotation activates new credentials before validating them. Implemented connectors require asynchronous staged validation and compare-and-swap activation, preserving old credentials on failure.
- Finance preserves exact numeric(28,8) strings and immutable transactions. `PaymentProvider` currently returns unavailable. There are no PSP sessions, inbound provider callback verification, payment receipts, or provider reconciliation.
- KYC cases and document metadata exist. Private storage deliberately remains unavailable; bytes, upload validation, malware scanning, access grants, quotas and retention execution must be added.
- Core has transactional request idempotency, leased outbox jobs, bounded attempts, outgoing signed webhooks, rate limits, audit and restricted PostgreSQL runtime roles. Outgoing webhooks do not authenticate incoming PSP callbacks. Provider operations need their own durable idempotency and ambiguous-result recovery.
- The current worker handles invitations, email and domains. No connector handler, periodic provider reconciliation or health history exists. Readiness still reports catalog-only connectivity.
- Local environment files and process configuration contain runtime/database/encryption settings, but no authorized trading, PSP, object storage or scanner configuration. No external success can currently be claimed.

## Selected providers and boundaries

TradeLocker Brand API is selected from the preferred order using official Brand API documentation. Sandbox uses its documented development origin and LIVE account type; demo and production remain distinct. Only implemented documented operations are advertised. Stripe Checkout is selected for sandbox payments; exact minor-unit conversion rejects excess precision instead of rounding. It supports session creation/read/expiration and refunds, not brokerage payouts. S3-compatible private storage is configured by the operator; ClamAV provides actual scan evidence when available. Missing scanner access keeps uploaded objects quarantined.

## Durable orchestration

Persist four-field tenant-scoped external operations, verified provider event receipts, reconciliation discrepancies, append-only payment observations and connection health history. Existing account/payment request IDs remain internal business intents. A stable UUID is used for provider idempotency. Workers claim a bounded lease, commit the claim, call providers outside database transactions, then commit safe normalized results. Ambiguous attempts reconcile provider references before another create; old ambiguous operations never blindly create after an idempotency retention window. Disconnect, suspension, credential revision and ownership are rechecked before applying results.

Connections distinguish provider environment, connector version, actual health and supported capabilities. Validation and rotation are queued. Rotation retains working credentials until validation succeeds and the previous revision still matches. Authentication failures stop futile retries. Runtime requests have deadlines, bounded response size, concurrency, jittered retries, rate-limit handling and a circuit breaker. Metrics use bounded provider/environment/operation labels.

## Payment and callback trust

Stripe raw callback bytes are verified with its timestamped HMAC before recording an event. Connection resolution uses an unguessable connection identifier plus the connection's verified signature secret, never an untrusted tenant ID. Environment, provider account, request/scope binding, amount, currency and payment reference must match authoritative provider reads. Event uniqueness and normalized observation uniqueness prevent duplicate effects. A completed PSP payment becomes funding pending unless a separately supported and approved trading funding operation exists. Reversals append observations and preserve original completion evidence.

## Private KYC documents

Uploads are bounded, authenticated and tenant/client owned. Validate extension, MIME and magic bytes before private persistence; enforce document count and tenant byte quotas. Random scoped object keys never reach client metadata or general logs. Verify private bucket configuration and server-side encryption. Actual scan evidence controls availability. Authenticated short-lived document streaming/access rechecks permission, deletion and scan state. Upload, review, access, rejection, deletion, holds and configured retention actions are audited without file contents. Retention duration is explicit operator/tenant policy, never an invented regulatory default.

## UI and verification

Extend existing admin/client portals with real health/capabilities, safe connection testing/rotation, operational reconciliation, private upload and review, hosted payment actions and provider provisioning states. Preserve existing branding, permission checks, mobile navigation and accessible table scrolling. Test contracts using clearly identified protocol fixtures and adversarial failures, then all original tests, lint and builds. Verify every new tenant table on network PostgreSQL with forced RLS/composite ownership. Browser-check 390, 768 and 1440 plus the existing responsive coverage. Record external acceptance separately: missing credentials/infrastructure block external proof, not local implementation. No real-money transaction is authorized.
