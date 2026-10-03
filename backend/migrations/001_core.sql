CREATE TABLE IF NOT EXISTS tenants (
 id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tenant_memberships (
 user_id text REFERENCES users(id), tenant_id text REFERENCES tenants(id), role text NOT NULL CHECK(role IN ('TRADER','SUPPORT','ADMIN','OWNER')),
 PRIMARY KEY(user_id,tenant_id)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
-- One authoritative, versioned aggregate snapshot. All derived rows and immutable
-- events are committed in the same transaction. Only a locked single writer runs.
CREATE TABLE IF NOT EXISTS engine_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version bigint NOT NULL DEFAULT 0,
 payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trading_accounts (
 id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), user_id text NOT NULL REFERENCES users(id),
 account_number text NOT NULL, mode text NOT NULL CHECK(mode IN ('PROP_SIMULATED','BROKER_DEMO','BROKER_LIVE_INTERNALIZED')),
 status text NOT NULL, currency text NOT NULL, balance numeric NOT NULL, equity numeric NOT NULL,
 margin_used numeric NOT NULL, margin_free numeric NOT NULL, margin_level numeric NOT NULL,
 leverage numeric NOT NULL, position_mode text NOT NULL CHECK(position_mode IN ('HEDGING','NETTING')), payload jsonb NOT NULL,
 UNIQUE(tenant_id,account_number), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS instruments (
 id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), symbol text NOT NULL,
 trading_status text NOT NULL, payload jsonb NOT NULL, UNIQUE(tenant_id,symbol)
);
CREATE TABLE IF NOT EXISTS orders (
 id text PRIMARY KEY, tenant_id text NOT NULL, account_id text NOT NULL, client_order_id text NOT NULL,
 status text NOT NULL, payload jsonb NOT NULL, FOREIGN KEY(tenant_id,account_id) REFERENCES trading_accounts(tenant_id,id),
 UNIQUE(tenant_id,account_id,client_order_id)
);
CREATE TABLE IF NOT EXISTS positions (
 id text PRIMARY KEY, tenant_id text NOT NULL, account_id text NOT NULL, status text NOT NULL, payload jsonb NOT NULL,
 FOREIGN KEY(tenant_id,account_id) REFERENCES trading_accounts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS fills (
 id text PRIMARY KEY, tenant_id text NOT NULL, account_id text NOT NULL, order_id text NOT NULL,
 payload jsonb NOT NULL, FOREIGN KEY(tenant_id,account_id) REFERENCES trading_accounts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS account_transactions (
 id text PRIMARY KEY, tenant_id text NOT NULL, account_id text NOT NULL, type text NOT NULL,
 amount numeric NOT NULL, created_at timestamptz NOT NULL, payload jsonb NOT NULL,
 FOREIGN KEY(tenant_id,account_id) REFERENCES trading_accounts(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), account_id text,
 aggregate_type text NOT NULL, aggregate_id text NOT NULL, sequence bigint NOT NULL UNIQUE,
 event_type text NOT NULL, payload jsonb NOT NULL, occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_tenant_account_sequence ON audit_events(tenant_id,account_id,sequence);
CREATE INDEX IF NOT EXISTS orders_account ON orders(tenant_id,account_id);
CREATE INDEX IF NOT EXISTS positions_account ON positions(tenant_id,account_id);
CREATE OR REPLACE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Trading history is append-only'; END; $$;
DROP TRIGGER IF EXISTS immutable_audit ON audit_events;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
DROP TRIGGER IF EXISTS immutable_ledger ON account_transactions;
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON account_transactions FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
DROP TRIGGER IF EXISTS immutable_fills ON fills;
CREATE TRIGGER immutable_fills BEFORE UPDATE OR DELETE ON fills FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
