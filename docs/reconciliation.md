# Connector reconciliation and failure recovery

Reconciliation compares an owned internal business intent with an authoritative external provider read. A successful HTTP return page, a signed event snapshot, or a successful worker lease does not by itself establish a completed payment, a funded trading account, or a resolved discrepancy.

The trading implementation polls the documented TradeLocker Brand API. The payment implementation reads Stripe Checkout, PaymentIntent, Charge, Refund and Dispute evidence. These reads use the shared connector runtime and encrypted scoped credentials. The [trading connector](trading-connectors.md) and [payment connector](payment-connectors.md) guides describe their provider-specific setup and supported operations. Local protocol fixture tests are separate from external sandbox acceptance.

## Durable operations

`connector_operations` stores all four tenant dimensions, the connection and credential revision, an internal account/payment reference, a durable provider idempotency key, attempts, lease, timestamps, safe evidence and reconciliation state. Its composite foreign keys prevent attaching a resource, credential or connection from another workspace. A partial unique index prevents concurrent active operations of the same type for one connection/resource.

| State | Meaning |
| --- | --- |
| `queued` | Committed work waiting for a lease |
| `running` | One worker holds the bounded lease |
| `retry_pending` | A retryable failure is waiting for its next attempt |
| `ambiguous` | An external mutation may have happened; retry must recover the same operation |
| `reconciliation_required` | Automatic execution cannot safely establish the result; manual review is required |
| `succeeded` | Safe provider evidence and allowed local effects committed |
| `failed` | A permanent operation error stopped execution |
| `cancelled` | Execution was revoked, including a connection disconnect |

Workers commit the lease before calling the provider. Provider I/O runs outside database transactions. Before committing results, the worker locks the connection and operation, checks the live lease and credential revision, and rechecks the resource binding. Disconnect and rotation use the same connection-before-operation lock order. A stale provider response cannot overwrite the replacement connection configuration.

The shared transport has request deadlines, response-size bounds, connection/global concurrency limits, bounded retries, provider `Retry-After` handling and a circuit breaker. Durable retries retain their original provider key and approved parameters. Invalid internal amount, ownership or eligibility requests fail their operation without declaring a healthy payment provider unavailable. Provider transport/authentication failures update connection health; failed staged credential rotation preserves the previous working credential.

## Trading recovery

Account creation stages the provider user reference and encrypted trader credential before creating the account. Creation uses the internal account reference as the provider external reference. Before any retry, it searches that provider user's accounts for the same external reference.

The account journal durably records when an external account creation attempt started. If the response was lost, an absent recovery result does not authorize another blind account creation. Old ambiguous operations also search for the existing provider user/account and stop for manual reconciliation when identity cannot be established. A provider reference is never adopted solely because it shares a display label.

Synchronization reads owned account status and exact provider balance/equity/margin, orders, positions and trades. These are provider observations, not a local trading engine. A deterministic observation fingerprint deduplicates unchanged poll evidence and preserves safe event receipts.

Provider restrictions can reduce an active account's operational state. Protected local restrictions and blocked client states remain protected; polling does not silently reactivate an account. A provider missing-record response records a discrepancy and failed sync state. If a client/account restriction arrives during successful creation or enablement, the result retains the local restriction and queues a provider disable when supported.

## Payment recovery

Payment request, external PSP payment, immutable business transaction and provider trading balance remain separate records. Every authoritative payment read must match the requested amount/currency, internal client/account, connection, four-field scope, provider environment and assigned Checkout reference. A provider payment completion records one completed deposit and `funding_pending`. This connector cannot credit a trading balance or perform brokerage withdrawals.

Signed Stripe callbacks are verified against the original raw bytes, a fresh signed delivery timestamp, the endpoint's scoped signing secret, provider environment and verified account context. The HTTP endpoint durably stores a safe hint and one outbox job. `(connection, provider_event_id)` deduplicates delivery; a reused event ID with different verified bytes is rejected. Worker reconciliation reads current provider evidence and retains the signed hint's request/account/PaymentIntent/Charge bindings.

Independent financial-observation fingerprints deduplicate distinct event types reporting the same payment state. Completed transactions remain immutable. Refunds record only newly observed cumulative amounts. Full refunds and chargebacks never erase the original completed transaction, including when completion's webhook was missed and the first paid observation already includes a reversal. A won partial dispute records only its exact reinstated difference while other active disputes remain reversed. Provider-confirmed dispute amounts can differ from the original charge; the original deposit amount remains unchanged.

