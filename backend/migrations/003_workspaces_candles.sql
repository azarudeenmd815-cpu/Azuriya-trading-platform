-- Forward-only Phase 2 additions. Existing trading state and history are retained.
CREATE TABLE IF NOT EXISTS trading_workspaces (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id),
 user_id text NOT NULL REFERENCES users(id),
 selected_account text NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0),
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 FOREIGN KEY (user_id,tenant_id) REFERENCES tenant_memberships(user_id,tenant_id),
 FOREIGN KEY (tenant_id,selected_account) REFERENCES trading_accounts(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS workspaces_owner_updated ON trading_workspaces(tenant_id,user_id,updated_at DESC);

-- Workspace preferences have their own audit sequence, independent of the
-- trading engine's sequenced state. Deleting a workspace retains this history.
CREATE TABLE IF NOT EXISTS workspace_events (
 sequence bigserial PRIMARY KEY,
 id text NOT NULL UNIQUE,
 tenant_id text NOT NULL REFERENCES tenants(id),
 user_id text NOT NULL REFERENCES users(id),
 workspace_id text NOT NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL,
 occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS workspace_events_owner ON workspace_events(tenant_id,user_id,sequence DESC);
CREATE TRIGGER immutable_workspace_events BEFORE UPDATE OR DELETE ON workspace_events
 FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_workspace_events_truncate BEFORE TRUNCATE ON workspace_events
 FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();

CREATE TABLE IF NOT EXISTS candle_series (
 tenant_id text NOT NULL REFERENCES tenants(id),
 symbol text NOT NULL,
 last_sequence bigint NOT NULL,
 payload jsonb NOT NULL,
 PRIMARY KEY (tenant_id,symbol),
 FOREIGN KEY (tenant_id,symbol) REFERENCES instruments(tenant_id,symbol)
);
CREATE TABLE IF NOT EXISTS candles (
 tenant_id text NOT NULL REFERENCES tenants(id),
 symbol text NOT NULL,
 interval text NOT NULL CHECK (interval IN ('1s','5s','15s','30s','1m','3m','5m','15m','30m','1h','4h','1D')),
 open_time timestamptz NOT NULL,
 close_time timestamptz NOT NULL,
 open numeric NOT NULL CHECK (open > 0),
 high numeric NOT NULL CHECK (high >= open),
 low numeric NOT NULL CHECK (low > 0 AND low <= open),
 close numeric NOT NULL CHECK (close > 0 AND close >= low AND close <= high),
 tick_volume bigint NOT NULL CHECK (tick_volume >= 0),
 complete boolean NOT NULL,
 sequence bigint NOT NULL,
 source text NOT NULL,
 PRIMARY KEY (tenant_id,symbol,interval,open_time),
 FOREIGN KEY (tenant_id,symbol) REFERENCES instruments(tenant_id,symbol),
 CHECK (close_time > open_time)
);
