-- Shared PostgreSQL/PGlite migration. Run through the privileged migration executor only.
-- The application role never owns a table, cannot log in, and cannot bypass row security.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'azuriya_app') THEN
    CREATE ROLE azuriya_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  ALTER ROLE azuriya_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  EXECUTE 'GRANT azuriya_app TO ' || quote_ident(current_user);
END $roles$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO azuriya_app;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 320),
  password_hash text NOT NULL,
  display_name text NOT NULL,
  core_role text CHECK (core_role IS NULL OR core_role = 'super_admin'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','disabled')),
  mfa_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expiration ON sessions(expires_at);

CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  business_type text NOT NULL CHECK (business_type IN ('brokerage','prop_firm','hybrid','trading_community','technology_provider','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE brands (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE TABLE environments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sandbox','production')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,brand_id,id),
  UNIQUE (organization_id,brand_id,name),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id)
);
CREATE TABLE products (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','coming_soon','disabled')),
  modules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(modules) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_subscriptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  product_id uuid NOT NULL REFERENCES products(id),
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','suspended','cancelled')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,product_id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,product_id,id)
);
CREATE TABLE product_instances (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('provisioning','active','suspended','disabled','failed')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,environment_id,id),
  UNIQUE (organization_id,brand_id,environment_id,id),
  UNIQUE (organization_id,brand_id,environment_id,product_id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_id,subscription_id) REFERENCES product_subscriptions(organization_id,product_id,id)
);
CREATE TABLE permissions (code text PRIMARY KEY, description text NOT NULL DEFAULT '');
CREATE TABLE roles (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE UNIQUE INDEX roles_tenant_name ON roles(organization_id,lower(name));
CREATE TABLE role_permissions (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role_id uuid NOT NULL,
  permission_code text NOT NULL REFERENCES permissions(code),
  PRIMARY KEY (role_id,permission_code),
  FOREIGN KEY (organization_id,role_id) REFERENCES roles(organization_id,id)
);
CREATE TABLE staff_memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL,
  environment_id uuid,
  product_instance_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,role_id) REFERENCES roles(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,environment_id,id),
  CHECK (product_instance_id IS NULL OR environment_id IS NOT NULL)
);
CREATE UNIQUE INDEX staff_memberships_scope_unique ON staff_memberships(organization_id,user_id,COALESCE(environment_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(product_instance_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX staff_memberships_user ON staff_memberships(user_id,status);
CREATE TABLE client_memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  product_instance_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,product_instance_id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id)
);

CREATE TABLE integration_providers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'request_only' CHECK (status IN ('active','request_only','coming_soon','disabled')),
  connection_mode text NOT NULL DEFAULT 'request' CHECK (connection_mode IN ('request','oauth','api_key','managed','manual')),
  supported_products jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(supported_products) = 'array'),
  managed boolean NOT NULL DEFAULT false,
  connector_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT connector_available OR status = 'active')
);
CREATE TABLE integration_provider_capabilities (
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  capability text NOT NULL,
  PRIMARY KEY (provider_id,capability)
);
CREATE TABLE api_applications (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE service_accounts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE oauth_clients (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  application_id uuid,
  name text NOT NULL,
  client_id text NOT NULL UNIQUE,
  client_secret_hash text,
  redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(redirect_uris) = 'array'),
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scopes) = 'array'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,application_id) REFERENCES api_applications(organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE api_keys (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  application_id uuid,
  name text NOT NULL,
  prefix text NOT NULL,
  secret_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scopes) = 'array'),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,application_id) REFERENCES api_applications(organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE domains (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  hostname text NOT NULL UNIQUE CHECK (hostname = lower(hostname)),
  application_type text NOT NULL CHECK (application_type IN ('admin_portal','client_portal','trading_terminal','trading_hub','affiliate_portal','main_app','custom')),
  verification_token text NOT NULL,
  verification_method text NOT NULL DEFAULT 'dns_txt' CHECK (verification_method = 'dns_txt'),
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification','verified','provisioning','active','failed','disabled')),
  ssl_status text NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending','active','failed','disabled')),
  edge_status text NOT NULL DEFAULT 'pending' CHECK (edge_status IN ('pending','active','failed','disabled')),
  is_primary boolean NOT NULL DEFAULT false,
  dns_target text,
  verified_at timestamptz,
  last_checked_at timestamptz,
  failure_information text,
  redirect_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(redirect_config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  CHECK (brand_id IS NOT NULL AND environment_id IS NOT NULL AND product_instance_id IS NOT NULL),
  CHECK (status <> 'active' OR (verified_at IS NOT NULL AND ssl_status = 'active' AND edge_status = 'active')),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE UNIQUE INDEX domains_primary_scope ON domains(product_instance_id,application_type) WHERE is_primary AND status <> 'disabled';
CREATE TABLE integration_connections (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  provider_id uuid NOT NULL REFERENCES integration_providers(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('requested','pending','connected','failed','disabled')),
  credential_reference text,
  last_checked_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE integration_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  provider_name text NOT NULL,
  website text,
  category text NOT NULL,
  current_provider text,
  notes text,
  connection_target text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','reviewing','assigned','in_development','testing','ready','connected','rejected','failed')),
  assigned_to uuid REFERENCES users(id),
  internal_notes text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  requested_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE webhook_endpoints (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  name text NOT NULL,
  url text NOT NULL CHECK (url LIKE 'https://%'),
  events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(events) = 'array'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  signing_secret_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  webhook_endpoint_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivering','delivered','failed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  response_status integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,webhook_endpoint_id) REFERENCES webhook_endpoints(organization_id,id),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tenant_feature_overrides (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  feature_key text NOT NULL REFERENCES feature_flags(key),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,feature_key),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE support_access_grants (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  user_id uuid NOT NULL REFERENCES users(id),
  granted_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scopes) = 'array'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  CHECK (expires_at > starts_at),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  brand_id uuid,
  environment_id uuid,
  product_instance_id uuid,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  request_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id),
  FOREIGN KEY (organization_id,environment_id) REFERENCES environments(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id) REFERENCES environments(organization_id,brand_id,id),
  FOREIGN KEY (organization_id,product_instance_id) REFERENCES product_instances(organization_id,id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK (environment_id IS NULL OR brand_id IS NOT NULL),
  CHECK (product_instance_id IS NULL OR (brand_id IS NOT NULL AND environment_id IS NOT NULL))
);
CREATE INDEX audit_tenant_time ON audit_events(organization_id,created_at DESC);
CREATE INDEX audit_request_id ON audit_events(request_id);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  key text NOT NULL,
  route text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  status integer NOT NULL CHECK (status BETWEEN 100 AND 599),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (actor_id,route,key)
);
CREATE INDEX idempotency_expiration ON idempotency_records(expires_at);
CREATE INDEX client_memberships_user ON client_memberships(user_id,status);
CREATE INDEX product_instances_product ON product_instances(product_id);
CREATE INDEX integration_requests_status ON integration_requests(status,created_at DESC);
CREATE INDEX integration_connections_provider ON integration_connections(provider_id,status);
CREATE INDEX webhook_deliveries_retry ON webhook_deliveries(next_attempt_at) WHERE status IN ('pending','failed');
CREATE INDEX api_keys_prefix ON api_keys(prefix) WHERE revoked_at IS NULL;
-- Transaction-local settings are set exclusively by trusted server authorization code.
-- Missing/empty organization context sees no tenant rows; WITH CHECK also protects writes.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_context ON organizations FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands FORCE ROW LEVEL SECURITY;
CREATE POLICY brands_context ON brands FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE environments FORCE ROW LEVEL SECURITY;
CREATE POLICY environments_context ON environments FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE product_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY product_subscriptions_context ON product_subscriptions FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE product_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_instances FORCE ROW LEVEL SECURITY;
CREATE POLICY product_instances_context ON product_instances FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_context ON roles FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_context ON role_permissions FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_memberships_context ON staff_memberships FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE client_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY client_memberships_context ON client_memberships FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE api_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY api_applications_context ON api_applications FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE service_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY service_accounts_context ON service_accounts FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients FORCE ROW LEVEL SECURITY;
CREATE POLICY oauth_clients_context ON oauth_clients FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY api_keys_context ON api_keys FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains FORCE ROW LEVEL SECURITY;
CREATE POLICY domains_context ON domains FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_connections_context ON integration_connections FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE integration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_requests_context ON integration_requests FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_context ON webhook_endpoints FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_context ON webhook_deliveries FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE tenant_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_feature_overrides_context ON tenant_feature_overrides FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE support_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_access_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY support_access_grants_context ON support_access_grants FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_context ON audit_events FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_context ON outbox_events FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_records_context ON idempotency_records FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''))
  WITH CHECK (current_setting('azuriya.core',true) = 'true' OR organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),''));
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_read ON products FOR SELECT TO azuriya_app USING (true);
CREATE POLICY products_core_write ON products FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY permissions_read ON permissions FOR SELECT TO azuriya_app USING (true);
CREATE POLICY permissions_core_write ON permissions FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');
ALTER TABLE integration_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_providers FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_providers_read ON integration_providers FOR SELECT TO azuriya_app USING (true);
CREATE POLICY integration_providers_core_write ON integration_providers FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');
ALTER TABLE integration_provider_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_provider_capabilities FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_provider_capabilities_read ON integration_provider_capabilities FOR SELECT TO azuriya_app USING (true);
CREATE POLICY integration_provider_capabilities_core_write ON integration_provider_capabilities FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY feature_flags_read ON feature_flags FOR SELECT TO azuriya_app USING (true);
CREATE POLICY feature_flags_core_write ON feature_flags FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');
CREATE INDEX brands_tenant_index ON brands(organization_id);
CREATE INDEX environments_tenant_index ON environments(organization_id);
CREATE INDEX product_subscriptions_tenant_index ON product_subscriptions(organization_id);
CREATE INDEX product_instances_tenant_index ON product_instances(organization_id);
CREATE INDEX roles_tenant_index ON roles(organization_id);
CREATE INDEX role_permissions_tenant_index ON role_permissions(organization_id);
CREATE INDEX staff_memberships_tenant_index ON staff_memberships(organization_id);
CREATE INDEX client_memberships_tenant_index ON client_memberships(organization_id);
CREATE INDEX api_applications_tenant_index ON api_applications(organization_id);
CREATE INDEX service_accounts_tenant_index ON service_accounts(organization_id);
CREATE INDEX oauth_clients_tenant_index ON oauth_clients(organization_id);
CREATE INDEX api_keys_tenant_index ON api_keys(organization_id);
CREATE INDEX domains_tenant_index ON domains(organization_id);
CREATE INDEX integration_connections_tenant_index ON integration_connections(organization_id);
CREATE INDEX integration_requests_tenant_index ON integration_requests(organization_id);
CREATE INDEX webhook_endpoints_tenant_index ON webhook_endpoints(organization_id);
CREATE INDEX webhook_deliveries_tenant_index ON webhook_deliveries(organization_id);
CREATE INDEX tenant_feature_overrides_tenant_index ON tenant_feature_overrides(organization_id);
CREATE INDEX support_access_grants_tenant_index ON support_access_grants(organization_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO azuriya_app;
-- Audit history is immutable to the application role, including Core transactions.
REVOKE UPDATE,DELETE ON audit_events FROM azuriya_app;

