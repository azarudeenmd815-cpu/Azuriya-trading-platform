# Provider runtime boundary

`src/server/connectors/provider-runtime` is the W10-owned boundary for future external trading adapters. It is deliberately separate from HTTP controllers, the existing durable connector worker, and the Integration Hub catalog.

## Contracts and registration

`contracts.ts` defines canonical family IDs, typed capability declarations, exact-decimal value shapes, tenant-scoped instance identity, lifecycle methods, and safe provider error codes. A provider operation is available only when it is both present on `operations` and listed in the adapter descriptor's `capabilities`; there is no unrestricted dynamic `execute` method.

`ProviderCapabilityRegistry` is dependency-injected. Register a `ProviderAdapterDefinition` once, then resolve its immutable descriptor or create a scoped adapter instance through its factory. Duplicate IDs and unknown IDs produce typed errors. Registry construction never contacts a provider.

The built-in MetaTrader 5, MetaTrader 4, TradeLocker, and cTrader definitions are family descriptors only. Their `capabilities` arrays are empty, `connectorAvailable` is false, and each operation returns `UNSUPPORTED_OPERATION`; they do not contain endpoints or credentials and never perform provider I/O.

## Lifecycle and health

`ProviderHealthRuntime.register` requires the trusted organization, brand, environment, product instance, and durable connection ID. The complete five-part key prevents same-provider or cross-tenant state sharing. Registration creates an `UNCONFIGURED` state; it does not validate a connection.

`check` moves the instance through `CONNECTING` and reaches `HEALTHY` only after the injected adapter initializes and returns an explicit healthy signal. Missing configuration is `UNCONFIGURED`; authentication, transport, timeout, provider-unavailable, unexpected, and unsupported health failures are safe nonhealthy results. Rate limiting is represented as `DEGRADED`. Checks have a bounded logical timeout, and generation checks prevent late or older concurrent promises from overwriting a newer observation. Diagnostics are bounded and redacted.

Initialization is deduplicated per scoped instance. Overlapping checks share one initialization promise; a timeout from the current check invalidates that promise so a later check retries initialization, while an older overlapping timeout leaves the newer check's shared initialization intact. A late completion cannot mark an invalidated instance initialized. Shutdown also invalidates initialization and prevents a late initializer from reaching `healthCheck`.

Cycle 3 acceptance: when a second check starts before the first check's deadline, expiry of the first must preserve the shared initializer for the second. Only the still-active check may start a health probe after initialization completes, and successful validation must leave the instance `HEALTHY`. The timeout callback marks a check inactive at the deadline, before any late initializer continuation can run. The expired caller receives the latest observation available at its own deadline (`CONNECTING` while the newer check is pending). A current-generation timeout must still invalidate initialization for retry, and shutdown remains terminal. The staggered fake-timer regression and existing retry/shutdown tests cover these rules.

`shutdown` is idempotent, invalidates in-flight generations, and leaves the instance `DISCONNECTED`. There is no automatic polling in this cycle.

## Tenant and future adapters

Callers must obtain the scope from the existing authenticated tenancy/service layer. This module does not authorize caller-supplied IDs, query the database, persist credentials, or bypass RLS. A future live adapter should read credentials through the existing scope-bound vault, validate its own transport and provider response, implement only verified capabilities, classify safe errors, and keep all monetary values as exact decimal strings.

Tests inject local adapters through the registry. They never require provider credentials or network access. W01 integration should wire a runtime instance to the existing authorized connection lifecycle and durable health observation path when a shared orchestration contract is selected; no public API or migration is required by this cycle.

Intentionally deferred: real MT5, MT4, TradeLocker, or cTrader transports; order execution, synchronization, reconciliation persistence, background polling, credential-management APIs, and provider certification.
