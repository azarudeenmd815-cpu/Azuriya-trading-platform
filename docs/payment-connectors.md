# Payment connectors

The implemented payment connector is Stripe hosted Checkout, connector version `1.0.0`, pinned to API version `2025-06-30.basil`. The connector uses Stripe's documented HTTPS REST API through the shared connector runtime. Protocol fixture tests exercise the actual request and response shape. They do not establish that an external Stripe account is connected.

No Stripe API key or webhook signing secret was present in the inspected local configuration. External sandbox acceptance therefore requires an authorized Stripe sandbox/test account and its signing secret. No real-money transaction was performed.

## Supported operations

| Operation | Provider implementation | Boundary |
| --- | --- | --- |
| Connection test | `GET /v1/account` and `GET /v1/balance` | Read only; validates provider account and test/live mode |
| Create payment | `POST /v1/checkout/sessions` | Hosted card Checkout, one exact deposit amount |
| Get/reconcile payment | `GET /v1/checkout/sessions/:id` with expanded PaymentIntent, Charge and balance transaction | Validates scope, connection, internal request/account, amount, currency and environment |
| Cancel payment | `POST /v1/checkout/sessions/:id/expire` | Only an open unpaid session; a completed payment requires a refund |
| Refund | `POST /v1/refunds` with the verified PaymentIntent | Partial/full refunds; creation can remain pending or fail |
| Provider callback | Stripe HMAC signature verification over original bytes | Verified callback is a durable hint; authoritative provider reads determine business state |
| Settlement status | Expanded charge balance transaction | `pending`/`available` describes Stripe balance availability; it does not prove bank settlement |
| Withdrawal payout | Unsupported | Existing approved withdrawal workflow remains external processing required |
| Trading balance credit | Unsupported | Successful PSP payment requires a separate funding instruction; no local trading balance is created |

Hosted Checkout is intentionally limited to `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `CHF` and `JPY`. Stripe account, country and payment-method availability still apply. The CRM preserves eight decimal places. Conversion to Stripe's integer minor units uses `BigInt` and rejects any nonzero digits beyond currency precision. `12.34000000 USD` is exactly `1234`; `12.34000001 USD` is rejected. `50.00000000 JPY` is exactly `50`; `50.01 JPY` is rejected. The connector applies a conservative maximum of `99999999` minor units. It does not round or convert currencies.

## Configuration and isolation

Store credentials in the existing encrypted, scoped credential vault, using `secret_key`, `webhook_secret`, `environment` and optional `stripe_account_id`. `environment` must match the connection's sandbox/demo/production selection. The adapter rejects a test API key in production or a live key in sandbox/demo. A webhook signing secret is different from an API key and is unique to its endpoint and mode.

For Stripe Connect, `stripe_account_id` sets the documented `Stripe-Account` header and requires the same verified webhook account. Without that configuration, callbacks containing a Connect account or organization context are rejected. Do not reuse another tenant's signing secret.

Return URLs are fixed by the server for the brokerage portal. Production requires HTTPS; sandbox allows loopback HTTP for local testing. A return-page query parameter is navigation context only. It never completes a payment.

Each Checkout Session and its PaymentIntent carry a SHA-256 fingerprint of all four tenancy dimensions, the connection reference, request reference and internal trading account reference. No client email, name, card details or payout destination is sent in this binding. The adapter returns a narrow normalized DTO and excludes provider customer details, billing data, `client_secret`, API keys and raw payloads. Redirect actions accept only `https://checkout.stripe.com`.

## Idempotency and recovery

Every provider mutation uses the durable external-operation key. Retry the same operation with exactly the same parameters and key. Stripe documents that idempotency keys can be pruned after at least 24 hours. An ambiguous creation attempt outside that window must not blindly create a new session. Use the stored provider reference when available; otherwise quarantine it for reconciliation/manual review rather than risking a second payment.

The same retention boundary applies to refunds. A retry within the retained window uses the original durable key and approved amount, even if the first response was lost and the provider now reports a fully refunded payment. It retrieves that original result rather than creating a different refund. After 24 hours, an ambiguous refund requires reconciliation and manual review; it cannot reuse an expired key for another money movement. Credential changes do not erase the operation's original creation time or idempotency key.

The application must durably deduplicate `(connection, provider_event_id)` before business effects and independently deduplicate normalized financial observations. Distinct event types can report the same successful payment. A second event must not create a second completed deposit or funding instruction.

The adapter's `verifyWebhook` is synchronous and performs no provider I/O. It verifies the raw bytes, one signed timestamp, one or more `v1` signatures using constant-time comparison, a five-minute tolerance, test/live mode, provider account and binding where available. It rejects malformed/oversized payloads and unsupported event types. Stripe generates fresh signatures when retrying old events; the signed delivery timestamp is checked separately from the event creation time.

