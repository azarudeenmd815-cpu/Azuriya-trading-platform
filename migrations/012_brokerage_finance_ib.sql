-- Payment workflows and immutable observations are not an accounting ledger or trading balances.
CREATE TABLE brokerage_finance_settings (
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  maker_checker_required boolean NOT NULL DEFAULT true,
  referral_window_hours integer NOT NULL DEFAULT 720 CHECK(referral_window_hours BETWEEN 1 AND 8760),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,brand_id,environment_id,product_instance_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE TABLE brokerage_payment_methods (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK(kind IN('manual','provider')),
  provider_id uuid REFERENCES integration_providers(id),
  currencies jsonb NOT NULL CHECK(jsonb_typeof(currencies)='array' AND jsonb_array_length(currencies)>0),
  deposit_enabled boolean NOT NULL DEFAULT true,
  withdrawal_enabled boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  CHECK((kind='manual' AND provider_id IS NULL) OR (kind='provider' AND provider_id IS NOT NULL))
);
CREATE TABLE brokerage_payment_requests (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('deposit','withdrawal','transfer')),
  account_id uuid NOT NULL,
  destination_account_id uuid,
  payment_method_id uuid,
  amount numeric(28,8) NOT NULL CHECK(amount>0),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK(status IN('pending','requested','review','approved','processing','requires_action','provider_pending','completed','paid','rejected','cancelled','failed','reversed')),
  destination_encrypted text,
  destination_summary text,
  created_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  review_decision text CHECK(review_decision IN('clear','reject')),
  reviewed_at timestamptz,
  approved_by uuid REFERENCES users(id),
  processed_by uuid REFERENCES users(id),
  external_reference text CHECK(length(external_reference)<=200),
  last_reason text CHECK(length(last_reason)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id,account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,client_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id,destination_account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,client_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,payment_method_id) REFERENCES brokerage_payment_methods(organization_id,brand_id,environment_id,product_instance_id,id),
  CHECK((kind='transfer' AND destination_account_id IS NOT NULL AND destination_account_id<>account_id AND payment_method_id IS NULL AND destination_encrypted IS NULL) OR (kind IN('deposit','withdrawal') AND destination_account_id IS NULL AND payment_method_id IS NOT NULL)),
  CHECK(kind<>'withdrawal' OR destination_encrypted IS NOT NULL)
);
CREATE TABLE brokerage_transactions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  request_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('deposit','withdrawal','transfer','refund','adjustment')),
  amount numeric(28,8) NOT NULL CHECK(amount>0),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL,
  account_id uuid NOT NULL,
  destination_account_id uuid,
  reference text,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id,status),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,request_id) REFERENCES brokerage_payment_requests(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id,account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,client_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id,destination_account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,client_id,id)
);
CREATE TABLE brokerage_commission_plans (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK(kind IN('cpa','revenue_share','per_lot','hybrid')),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  configuration jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE TABLE brokerage_partners (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'applicant' CHECK(status IN('applicant','review','approved','active','suspended','rejected','closed')),
  referral_code text NOT NULL CHECK(referral_code ~ '^[A-Z0-9]{8,32}$'),
  campaign text CHECK(length(campaign)<=120),
  commission_plan_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,client_id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,referral_code),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,commission_plan_id) REFERENCES brokerage_commission_plans(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE TABLE brokerage_referrals (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  referral_code text NOT NULL,
  source text CHECK(length(source)<=120),
  campaign text CHECK(length(campaign)<=120),
  attribution_rule text NOT NULL DEFAULT 'first_touch' CHECK(attribution_rule='first_touch'),
  attributed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,client_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,partner_id) REFERENCES brokerage_partners(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE TABLE brokerage_commission_accruals (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  commission_plan_id uuid NOT NULL,
  client_id uuid,
  amount numeric(28,8) NOT NULL CHECK(amount>0),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  origin text NOT NULL DEFAULT 'manual_evidence' CHECK(origin='manual_evidence'),
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,source_reference),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,partner_id) REFERENCES brokerage_partners(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,commission_plan_id) REFERENCES brokerage_commission_plans(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE TABLE brokerage_partner_payouts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  amount numeric(28,8) NOT NULL CHECK(amount>0),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','review','approved','processing','paid','rejected','cancelled','failed')),
  destination_encrypted text NOT NULL,
  destination_summary text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  review_decision text CHECK(review_decision IN('clear','reject')),
  reviewed_at timestamptz,
  approved_by uuid REFERENCES users(id),
  processed_by uuid REFERENCES users(id),
  external_reference text CHECK(length(external_reference)<=200),
  last_reason text CHECK(length(last_reason)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,partner_id) REFERENCES brokerage_partners(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE TABLE brokerage_payout_allocations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  environment_id uuid NOT NULL,
  product_instance_id uuid NOT NULL,
  payout_id uuid NOT NULL,
  accrual_id uuid NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payout_id,accrual_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,payout_id) REFERENCES brokerage_partner_payouts(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,accrual_id) REFERENCES brokerage_commission_accruals(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE UNIQUE INDEX brokerage_accrual_allocated_once ON brokerage_payout_allocations(accrual_id) WHERE released_at IS NULL;
CREATE INDEX brokerage_payments_queue ON brokerage_payment_requests(organization_id,brand_id,environment_id,product_instance_id,kind,status,created_at DESC);
CREATE INDEX brokerage_payments_client ON brokerage_payment_requests(organization_id,brand_id,environment_id,product_instance_id,client_id,created_at DESC);
CREATE INDEX brokerage_transactions_client ON brokerage_transactions(organization_id,brand_id,environment_id,product_instance_id,client_id,created_at DESC);
CREATE INDEX brokerage_partner_queue ON brokerage_partners(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC);
CREATE INDEX brokerage_referrals_partner ON brokerage_referrals(organization_id,brand_id,environment_id,product_instance_id,partner_id,created_at DESC);
CREATE INDEX brokerage_accruals_partner ON brokerage_commission_accruals(organization_id,brand_id,environment_id,product_instance_id,partner_id,created_at DESC);
CREATE INDEX brokerage_payout_queue ON brokerage_partner_payouts(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC);
ALTER TABLE brokerage_finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_finance_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_finance_settings_scope ON brokerage_finance_settings TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_finance_settings TO azuriya_app;
ALTER TABLE brokerage_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_payment_methods FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_payment_methods_scope ON brokerage_payment_methods TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_payment_methods TO azuriya_app;
ALTER TABLE brokerage_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_payment_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_payment_requests_scope ON brokerage_payment_requests TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_payment_requests TO azuriya_app;
ALTER TABLE brokerage_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_transactions_scope ON brokerage_transactions TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_transactions TO azuriya_app;
ALTER TABLE brokerage_commission_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_commission_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_commission_plans_scope ON brokerage_commission_plans TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_commission_plans TO azuriya_app;
ALTER TABLE brokerage_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_partners FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_partners_scope ON brokerage_partners TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_partners TO azuriya_app;
ALTER TABLE brokerage_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_referrals FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_referrals_scope ON brokerage_referrals TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_referrals TO azuriya_app;
ALTER TABLE brokerage_commission_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_commission_accruals FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_commission_accruals_scope ON brokerage_commission_accruals TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_commission_accruals TO azuriya_app;
ALTER TABLE brokerage_partner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_partner_payouts FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_partner_payouts_scope ON brokerage_partner_payouts TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_partner_payouts TO azuriya_app;
ALTER TABLE brokerage_payout_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_payout_allocations FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_payout_allocations_scope ON brokerage_payout_allocations TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_payout_allocations TO azuriya_app;
REVOKE UPDATE ON brokerage_transactions,brokerage_referrals,brokerage_commission_accruals FROM azuriya_app;
-- Database triggers protect immutable facts even when a future role is accidentally over-granted.
CREATE FUNCTION brokerage_finance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Brokerage financial observations are immutable' USING ERRCODE='42501'; END; $$;
CREATE TRIGGER brokerage_transactions_immutable BEFORE UPDATE OR DELETE ON brokerage_transactions FOR EACH ROW EXECUTE FUNCTION brokerage_finance_immutable();
CREATE TRIGGER brokerage_referrals_immutable BEFORE UPDATE OR DELETE ON brokerage_referrals FOR EACH ROW EXECUTE FUNCTION brokerage_finance_immutable();
CREATE TRIGGER brokerage_commission_accruals_immutable BEFORE UPDATE OR DELETE ON brokerage_commission_accruals FOR EACH ROW EXECUTE FUNCTION brokerage_finance_immutable();
CREATE FUNCTION brokerage_allocation_release_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR (to_jsonb(NEW)-'released_at') IS DISTINCT FROM (to_jsonb(OLD)-'released_at') THEN RAISE EXCEPTION 'Payout allocation history cannot be rewritten' USING ERRCODE='42501'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER brokerage_allocation_release_only BEFORE UPDATE ON brokerage_payout_allocations FOR EACH ROW EXECUTE FUNCTION brokerage_allocation_release_only();

