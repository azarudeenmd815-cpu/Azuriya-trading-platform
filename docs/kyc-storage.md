# Private KYC document storage

Prompt 4 adds private file bytes to the existing tenant-owned KYC document registry. The implementation uses an S3-compatible storage interface and ClamAV's `clamd` INSTREAM protocol. Existing case decisions remain independent of upload, malware scan, reviewer rejection and retention state.

## Configuration and deployment

Set these values through the deployment secret manager, never in committed files:

| Variable | Purpose |
| --- | --- |
| `KYC_S3_REGION` | Storage signing region. |
| `KYC_S3_BUCKET` | Private versioned bucket. |
| `KYC_S3_ACCESS_KEY_ID`, `KYC_S3_SECRET_ACCESS_KEY` | Scoped storage identity. |
| `KYC_S3_ENDPOINT` | Optional approved S3-compatible HTTPS endpoint. Plain HTTP is restricted to loopback development fixtures and rejected in production. |
| `KYC_S3_KMS_KEY_ID` | Optional exact KMS key ARN; mutable aliases are rejected. Otherwise explicit AES256 encryption is required. |
| `KYC_CLAMAV_HOST`, `KYC_CLAMAV_PORT` | Loopback scanner sidecar address and port; port defaults to 3310. |
| `KYC_MAX_FILE_BYTES` | Optional positive upload limit up to 20 MiB. |
| `KYC_TENANT_QUOTA_BYTES` | Optional positive workspace byte quota; default 1 GiB. |
| `KYC_MAX_DOCUMENTS_PER_CLIENT` | Optional uploaded/reserved object count per client; default 50, maximum 1000. |
| `KYC_UPLOAD_ORPHAN_AGE_SECONDS` | Optional ambiguous upload reservation cleanup age; default 1800 seconds, allowed 60–86400. |

Storage configuration is all-or-none. Startup checks require all four public access block flags, a non-public bucket policy, bucket-owner enforced ownership, an owner-only ACL, enabled object versioning and the configured default encryption. Compatible providers must implement these checks; unsupported privacy checks fail safely rather than implying acceptance. Partial credentials or an unsafe bucket fail startup validation. A completely unconfigured store reports unavailable and never accepts file bytes.

The storage identity requires privacy/encryption/versioning inspection plus scoped object put, head, get-version and delete-version permissions for the KYC prefix. It needs no public ACL or website hosting permission. If KMS is used, grant only the required encrypt/decrypt/data-key actions on the chosen key. Use an exact full key ARN matching the provider's object response; mutable aliases are rejected during configuration parsing. ClamAV's TCP protocol has no built-in TLS/authentication, so this implementation permits only resolved loopback addresses and requires a scanner sidecar in the worker's network namespace. Remote private addresses are also rejected. A remote scanner needs an separately implemented and verified encrypted transport; plain remote TCP is not supported. Update signature databases using the operator's approved update process.

## Upload, quarantine and evidence

1. An authenticated business staff/client session registers metadata in an open owned KYC case. API keys, Core sessions and support sessions cannot obtain private bytes.
2. The upload route authenticates and checks scope before parsing binary bytes. It requires CSRF protection through existing session authorization, an idempotency key and `application/octet-stream`.
3. The server validates the declared file size, safe filename, extension, MIME and PDF/JPEG/PNG magic bytes. PDF, JPEG and PNG are the only accepted formats. A file signature check is not a complete file parser; quarantine and scanning remain mandatory.
4. A workspace lock serializes byte/count quota reservations. A document is bound to one checksum, a random upload token and a random key containing all four tenant scope identifiers. Object keys and hashes never appear in public document metadata.
5. Conditional S3 creation uses `If-None-Match: *`, explicit server-side encryption and a SHA-256 checksum. A receipt must match file length, MIME, checksum, encrypted state and a non-null object version. Retrying the same file reuses the reservation/key and cannot overwrite it.
6. Confirmed objects remain quarantined. A durable outbox scan reads the exact encrypted version, verifies its SHA-256, and sends the same bytes to `clamd`. Only a current clean response with matching hash, length, engine and signature-version evidence can make the file available. Missing, failed, malformed or infected scanner results cannot mark it clean.
7. Scan evidence is immutable and tenant scoped. A composite database foreign key binds document availability to the exact version/hash/evidence status. File upload success means encrypted persistence confirmed; it does not mean scan approval or KYC approval.

