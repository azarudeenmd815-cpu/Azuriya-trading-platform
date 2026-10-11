-- W06 cycle 3 repair: keep the database invariant aligned with the
-- normalized ingestion contract even for trusted Core maintenance writes.
ALTER TABLE market_data_latest_quotes
  ADD CONSTRAINT market_data_latest_quotes_event_received_check
  CHECK (source_event_at <= received_at);
