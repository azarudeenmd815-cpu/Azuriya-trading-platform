# Signed webhook delivery

Endpoints bind canonical tenant scope and optionally an active application. Subscription matching requires event type and exact instance scope. Unique endpoint/event delivery prevents duplicate fanout. Encrypted email/domain maintenance jobs never fan out. Disabled tenant/product/application scopes cannot send. Network effects happen after the source transaction commits.

The JSON envelope contains id, type and data. Headers identify event, delivery, timestamp, secret version and signature. Verify original raw bytes before parsing:

```text
v1=hex(HMAC-SHA256(secret, timestamp + "." + delivery_id + "." + raw_body))
```

Require five-minute timestamp tolerance and constant-time comparison. Persist receiver deduplication by stable event ID before acknowledging. Delivery ID remains stable across retries/replay. `verifyWebhook` is the reference fixture. Timestamp tolerance alone does not stop duplicates.

Per-endpoint secrets are random, encrypted in the scoped authenticated vault and visible once on create/rotate. Rotation is immediate with no old-secret grace period; coordinate receiver changes. Workers claim using SKIP LOCKED, random lease tokens and 30-second leases. HTTP has a ten-second hard deadline. 2xx succeeds; redirects are blocked; 4xx is terminal except 408/429. Network/5xx/408/429 retries use bounded exponential backoff/jitter; default max eight attempts. Exhaustion dead-letters; configured consecutive failure thresholds disable endpoints. Manual replay preserves event/delivery identity and appends completed attempt history, immutable to runtime. A crash can cause redelivery; abandoned leases are delivery state, not invented response attempts. Receiver bodies are discarded.

Only public HTTPS/443 URLs without credentials/fragments are permitted. Local names and every private/loopback/link-local/reserved/multicast/mapped-private address are rejected. DNS validation repeats per attempt; the selected address/family is pinned while TLS verifies the hostname. Redirects cannot escape checks. Deploy egress filtering as another boundary. See [Node HTTPS documentation](https://nodejs.org/api/https.html). The UI exposes endpoints, secrets lifecycle, search, retry/status, history and replay. Recording transport tests do not claim delivery to a real public receiver.