Persist the safe event hint, then perform `reconcileEvent` asynchronously. Refunds, charges, disputes and PaymentIntent events resolve through the unique Checkout Session associated with the PaymentIntent. All final payment reads validate the original scope and amount again. Event ordering is not trusted.

The authoritative payment must retain the signed callback's request, account, connection, scope, PaymentIntent and Charge bindings where supplied. PaymentIntent retrieval must return the exact requested reference. Charge callbacks must match the authoritative charge, and dispute callbacks must identify a dispute in the authoritative payment's evidence. A provider metadata change cannot redirect an already verified callback to another internal deposit.

## Financial observations

The normalized payment amount remains the original requested amount. `refunded_amount` is the cumulative provider-confirmed amount. A partial refund keeps the payment's canonical status completed and reports `reversal=partially_refunded`; a full refund or active/lost dispute reports reversed. Record only the newly observed refund difference in an append-only financial observation. Do not erase the completed payment or record the full original amount for each partial refund.

`refund_operation` records the safe refund reference, amount and current pending/requires-action/succeeded/failed/canceled state. A refund creation response does not itself prove a completed refund; the connector reads the cumulative charge evidence again.

Refund callbacks also retrieve the Refund object itself. A stale signed pending snapshot cannot hide an authoritative failed refund simply because cumulative refunded money is unchanged. Scheduled `payment.sync` checks up to three historical pending or requires-action refund references from the durable journal, including refunds outside the Charge object's most recent ten entries. It rotates checks by the oldest check time, preserves the original creation observation, and writes a separate `refund_reconciliation` snapshot. Terminal refund state is retained in safe sync-operation evidence and the audited observation. A failed refund does not create a refund transaction.

Stripe's `charge.disputed` means the charge has been disputed, including historical disputes. The connector reads the provider's dispute list and validates charge, PaymentIntent, currency, environment and amount. Active/lost disputes remain reversed; a won, prevented or closed warning dispute can return to the verified payment state. The previous dispute observation remains immutable.

Duplicate dispute references are rejected before amounts are accumulated. When one dispute is won while another remains active, record only the exact reinstated difference and retain the remaining reversal. The original completed deposit is recorded once even when the first successful provider observation already contains a full refund or chargeback. Reversal evidence must also confirm the original successful, captured payment. Completion, refund and chargeback adjustments remain separate append-only transactions.

Stripe documents that a disputed amount can differ from the original charge because of partial disputes or currency fluctuation. After validating the same payment, charge, currency and provider environment, preserve that positive exact dispute amount as a separate adjustment. The original deposit amount must still match the requested amount exactly; it is never rewritten to equal the disputed amount.

Separate external payment state, brokerage deposit intent, recorded business observations and trading-provider balance. Stripe payment completion creates funding pending until an independently supported and authorized trading adjustment is confirmed.

## Sandbox acceptance

1. Obtain authorized test-mode credentials and create the scoped encrypted payment connection.
2. Test the connection and verify the displayed account/mode without provider mutations.
3. Enable a supported currency on a provider payment method and select an eligible owned live trading account in that same currency.
4. Create a sandbox deposit. Verify one durable operation, one Stripe Checkout Session and the hosted checkout action.
5. Complete Stripe's test flow. Register the public HTTPS callback endpoint or use an authorized Stripe CLI listener with its own signing secret.
6. Verify that a signed callback is recorded, the provider is read, the deposit completes once, and funding remains pending.
7. Repeat the callback, omit a callback and reconcile, introduce a wrong amount/currency/scope event, and retry a lost creation response with the original key.
8. Exercise a test refund and record cumulative differences. Verify expired-session cancellation and connection disconnect behavior.
9. Lose a pending refund's callback, change its provider state to failed, and run payment reconciliation. Verify the historical reference is read, its safe state updates, and no refunded money is invented. Test a partial won dispute while another dispute remains active.

Only this provider-backed acceptance establishes external operation. Fixture tests and locally generated webhook signatures are reported separately.

## Primary references

- [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create)
- [Retrieve a Checkout Session](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [Expire a Checkout Session](https://docs.stripe.com/api/checkout/sessions/expire)
- [Create a refund](https://docs.stripe.com/api/refunds/create)
- [Retrieve a refund and its state](https://docs.stripe.com/api/refunds/retrieve)
- [Refund states](https://docs.stripe.com/api/refunds/object)
- [Refund listing and the Charge object's recent ten refunds](https://docs.stripe.com/api/refunds/list)
- [Idempotent requests and retention](https://docs.stripe.com/api/idempotent_requests)
- [Webhook signatures, raw bytes, retries and event handling](https://docs.stripe.com/webhooks)
- [Currency minor units and special cases](https://docs.stripe.com/currencies)
- [Charge amounts, refunds and disputed meaning](https://docs.stripe.com/api/charges/object)
- [Dispute list](https://docs.stripe.com/api/disputes/list)
- [Dispute states](https://docs.stripe.com/api/disputes/object)
- [Balance transaction availability](https://docs.stripe.com/api/balance_transactions/object)
