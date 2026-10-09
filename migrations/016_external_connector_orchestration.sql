-- Forward-only activation. Catalog installation is explicit when an implemented
-- connector is selected; the original foundation seed remains unchanged.
ALTER TABLE brokerage_connections DROP CONSTRAINT brokerage_connections_status_check;
ALTER TABLE brokerage_connections ADD CONSTRAINT brokerage_connections_status_check CHECK(status IN('requested','pending','failed','disabled','draft','validating','connected','degraded','authentication_failed','unavailable','suspended','disconnected'));
ALTER TABLE brokerage_connections ADD COLUMN provider_environment text NOT NULL DEFAULT 'sandbox' CHECK(provider_environment IN('sandbox','demo','production'));
ALTER TABLE brokerage_connections ADD COLUMN connector_version text;
ALTER TABLE brokerage_connections ADD COLUMN capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(capabilities)='array');
ALTER TABLE brokerage_connections ADD COLUMN credential_revision integer NOT NULL DEFAULT 0;
ALTER TABLE brokerage_connections ADD COLUMN candidate_credential_reference uuid REFERENCES credential_envelopes(id);
ALTER TABLE brokerage_connections ADD COLUMN connected_since timestamptz;
ALTER TABLE brokerage_connections ADD COLUMN last_successful_request_at timestamptz;
ALTER TABLE brokerage_connections ADD COLUMN last_event_at timestamptz;
ALTER TABLE brokerage_connections ADD COLUMN last_reconciliation_at timestamptz;
ALTER TABLE brokerage_connections ADD COLUMN latency_ms integer CHECK(latency_ms>=0);
ALTER TABLE brokerage_connections ADD COLUMN provider_account_reference text CHECK(length(provider_account_reference)<=160);
ALTER TABLE brokerage_accounts DROP CONSTRAINT brokerage_accounts_status_check;
ALTER TABLE brokerage_accounts ADD CONSTRAINT brokerage_accounts_status_check CHECK(status IN('requested','queued','provisioning','provider_pending','active','read_only','disabled','restricted','failed','closed','archived'));
ALTER TABLE brokerage_accounts ADD COLUMN provider_snapshot jsonb;
ALTER TABLE brokerage_accounts ADD COLUMN trader_credential_reference uuid REFERENCES credential_envelopes(id);
ALTER TABLE brokerage_accounts ADD COLUMN trader_credentials_expires_at timestamptz;
ALTER TABLE brokerage_accounts ADD COLUMN trader_credentials_revealed_at timestamptz;
ALTER TABLE brokerage_payment_methods ADD COLUMN connection_id uuid;
ALTER TABLE brokerage_payment_methods ADD FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id);
ALTER TABLE brokerage_payment_requests ADD COLUMN payment_action_url text;
ALTER TABLE brokerage_payment_requests ADD COLUMN payment_action_expires_at timestamptz;
ALTER TABLE brokerage_payment_requests ADD COLUMN provider_payment_reference text;
ALTER TABLE brokerage_payment_requests ADD COLUMN funding_status text NOT NULL DEFAULT 'not_applicable' CHECK(funding_status IN('not_applicable','funding_pending','credited','failed','review_required'));
ALTER TABLE brokerage_payment_requests ADD COLUMN external_processing_state text CHECK(external_processing_state IN('external_processing_required','processing','completed','failed'));

CREATE TABLE connector_operations (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL,brand_id uuid NOT NULL,environment_id uuid NOT NULL,product_instance_id uuid NOT NULL,
 connection_id uuid NOT NULL, operation_type text NOT NULL CHECK(operation_type IN('connection.validate','connection.rotate','account.create','account.sync','account.disable','account.enable','payment.create','payment.sync','payment.cancel','payment.refund')),
 resource_type text NOT NULL CHECK(resource_type IN('connection','account','payment')), resource_id uuid NOT NULL,
 account_id uuid, payment_request_id uuid, provider_idempotency_key uuid NOT NULL UNIQUE,
 provider_reference text CHECK(length(provider_reference)<=160),provider_secondary_reference text CHECK(length(provider_secondary_reference)<=160),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','succeeded','retry_pending','ambiguous','reconciliation_required','failed','cancelled')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 12),max_attempts integer NOT NULL DEFAULT 8 CHECK(max_attempts BETWEEN 1 AND 12),
 credential_revision integer NOT NULL, secret_reference uuid REFERENCES credential_envelopes(id),
 lease_token uuid,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,completed_at timestamptz,
 last_error text CHECK(length(last_error)<=80), reconciliation_state text NOT NULL DEFAULT 'not_required' CHECK(reconciliation_state IN('not_required','pending','matched','discrepancy','manual_review')),
 safe_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(safe_evidence)='object'),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,payment_request_id) REFERENCES brokerage_payment_requests(organization_id,brand_id,environment_id,product_instance_id,id),
 CHECK((resource_type='connection' AND resource_id=connection_id AND account_id IS NULL AND payment_request_id IS NULL) OR (resource_type='account' AND resource_id=account_id AND payment_request_id IS NULL) OR (resource_type='payment' AND resource_id=payment_request_id AND account_id IS NULL))
);
CREATE UNIQUE INDEX connector_operation_active ON connector_operations(connection_id,operation_type,resource_id) WHERE state IN('queued','running','retry_pending','ambiguous','reconciliation_required');
CREATE INDEX connector_operation_claim ON connector_operations(state,next_attempt_at,created_at) WHERE state IN('queued','retry_pending','ambiguous','running');
CREATE INDEX connector_operation_worklist ON connector_operations(organization_id,brand_id,environment_id,product_instance_id,state,created_at DESC,id);

