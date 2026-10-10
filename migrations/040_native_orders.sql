-- Native order state and immutable lifecycle history. Execution workers must lock
-- the order row before applying fills so cancellation and execution serialize.
INSERT INTO permissions(code) VALUES ('brokerage.orders.read'),('brokerage.orders.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(organization_id,role_id,permission_code)
SELECT r.organization_id,r.id,p.code
FROM roles r CROSS JOIN permissions p
WHERE p.code IN ('brokerage.orders.read','brokerage.orders.write')
  AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_code='brokerage.accounts.write')
ON CONFLICT DO NOTHING;

CREATE TABLE brokerage_orders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  account_id uuid NOT NULL,
  instrument text NOT NULL CHECK(length(trim(instrument)) BETWEEN 1 AND 80),
  order_type text NOT NULL CHECK(order_type IN ('limit','stop','market')),
  side text NOT NULL CHECK(side IN ('buy','sell')),
  quantity numeric(28,8) NOT NULL CHECK(quantity>0),
  limit_price numeric(28,8),
  stop_price numeric(28,8),
  filled_quantity numeric(28,8) NOT NULL DEFAULT 0 CHECK(filled_quantity>=0 AND filled_quantity<=quantity),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partially_filled','filled','rejected','expired','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  cancelled_by uuid REFERENCES users(id),
  cancellation_reason text CHECK(cancellation_reason IS NULL OR length(trim(cancellation_reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id,account_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,id),
  CHECK((order_type='limit' AND limit_price IS NOT NULL AND stop_price IS NULL) OR (order_type='stop' AND stop_price IS NOT NULL AND limit_price IS NULL) OR (order_type='market' AND limit_price IS NULL AND stop_price IS NULL)),
  CHECK((status='cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL) OR (status<>'cancelled' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)),
  CHECK(status NOT IN ('pending','rejected','expired','cancelled') OR filled_quantity=0),
  CHECK(status NOT IN ('partially_filled','filled') OR filled_quantity>0)
);
CREATE INDEX brokerage_orders_scope_status ON brokerage_orders(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC,id);
CREATE INDEX brokerage_orders_account ON brokerage_orders(organization_id,brand_id,environment_id,product_instance_id,account_id,created_at DESC,id);

CREATE TABLE brokerage_order_fills (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  order_id uuid NOT NULL,
  account_id uuid NOT NULL,
  quantity numeric(28,8) NOT NULL CHECK(quantity>0),
  price numeric(28,8) NOT NULL CHECK(price>=0),
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,order_id,account_id) REFERENCES brokerage_orders(organization_id,brand_id,environment_id,product_instance_id,id,account_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_order_fills_order ON brokerage_order_fills(organization_id,brand_id,environment_id,product_instance_id,order_id,executed_at,id);

CREATE TABLE brokerage_order_history (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  order_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('created','cancelled','partially_filled','filled','rejected','expired')),
  from_status text,
  to_status text NOT NULL,
  actor_id uuid REFERENCES users(id),
  reason text CHECK(reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,order_id,event_type),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,order_id) REFERENCES brokerage_orders(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_order_history_order ON brokerage_order_history(organization_id,brand_id,environment_id,product_instance_id,order_id,created_at,id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['brokerage_orders','brokerage_order_fills','brokerage_order_history'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY brokerage_orders_exact_scope ON %I FOR ALL TO azuriya_app USING(current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=NULLIF(current_setting(''azuriya.organization_id'',true),'''') AND brand_id::text=NULLIF(current_setting(''azuriya.brand_id'',true),'''') AND environment_id::text=NULLIF(current_setting(''azuriya.environment_id'',true),'''') AND product_instance_id::text=NULLIF(current_setting(''azuriya.product_instance_id'',true),''''))) WITH CHECK(current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=NULLIF(current_setting(''azuriya.organization_id'',true),'''') AND brand_id::text=NULLIF(current_setting(''azuriya.brand_id'',true),'''') AND environment_id::text=NULLIF(current_setting(''azuriya.environment_id'',true),'''') AND product_instance_id::text=NULLIF(current_setting(''azuriya.product_instance_id'',true),'''')))',table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO azuriya_app',table_name);
  END LOOP;
END $$;
REVOKE UPDATE,DELETE ON brokerage_order_fills,brokerage_order_history FROM azuriya_app;

CREATE FUNCTION prevent_native_order_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Native order history is immutable' USING ERRCODE='42501'; END;
$$;
CREATE TRIGGER brokerage_order_fills_immutable BEFORE UPDATE OR DELETE ON brokerage_order_fills FOR EACH ROW EXECUTE FUNCTION prevent_native_order_history_mutation();
CREATE TRIGGER brokerage_order_history_immutable BEFORE UPDATE OR DELETE ON brokerage_order_history FOR EACH ROW EXECUTE FUNCTION prevent_native_order_history_mutation();

CREATE FUNCTION protect_native_order_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.brand_id<>OLD.brand_id OR NEW.environment_id<>OLD.environment_id OR NEW.product_instance_id<>OLD.product_instance_id OR NEW.account_id<>OLD.account_id OR NEW.instrument<>OLD.instrument OR NEW.order_type<>OLD.order_type OR NEW.side<>OLD.side OR NEW.quantity<>OLD.quantity OR NEW.limit_price IS DISTINCT FROM OLD.limit_price OR NEW.stop_price IS DISTINCT FROM OLD.stop_price OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR (OLD.status='cancelled' AND (NEW.status<>OLD.status OR NEW.filled_quantity<>OLD.filled_quantity OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at)) THEN
    RAISE EXCEPTION 'Native order identity is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER brokerage_order_identity_immutable BEFORE UPDATE ON brokerage_orders FOR EACH ROW EXECUTE FUNCTION protect_native_order_identity();

CREATE FUNCTION enforce_native_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='pending' AND NEW.status IN ('pending','partially_filled','filled','rejected','expired','cancelled') THEN RETURN NEW; END IF;
  IF OLD.status='partially_filled' AND NEW.status IN ('partially_filled','filled') THEN RETURN NEW; END IF;
  IF OLD.status IN ('filled','rejected','expired','cancelled') AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid native order status transition' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER brokerage_order_transition BEFORE UPDATE ON brokerage_orders FOR EACH ROW EXECUTE FUNCTION enforce_native_order_transition();
