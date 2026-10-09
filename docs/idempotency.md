# Transactional idempotency

Keys contain 8–128 safe ASCII characters. The durable namespace includes identity/credential, canonical tenant scope, method, endpoint and route parameters. SHA-256 over recursively sorted canonical JSON detects changed retries. Different resource rotations cannot replay one another.

Unique claim, mutation, audit/outbox and result commit together. Concurrent requests serialize. Matching retries replay the result with Idempotency-Replayed=true; changed payload returns 409 IDEMPOTENCY_CONFLICT. Rollback/crash before commit leaves neither claim nor mutation. Default TTL is 24 hours; worker/request cleanup permits reuse after expiry. Authorization/tenant availability is checked before replay.

Protected operations include organization/user/staff creation, provisioning, domain registration, integration requests, invitation creation/rotation/revocation, API applications, service accounts, webhook registration/rotation/replay and support grants. Not every reversible update supports idempotency.

One-time secrets are removed from persisted/replayed responses and replaced by secret_replay_unavailable=true. Payloads are stored only as hashes; invitation tokens/passwords do not enter replay DTOs. Losing a first secret response requires a new rotation operation, not secret recovery through retries.
