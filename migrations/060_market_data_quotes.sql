-- W06: canonical market-data instruments, approved sources and tenant-scoped
-- latest quote snapshots.  There is intentionally no seed source: a source
-- must be explicitly registered by the schema owner before ingestion.
CREATE TABLE market_data_instruments (
  id uuid PRIMARY KEY,
  symbol text NOT NULL UNIQUE CHECK (symbol ~ '^[A-Z0-9][A-Z0-9._/-]{0,31}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  price_scale smallint NOT NULL CHECK (price_scale BETWEEN 0 AND 18),
  tick_size numeric(30,18) NOT NULL CHECK (tick_size > 0),
  zero_spread_allowed boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market_data_sources (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9._-]{1,63}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('simulated','provider')),
  provenance text NOT NULL CHECK (provenance IN ('simulated','verified_provider')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_kind = 'simulated' AND provenance = 'simulated') OR (source_kind = 'provider' AND provenance = 'verified_provider'))
);

CREATE TABLE market_data_latest_quotes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  instrument_id uuid NOT NULL REFERENCES market_data_instruments(id),
  source_id uuid NOT NULL REFERENCES market_data_sources(id),
  bid numeric(30,18) NOT NULL CHECK (bid > 0),
  ask numeric(30,18) NOT NULL CHECK (ask > 0 AND ask >= bid),
  source_event_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  source_sequence bigint,
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,brand_id,environment_id,product_instance_id)
    REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  UNIQUE (organization_id,brand_id,environment_id,product_instance_id,instrument_id,source_id),
  UNIQUE (organization_id,brand_id,environment_id,product_instance_id,source_id,event_id)
);

CREATE INDEX market_data_latest_quotes_scope_lookup
  ON market_data_latest_quotes(organization_id,brand_id,environment_id,product_instance_id,instrument_id);
CREATE INDEX market_data_latest_quotes_freshness
  ON market_data_latest_quotes(organization_id,brand_id,environment_id,product_instance_id,source_event_at DESC);

ALTER TABLE market_data_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_instruments FORCE ROW LEVEL SECURITY;
CREATE POLICY market_data_instruments_read ON market_data_instruments FOR SELECT TO azuriya_app USING (true);
CREATE POLICY market_data_instruments_core_write ON market_data_instruments FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');

ALTER TABLE market_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY market_data_sources_read ON market_data_sources FOR SELECT TO azuriya_app USING (true);
CREATE POLICY market_data_sources_core_write ON market_data_sources FOR ALL TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');

ALTER TABLE market_data_latest_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_latest_quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY market_data_latest_quotes_read ON market_data_latest_quotes FOR SELECT TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true' OR (
    organization_id::text = NULLIF(current_setting('azuriya.organization_id',true),'') AND
    brand_id::text = NULLIF(current_setting('azuriya.brand_id',true),'') AND
    environment_id::text = NULLIF(current_setting('azuriya.environment_id',true),'') AND
    product_instance_id::text = NULLIF(current_setting('azuriya.product_instance_id',true),'')
  ));
CREATE POLICY market_data_latest_quotes_core_insert ON market_data_latest_quotes FOR INSERT TO azuriya_app
  WITH CHECK (current_setting('azuriya.core',true) = 'true');
CREATE POLICY market_data_latest_quotes_core_update ON market_data_latest_quotes FOR UPDATE TO azuriya_app
  USING (current_setting('azuriya.core',true) = 'true')
  WITH CHECK (current_setting('azuriya.core',true) = 'true');

GRANT SELECT ON market_data_instruments,market_data_sources TO azuriya_app;
GRANT SELECT,INSERT,UPDATE ON market_data_latest_quotes TO azuriya_app;
