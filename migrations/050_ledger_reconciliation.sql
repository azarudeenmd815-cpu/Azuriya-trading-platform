-- W05 Cycle 1: immutable cash ledger and an explicitly separate stored balance projection.
CREATE TABLE brokerage_ledger_entries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  account_id uuid NOT NULL,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  kind text NOT NULL CHECK(kind IN ('opening_balance','deposit','withdrawal','transfer','realized_pnl','unrealized_pnl','commission','fee','swap','adjustment','reversal')),
  amount numeric(38,8) NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','pending','void','rejected')),
  idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
  reference text CHECK(reference IS NULL OR length(reference) BETWEEN 1 AND 200),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,account_id,currency,idempotency_key),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_ledger_account_replay ON brokerage_ledger_entries(organization_id,brand_id,environment_id,product_instance_id,account_id,currency,status,sequence);

CREATE TABLE brokerage_account_balance_projections (
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  account_id uuid NOT NULL,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  balance numeric(38,8) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,brand_id,environment_id,product_instance_id,account_id,currency),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,id)
);

ALTER TABLE brokerage_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_ledger_entries_scope ON brokerage_ledger_entries TO azuriya_app
  USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')))
  WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT ON brokerage_ledger_entries TO azuriya_app;

ALTER TABLE brokerage_account_balance_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_account_balance_projections FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_account_balance_projections_scope ON brokerage_account_balance_projections TO azuriya_app
  USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')))
  WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_account_balance_projections TO azuriya_app;

CREATE FUNCTION brokerage_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable' USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER brokerage_ledger_entries_immutable BEFORE UPDATE OR DELETE ON brokerage_ledger_entries FOR EACH ROW EXECUTE FUNCTION brokerage_ledger_immutable();