Refund creation can be pending, require action, succeed, fail or be canceled. Refund callbacks retrieve the current Refund object; a signed pending snapshot is not authoritative once the provider reports failure. Payment sync also checks up to three historical pending/requires-action refund references from the durable refund journals, ordered by their oldest check. This recovers lost refund callbacks even when the refund is absent from the Charge object's recent-ten list. The original creation evidence remains stored, and a separate `refund_reconciliation` snapshot records the latest safe state. Failed refunds create no refund-money transaction.

Within Stripe's retained idempotency window, lost creation/refund responses retry the original key and parameters. Once an ambiguous operation is 24 hours old, it requires reconciliation/manual review; a possibly pruned key cannot authorize another payment or refund. A conflicting pending refund amount/reason is rejected rather than returning a different already-queued refund as though it were newly approved.

## Scheduling and worklists

The running worker invokes connector maintenance at most once per minute. Periodic work for the same resource/operation waits at least five minutes after its previous scheduling; one pass is bounded to 40 accounts/payments and selects the oldest scheduled work first. This prevents repeatedly failing early resource IDs from starving later resources. Work already queued, running, retrying, ambiguous or awaiting manual reconciliation is excluded from new scheduling.

Payments with a provider reference remain candidates after completion or reversal so missed refund/dispute callbacks can be recovered. Initial account/payment requests awaiting provider execution can also be picked up after their connection becomes validated, so an earlier unavailable connection does not permanently strand the request. Active-operation uniqueness prevents duplicate work for a resource already awaiting reconciliation. The active four-field tenant hierarchy and connection/provider binding are rechecked.

Business staff can read the scoped operations and reconciliation worklists through:

```text
GET /api/v1/instances/:instanceId/brokerage/connector-operations
GET /api/v1/instances/:instanceId/brokerage/reconciliation
```

Supported discrepancy classes include account-state mismatch, payment mismatch, funding pending, missing callback, missing provider record, ambiguous operation and credential change. Each stores the local/provider state, source-of-truth decision, action, provider reference and timestamps. The worklist exposes safe summaries without credential envelopes or raw provider payloads.

Authorized manual retry/reconcile requests require business staff permissions, password confirmation, enrolled recent MFA and an idempotency key. Payment recovery also requires finance-processing permission. These requests create an audit event before queued execution. They do not make a failed operation successful or resolve a discrepancy merely because the operator clicked a button.

```text
POST /api/v1/instances/:instanceId/brokerage/connector-operations/:id/retry
POST /api/v1/instances/:instanceId/brokerage/reconciliation/:id/reconcile
```

The retry budget is bounded, including manual recovery. A funding-pending discrepancy cannot be resolved by this connector's unsupported trading-credit action. It remains a visible operational obligation requiring a separately supported and authorized funding workflow.

Payment observations can resolve at most 50 open payment-state/missing-callback discrepancies per verified commit when the same provider reference, exact amount/currency and actual committed state agree. The same proof works when an unchanged financial observation was deduplicated. Resolution preserves the row's original discrepancy evidence, records `resolved_at`, and emits an audited resolution receipt. Stale snapshots, protected local-intent/financial-review rows and funding obligations remain open. Underlying payment completion does not prove an ambiguous refund outcome; refund ambiguity requires its own authenticated receipt. A cancel ambiguity can close only when cancellation itself is verified.

## Verification and acceptance

The payment protocol/persistence tests cover exact amount/currency and scope binding, lost-response retained-key recovery, original completion recovery, incremental refunds, mixed won/active disputes, duplicate observations, missing refund callbacks and immutable transactions. The HTTP callback tests use actual Fastify routes and encrypted fixture credentials to check raw-byte signatures, stale/forged delivery, cross-connection/tenant substitution, duplicate receipts/outbox effects, event collision, malformed/oversized bodies, recent-MFA credential mutations and client payment-session IDOR.

Production acceptance must additionally use the restricted network PostgreSQL runtime role to prove RLS/composite ownership and concurrency behavior, then authorized external sandbox credentials to prove provider receipts and recovery. Embedded PostgreSQL serialization and locally generated signatures do not establish real provider acceptance or distributed callback concurrency. No real-money transaction is part of this phase's acceptance.
