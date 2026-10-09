-- A provider may request more information and then resume processing. Each
-- legitimate transition is a distinct immutable observation, including retries.
-- Transactional Idempotency-Key records and locked request rows prevent replay.
ALTER TABLE brokerage_transactions DROP CONSTRAINT brokerage_transactions_request_id_status_key;
