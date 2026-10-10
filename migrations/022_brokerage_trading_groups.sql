-- W02 Cycle 1: provider-neutral brokerage trading-group administration.
-- This is configuration only; it does not provision providers or execute trades.
CREATE TABLE brokerage_trading_groups (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  group_code text NOT NULL
    CHECK (length(group_code) BETWEEN 3 AND 32)
    CHECK (group_code = upper(group_code))
    CHECK (group_code ~ '^[A-Z0-9_]+$'),
  display_name text NOT NULL
    CHECK (length(trim(display_name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT ''
    CHECK (length(description) <= 500),
  max_leverage integer NOT NULL CHECK (max_leverage BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  UNIQUE (organization_id, brand_id, environment_id, product_instance_id, group_code),
  UNIQUE (organization_id, brand_id, environment_id, product_instance_id, id),
  FOREIGN KEY (organization_id, brand_id, environment_id, product_instance_id)
    REFERENCES product_instances(organization_id, brand_id, environment_id, id)
);

CREATE INDEX brokerage_trading_groups_scope_status
  ON brokerage_trading_groups(
    organization_id, brand_id, environment_id, product_instance_id,
    status, group_code, id
  );

CREATE FUNCTION brokerage_trading_group_immutable_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
     OR NEW.environment_id IS DISTINCT FROM OLD.environment_id
     OR NEW.product_instance_id IS DISTINCT FROM OLD.product_instance_id
     OR NEW.group_code IS DISTINCT FROM OLD.group_code
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Trading-group identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER brokerage_trading_group_immutable_identity
  BEFORE UPDATE ON brokerage_trading_groups
  FOR EACH ROW EXECUTE FUNCTION brokerage_trading_group_immutable_identity();

ALTER TABLE brokerage_trading_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_trading_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_trading_groups_exact_scope
  ON brokerage_trading_groups FOR ALL TO azuriya_app
  USING (
    current_setting('azuriya.core', true) = 'true'
    OR (
      organization_id::text = NULLIF(current_setting('azuriya.organization_id', true), '')
      AND brand_id::text = NULLIF(current_setting('azuriya.brand_id', true), '')
      AND environment_id::text = NULLIF(current_setting('azuriya.environment_id', true), '')
      AND product_instance_id::text = NULLIF(current_setting('azuriya.product_instance_id', true), '')
    )
  )
  WITH CHECK (
    current_setting('azuriya.core', true) = 'true'
    OR (
      organization_id::text = NULLIF(current_setting('azuriya.organization_id', true), '')
      AND brand_id::text = NULLIF(current_setting('azuriya.brand_id', true), '')
      AND environment_id::text = NULLIF(current_setting('azuriya.environment_id', true), '')
      AND product_instance_id::text = NULLIF(current_setting('azuriya.product_instance_id', true), '')
    )
  );

GRANT SELECT, INSERT, UPDATE ON brokerage_trading_groups TO azuriya_app;
REVOKE DELETE ON brokerage_trading_groups FROM azuriya_app;
