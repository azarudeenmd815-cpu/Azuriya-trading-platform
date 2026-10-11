# W02 Cycle 4: commission version exhaustion

Baseline: `c1987a0d56d126ce41bfbfde5f39389b3f8eca87` on `codex/trading-admin`.

Acceptance criteria:

1. A commission configuration at PostgreSQL integer maximum `config_version` remains readable.
2. A genuine no-op at that version remains idempotent and does not create an audit event.
3. A material update at that version returns HTTP 409 `TRADING_GROUP_COMMISSION_VERSION_EXHAUSTED` rather than attempting an overflowing database increment.
4. The rejected material update leaves all commission values, version, timestamps, and audit history unchanged.
5. Existing stale-version conflicts, exact-decimal validation, tenant isolation, RLS, RBAC, routes, and migrations remain unchanged.

Implementation is limited to the W02 commission service and its database-backed regression test. No migration, router, shared contract, execution, ledger, or provider change is required.
