-- Verified callback hints contain identifiers, not raw provider bodies or PII.
ALTER TABLE connector_event_receipts ADD COLUMN safe_hint jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(safe_hint)='object');
ALTER TABLE connector_event_receipts ADD COLUMN last_error text CHECK(length(last_error)<=80);
CREATE INDEX connector_callback_pending ON connector_event_receipts(state,received_at,id) WHERE state IN('verified','failed');
