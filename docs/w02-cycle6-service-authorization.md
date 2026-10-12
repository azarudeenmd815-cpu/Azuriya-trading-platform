# W02 Cycle 6: service-level administration authorization

Acceptance criteria:

1. Trading-group list/read operations require the canonical `settings.read` permission even when invoked without the HTTP router.
2. Trading-group create/update/activate/deactivate operations require `brokerage.settings.write` at the service boundary.
3. Commission read requires `settings.read`; commission upsert requires `brokerage.settings.write`.
4. Direct service calls revalidate the brokerage product instance and active staff membership, role permission, API-key/service-account scope, or support-grant scope.
5. Read-only, empty-permission, invalid-context, and support-grant mutation attempts are rejected without state changes.
6. Existing route authorization, tenant scope, RLS, versioning, exact-decimal behavior, and audit transactions remain unchanged.

Implementation is limited to W02 administration services and focused regression tests. No migration or shared contract change is required.
