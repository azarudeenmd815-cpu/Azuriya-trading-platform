# W02 Cycle 5: trading-group version exhaustion

Acceptance criteria:

1. Trading-group updates and lifecycle transitions accept versions through PostgreSQL's integer maximum.
2. A genuine no-op at `config_version = 2147483647` remains idempotent and unaudited.
3. A material update or activation/deactivation at that version returns HTTP 409 `TRADING_GROUP_VERSION_EXHAUSTED` without attempting an overflowing increment.
4. Rejected terminal-version mutations preserve all group values, version, timestamps, and audit history.
5. Existing leverage validation, tenant isolation, RLS, RBAC, routes, migrations, and commission behavior remain unchanged.

Implementation is limited to the W02 trading-group service and its database-backed regression test. No migration or shared contract change is required.
