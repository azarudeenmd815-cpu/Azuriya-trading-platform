-- Forward-only broker configuration mirrors. The engine snapshot remains the
-- canonical aggregate; these rows commit in the same single-writer transaction.
CREATE TABLE IF NOT EXISTS broker_profiles (
 id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id),
 kind text NOT NULL CHECK (kind IN ('PRICING','COMMISSION','SWAP','LEVERAGE','MARGIN','EXECUTION','SESSION')),
 name text NOT NULL, status text NOT NULL CHECK (status IN ('ACTIVE','DISABLED')),
 revision bigint NOT NULL CHECK (revision > 0), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 UNIQUE (tenant_id,id)
);
CREATE INDEX broker_profiles_tenant_kind ON broker_profiles(tenant_id,kind,name);
CREATE TABLE IF NOT EXISTS trading_groups (
 id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), name text NOT NULL,
 status text NOT NULL CHECK (status IN ('ACTIVE','DISABLED')),
 revision bigint NOT NULL CHECK (revision > 0), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 UNIQUE (tenant_id,id)
);
CREATE INDEX trading_groups_tenant ON trading_groups(tenant_id,name);
CREATE TABLE IF NOT EXISTS symbol_groups (
 id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), name text NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 UNIQUE (tenant_id,id)
);
CREATE INDEX symbol_groups_tenant ON symbol_groups(tenant_id,name);
CREATE TABLE IF NOT EXISTS broker_settings (
 tenant_id text PRIMARY KEY REFERENCES tenants(id), default_trading_group_id text NOT NULL,
 revision bigint NOT NULL CHECK (revision > 0), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 FOREIGN KEY (tenant_id,default_trading_group_id) REFERENCES trading_groups(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS broker_client_statuses (
 tenant_id text NOT NULL, user_id text NOT NULL,
 status text NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED')),
 PRIMARY KEY (tenant_id,user_id),
 FOREIGN KEY (user_id,tenant_id) REFERENCES tenant_memberships(user_id,tenant_id)
);
CREATE TABLE IF NOT EXISTS broker_rollover_checkpoints (
 checkpoint_key text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id),
 position_id text NOT NULL, local_date date NOT NULL,
 swap_plan_id text NOT NULL, rollover_at timestamptz NOT NULL, amount numeric NOT NULL,
 payload jsonb NOT NULL, UNIQUE(position_id,local_date)
);
CREATE INDEX broker_rollover_tenant_date ON broker_rollover_checkpoints(tenant_id,local_date);
CREATE TRIGGER immutable_rollover_checkpoint BEFORE UPDATE OR DELETE ON broker_rollover_checkpoints
 FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_rollover_checkpoint_truncate BEFORE TRUNCATE ON broker_rollover_checkpoints
 FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();

ALTER TABLE trading_accounts ADD COLUMN trading_group_id text;
ALTER TABLE trading_accounts ADD COLUMN max_leverage_override numeric CHECK (max_leverage_override > 0);
ALTER TABLE trading_accounts ADD CONSTRAINT accounts_trading_group_scope
 FOREIGN KEY (tenant_id,trading_group_id) REFERENCES trading_groups(tenant_id,id);
ALTER TABLE instruments ADD COLUMN symbol_group_id text;
ALTER TABLE instruments ADD CONSTRAINT instruments_symbol_group_scope
 FOREIGN KEY (tenant_id,symbol_group_id) REFERENCES symbol_groups(tenant_id,id);

-- Administrative actor and account owner have independent meanings. Old events
-- retain their original payload and receive empty additive metadata defaults.
ALTER TABLE audit_events ADD COLUMN owner_user_id text NOT NULL DEFAULT '';
ALTER TABLE audit_events ADD COLUMN actor_user_id text NOT NULL DEFAULT '';
ALTER TABLE audit_events ADD COLUMN actor_role text NOT NULL DEFAULT '';
CREATE INDEX audit_broker_admin_tenant_sequence ON audit_events(tenant_id,sequence DESC)
 WHERE aggregate_type='broker_admin';