The upload widget reports byte progress separately from confirmed persistence, shows quarantine/scanner failure, polls briefly for scan completion and allows manual refresh and retry of the same registered file. Different file bytes require a new document record; reviewer replacement requests preserve the prior document and create a linked new record.

## Reviewer access and document decisions

Access uses authenticated, bounded file proxying rather than a permanent storage URL. The server rechecks membership, full tenant scope, client/workspace lifecycle, scan evidence, receipt, retention and deletion both before object I/O and before sending bytes. The exact-version read checks the approved SSE/KMS key, SHA-256 and size, and applies a 15-second deadline to headers and body streaming; stalled bodies are destroyed. Responses use `no-store, private`, `nosniff`, attachment disposition and restrictive content security policy. This avoids a storage bearer URL that stays usable after deletion or membership revocation; no object key is accepted as authorization. The UI offers a temporary local preview of fetched safe-format bytes, sandboxes PDF frames without script permission, and removes its blob URL when closed or unmounted. Previously delivered bytes cannot be recalled from a reviewer's device, so revocation controls future requests rather than promising remote deletion of a local copy.

Reviewer actions require the existing KYC review permission; rejection, replacement requests, holds and deletion require current password confirmation plus recent MFA. Rejection/replacement decisions do not rewrite malware results or KYC-case approval. They revoke document byte access independently and retain a reason, actor and timestamp. Replacement upload requires an open case and creates a new linked document, preserving the prior evidence. Every successful upload, byte access, review decision, hold, deletion and retention action is audited without file contents or storage coordinates.

## Retention, holds and failure recovery

There is no invented regulatory retention duration. An authorized operator explicitly configures a workspace retention period in days, or leaves automatic deletion disabled. Policy changes update existing schedules. A legal hold blocks requested and scheduled deletion. Deletion first commits `deletion_pending`, immediately denying byte access; a worker then permanently removes the exact version and commits `deleted`. Closed clients can still be cleaned by the internal retention/deletion workflow while their byte access stays denied.

Ambiguous uploads reserve quota and remain inaccessible. Cleanup first confirms the original matching version before deleting bytes. A missing/uncertain provider receipt is not treated as proof that no late upload occurred; cleanup remains pending for operator investigation/retry. Outbox jobs retain normal bounded retry/dead-letter behavior. An operator must restore scanner/storage configuration and retry a failed document job through existing worker recovery procedures. Do not mark a pending job complete or forge clean evidence to recover it.

## Verification and external acceptance

`tests/kyc-storage.test.ts` exercises protocol fixtures and a real PostgreSQL-compatible local database engine for ownership, reservation races, evidence constraints, safe access, legal holds, deletion, retention and authenticated route behavior. The TCP ClamAV fixture is a protocol test server; it is not a real antivirus engine. The S3 fixture is not external object storage. Network PostgreSQL acceptance is recorded separately in the Prompt 4 acceptance report.

Real external storage/scanner acceptance requires configured authorized infrastructure: upload a fictional test PDF, verify the bucket/object remain private and versioned/encrypted, complete a real ClamAV scan, access through an authorized reviewer session, revoke access through deletion/retention and confirm exact version deletion. No production client documents should be used for acceptance. Until that run exists, private storage implementation is staging ready, but external private-storage/antivirus acceptance is unverified.

Protocol references: [Amazon S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html), [Amazon S3 DeleteObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html), [ClamAV scanning](https://docs.clamav.net/manual/Usage/Scanning.html), and [ClamAV signature databases](https://docs.clamav.net/manual/Usage/SignatureManagement.html).
