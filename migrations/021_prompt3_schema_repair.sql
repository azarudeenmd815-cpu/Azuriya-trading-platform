-- Forward-only repair for the Prompt 3 connector synchronization schema.
-- Trading observations are bounded, provider-sanitized JSON written by the
-- connector runtime after a successful account synchronization.
ALTER TABLE brokerage_accounts
  ADD COLUMN trading_observations jsonb
  CHECK (trading_observations IS NULL OR jsonb_typeof(trading_observations) = 'object');
