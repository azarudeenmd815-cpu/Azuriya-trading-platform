-- W06 cycle 2: revoking an instrument entitlement must immediately revoke
-- access to its persisted quote snapshots as well as catalog listing/ingestion.
-- The original snapshot policy in 060 is intentionally preserved; this
-- restrictive policy composes with it under PostgreSQL RLS.
CREATE POLICY market_data_latest_quotes_entitlement_read ON market_data_latest_quotes
  AS RESTRICTIVE FOR SELECT TO azuriya_app
  USING (
    current_setting('azuriya.core',true) = 'true' OR EXISTS (
      SELECT 1
      FROM market_data_instrument_access a
      WHERE a.organization_id = market_data_latest_quotes.organization_id
        AND a.brand_id = market_data_latest_quotes.brand_id
        AND a.environment_id = market_data_latest_quotes.environment_id
        AND a.product_instance_id = market_data_latest_quotes.product_instance_id
        AND a.instrument_id = market_data_latest_quotes.instrument_id
        AND a.enabled = true
    )
  );
