-- W06 cycle 2: explicit tenant/product-instance instrument entitlements.
-- Instrument definitions remain global and schema-owner managed; this table
-- controls which active instruments a product instance may consume.
CREATE TABLE market_data_instrument_access (
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  instrument_id uuid NOT NULL REFERENCES market_data_instruments(id),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,brand_id,environment_id,product_instance_id,instrument_id),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id)
    REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);

CREATE INDEX market_data_instrument_access_lookup
  ON market_data_instrument_access(organization_id,brand_id,environment_id,product_instance_id,enabled,instrument_id);

ALTER TABLE market_data_instrument_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_instrument_access FORCE ROW LEVEL SECURITY;
CREATE POLICY market_data_instrument_access_read ON market_data_instrument_access FOR SELECT TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR (
    organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),'') AND
    brand_id::text = NULLIF(current_setting('azuriya.brand_id',true),'') AND
    environment_id::text = NULLIF(current_setting('azuriya.environment_id',true),'') AND
    product_instance_id::text = NULLIF(current_setting('azuriya.product_instance_id',true),'')
  ));
CREATE POLICY market_data_instrument_access_core_write ON market_data_instrument_access FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');

GRANT SELECT ON market_data_instrument_access TO azuriya_app;
