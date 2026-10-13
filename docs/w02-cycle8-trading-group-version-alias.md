# W02 Cycle 8: Trading-group version alias coverage

Acceptance criteria:

- `expected_config_version` is accepted wherever the trading-group administration contract supports a configuration version.
- Updates and activate/deactivate transitions compare the supplied alias against the current version.
- Successful alias-based mutations increment the version exactly once and preserve the normal status and audit behavior.
- Stale alias-based updates and lifecycle transitions return the existing 409 conflict without changing stored state or adding audit events; an already-active no-op preserves the record and audit count.
- The regression fixture uses a fresh group so it cannot depend on state created by earlier tests.

The implementation already provided the alias in the shared schemas and service. Cycle 8 adds focused database-backed coverage for update and lifecycle use so future changes cannot silently support the alias in one operation but reject it in another.
