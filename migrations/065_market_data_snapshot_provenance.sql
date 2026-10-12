-- W06 cycle 3: snapshot source provenance at ingestion time. Reads must never
-- relabel a persisted simulated quote because a catalog source record changes.
ALTER TABLE market_data_latest_quotes ADD COLUMN provenance text;
ALTER TABLE market_data_latest_quotes ADD COLUMN source_kind text;

-- The snapshot table is FORCE RLS. Migration transactions use the schema
-- owner connection without a tenant context, so authorize this bounded
-- backfill explicitly before enforcing the new non-null columns.
SELECT set_config('azuriya.core','true',true);
UPDATE market_data_latest_quotes q
SET provenance = s.provenance,
    source_kind = s.source_kind
FROM market_data_sources s
WHERE s.id = q.source_id;
SELECT set_config('azuriya.core','false',true);

ALTER TABLE market_data_latest_quotes
  ALTER COLUMN provenance SET NOT NULL,
  ALTER COLUMN source_kind SET NOT NULL;

ALTER TABLE market_data_latest_quotes
  ADD CONSTRAINT market_data_latest_quotes_provenance_check
    CHECK ((source_kind = 'simulated' AND provenance = 'simulated')
        OR (source_kind = 'provider' AND provenance = 'verified_provider'));

-- Provenance is a fact captured when a snapshot is written. Core maintenance
-- may update quote values, but must not relabel an existing snapshot after the
-- source catalog has changed or a provider has been reclassified.
CREATE FUNCTION market_data_snapshot_provenance_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  expected_kind text;
  expected_provenance text;
BEGIN
  SELECT source_kind,provenance INTO expected_kind,expected_provenance
  FROM market_data_sources WHERE id = NEW.source_id;
  IF expected_kind IS NULL
     OR NEW.source_kind IS DISTINCT FROM expected_kind
     OR NEW.provenance IS DISTINCT FROM expected_provenance THEN
    RAISE EXCEPTION 'Market-data snapshot provenance does not match its source' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.source_id IS DISTINCT FROM OLD.source_id
                           OR NEW.provenance IS DISTINCT FROM OLD.provenance
                           OR NEW.source_kind IS DISTINCT FROM OLD.source_kind) THEN
    RAISE EXCEPTION 'Market-data snapshot source provenance is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER market_data_snapshot_provenance_immutable
  BEFORE INSERT OR UPDATE ON market_data_latest_quotes
  FOR EACH ROW EXECUTE FUNCTION market_data_snapshot_provenance_immutable();
