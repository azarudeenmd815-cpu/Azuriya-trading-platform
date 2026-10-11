-- W06 cycle 3: snapshot source provenance at ingestion time. Reads must never
-- relabel a persisted simulated quote because a catalog source record changes.
ALTER TABLE market_data_latest_quotes ADD COLUMN provenance text;
ALTER TABLE market_data_latest_quotes ADD COLUMN source_kind text;

UPDATE market_data_latest_quotes q
SET provenance = s.provenance,
    source_kind = s.source_kind
FROM market_data_sources s
WHERE s.id = q.source_id;

ALTER TABLE market_data_latest_quotes
  ALTER COLUMN provenance SET NOT NULL,
  ALTER COLUMN source_kind SET NOT NULL;

ALTER TABLE market_data_latest_quotes
  ADD CONSTRAINT market_data_latest_quotes_provenance_check
    CHECK ((source_kind = 'simulated' AND provenance = 'simulated')
        OR (source_kind = 'provider' AND provenance = 'verified_provider'));
