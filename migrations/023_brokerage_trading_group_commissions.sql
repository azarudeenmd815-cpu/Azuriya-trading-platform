-- W02 Cycle 2: exact, administrative trading-group commission configuration.
-- This table is configuration only; it is not consulted by execution or ledger code.
CREATE TABLE brokerage_trading_group_commissions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  trading_group_id uuid NOT NULL,
  open_commission_per_lot numeric NOT NULL
    CHECK (open_commission_per_lot >= 0)
    CHECK (open_commission_per_lot <= 100000)
    CHECK (open_commission_per_lot = trunc(open_commission_per_lot, 6)),
  close_commission_per_lot numeric NOT NULL
    CHECK (close_commission_per_lot >= 0)
    CHECK (close_commission_per_lot <= 100000)
    CHECK (close_commission_per_lot = trunc(close_commission_per_lot, 6)),
  commission_currency text NOT NULL CHECK (commission_currency ~ '^[A-Z]{3}$'),
  enabled boolean NOT NULL DEFAULT true,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  UNIQUE (organization_id, brand_id, environment_id, product_instance_id, trading_group_id),
  FOREIGN KEY (organization_id, brand_id, environment_id, product_instance_id, trading_group_id)
    REFERENCES brokerage_trading_groups(organization_id, brand_id, environment_id, product_instance_id, id)
);

CREATE INDEX brokerage_trading_group_commissions_scope_updated
  ON brokerage_trading_group_commissions(
    organization_id, brand_id, environment_id, product_instance_id, updated_at, id
  );

CREATE FUNCTION brokerage_trading_group_commission_immutable_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
     OR NEW.environment_id IS DISTINCT FROM OLD.environment_id
     OR NEW.product_instance_id IS DISTINCT FROM OLD.product_instance_id
     OR NEW.trading_group_id IS DISTINCT FROM OLD.trading_group_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Trading-group commission identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER brokerage_trading_group_commission_immutable_identity
  BEFORE UPDATE ON brokerage_trading_group_commissions
  FOR EACH ROW EXECUTE FUNCTION brokerage_trading_group_commission_immutable_identity();

ALTER TABLE brokerage_trading_group_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_trading_group_commissions FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_trading_group_commissions_exact_scope
  ON brokerage_trading_group_commissions FOR ALL TO azuriya_app
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

GRANT SELECT, INSERT, UPDATE ON brokerage_trading_group_commissions TO azuriya_app;
REVOKE DELETE ON brokerage_trading_group_commissions FROM azuriya_app;