CREATE TABLE connector_event_receipts (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,brand_id uuid NOT NULL,environment_id uuid NOT NULL,product_instance_id uuid NOT NULL,connection_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN('stripe','tradelocker')),provider_event_id text NOT NULL CHECK(length(provider_event_id) BETWEEN 1 AND 160),event_type text NOT NULL CHECK(length(event_type) BETWEEN 1 AND 100),
 provider_reference text NOT NULL CHECK(length(provider_reference) BETWEEN 1 AND 160),body_sha256 text NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz, state text NOT NULL DEFAULT 'verified' CHECK(state IN('verified','processed','ignored','failed')),
 UNIQUE(connection_id,provider_event_id),UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX connector_event_scope ON connector_event_receipts(organization_id,brand_id,environment_id,product_instance_id,received_at DESC,id);

CREATE TABLE connector_payment_observations (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,brand_id uuid NOT NULL,environment_id uuid NOT NULL,product_instance_id uuid NOT NULL,
 connection_id uuid NOT NULL,payment_request_id uuid NOT NULL,provider_reference text NOT NULL CHECK(length(provider_reference)<=160),
 provider_status text NOT NULL CHECK(length(provider_status)<=80),canonical_status text NOT NULL CHECK(length(canonical_status)<=40),
 amount numeric(28,8) NOT NULL CHECK(amount>0),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),refunded_amount numeric(28,8) NOT NULL DEFAULT 0 CHECK(refunded_amount>=0 AND refunded_amount<=amount),
 evidence_fingerprint text NOT NULL CHECK(evidence_fingerprint ~ '^[a-f0-9]{64}$'),source text NOT NULL CHECK(source IN('create','webhook','reconciliation','cancel','refund')),
 observed_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,payment_request_id,evidence_fingerprint),UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,payment_request_id) REFERENCES brokerage_payment_requests(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX connector_payment_history ON connector_payment_observations(organization_id,brand_id,environment_id,product_instance_id,payment_request_id,recorded_at DESC,id);

CREATE TABLE connector_reconciliations (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,brand_id uuid NOT NULL,environment_id uuid NOT NULL,product_instance_id uuid NOT NULL,
 connection_id uuid NOT NULL,operation_id uuid,resource_type text NOT NULL CHECK(resource_type IN('connection','account','payment')),resource_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('account_state_mismatch','payment_mismatch','funding_pending','missing_callback','provider_record_missing','ambiguous_operation','credential_changed')),
 local_state text NOT NULL CHECK(length(local_state)<=80),provider_state text NOT NULL CHECK(length(provider_state)<=80),
 decision text NOT NULL CHECK(decision IN('provider_authoritative','manual_review','local_intent_preserved')),action text NOT NULL CHECK(length(action)<=100),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved','acknowledged')),provider_reference text CHECK(length(provider_reference)<=160),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,operation_id) REFERENCES connector_operations(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX connector_reconciliation_worklist ON connector_reconciliations(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC,id);
CREATE UNIQUE INDEX connector_reconciliation_open ON connector_reconciliations(connection_id,resource_type,resource_id,kind) WHERE status='open';

CREATE TABLE connector_health_history (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,brand_id uuid NOT NULL,environment_id uuid NOT NULL,product_instance_id uuid NOT NULL,connection_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN('connected','degraded','authentication_failed','unavailable','disconnected')),error_code text CHECK(length(error_code)<=80),latency_ms integer CHECK(latency_ms>=0),
 connector_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX connector_health_scope ON connector_health_history(organization_id,brand_id,environment_id,product_instance_id,connection_id,created_at DESC,id);

CREATE FUNCTION connector_immutable_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable connector observation' USING ERRCODE='42501'; END $$;
CREATE TRIGGER connector_payment_observations_immutable BEFORE UPDATE OR DELETE ON connector_payment_observations FOR EACH ROW EXECUTE FUNCTION connector_immutable_observation();
CREATE TRIGGER connector_health_history_immutable BEFORE UPDATE OR DELETE ON connector_health_history FOR EACH ROW EXECUTE FUNCTION connector_immutable_observation();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['connector_operations','connector_event_receipts','connector_payment_observations','connector_reconciliations','connector_health_history'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY connector_exact_scope ON %I FOR ALL TO azuriya_app USING(current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=NULLIF(current_setting(''azuriya.organization_id'',true),'''') AND brand_id::text=NULLIF(current_setting(''azuriya.brand_id'',true),'''') AND environment_id::text=NULLIF(current_setting(''azuriya.environment_id'',true),'''') AND product_instance_id::text=NULLIF(current_setting(''azuriya.product_instance_id'',true),''''))) WITH CHECK(current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=NULLIF(current_setting(''azuriya.organization_id'',true),'''') AND brand_id::text=NULLIF(current_setting(''azuriya.brand_id'',true),'''') AND environment_id::text=NULLIF(current_setting(''azuriya.environment_id'',true),'''') AND product_instance_id::text=NULLIF(current_setting(''azuriya.product_instance_id'',true),'''')))',table_name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO azuriya_app',table_name);
 END LOOP;
END $$;
REVOKE UPDATE ON connector_payment_observations,connector_health_history FROM azuriya_app;
