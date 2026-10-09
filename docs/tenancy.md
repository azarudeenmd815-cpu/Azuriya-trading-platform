# Tenancy and authorization

An organization is a separate business tenant. Brands, environments, subscriptions, product instances, domains, staff, roles, requests, integration connections, API credentials, webhooks and audit records are associated with their owning organization. Business types include brokerage, prop firm, hybrid, trading community, technology provider and other.

## Request resolution

The API authenticates a hashed server-side session or a scoped API key. A requested instance ID is a resource selector, not authority. The server looks up the instance and checks organization, brand, environment, product, subscription and instance status. A session must have an active staff membership in that organization whose environment/product restrictions match the instance; permissions come from its tenant role. An API key must match all four organization/brand/environment/instance IDs and carry the requested permission. Body ownership fields are rejected by strict schemas. Arbitrary organization headers and forwarded host headers are not trusted.

Clients are authorized through `client_memberships`, never through staff roles. They can read only their own profile and their explicitly associated portal contexts. Core routes require a Core session, not an API key or business role. Core staff do not gain unrestricted business/customer impersonation; future support execution must verify an explicit, scoped, time-bound grant and audit each action.

## Database isolation

Application SQL always executes as `azuriya_app`, which is not an owner/superuser and cannot bypass row security. Transactions set organization/core context locally, and the context is discarded on commit/rollback. Missing organization context cannot see tenant rows. RLS policies include both `USING` and `WITH CHECK`; explicit tenant predicates in services provide another boundary. Composite foreign keys prevent foreign brands, environments, subscriptions, roles and product instances from being attached to another organization, including under Core provisioning.

Identity and session tables are server-internal global tables, required to authenticate before a tenant is known. The browser has no direct SQL access. Parameterized SQL and allowlisted resource/sort mappings prevent user input from changing SQL or transaction settings. Trusted authorization lookups use Core database context only after authentication; this is not exposed as a client-requested flag.

Organization-wide role and staff management requires its own permissions; environment/product scoped memberships remain restricted to their matching resources. API-key scopes cannot exceed the issuing administrator's permissions. Revocation and expiry are checked on authentication. Core lists redact credential material. Audit rows are immutable to the runtime role, including Core transactions.

## Host routing

Domains reserve globally unique normalized hostnames. DNS ownership alone does not activate routing: valid DNS, SSL and edge/routing state must all be confirmed. The domain service exposes a resolver foundation for active mappings. Future edge integration must use a validated ingress host, check active state and still apply session membership; resolving a hostname never authorizes a user by itself.
