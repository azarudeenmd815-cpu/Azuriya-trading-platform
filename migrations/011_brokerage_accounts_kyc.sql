-- CRM registries reference Core's provider catalog; no trading execution is introduced.
CREATE TABLE brokerage_connections (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL,
 environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
 provider_id uuid NOT NULL REFERENCES integration_providers(id), label text NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','pending','connected','failed','disabled')),
 credential_reference uuid REFERENCES credential_envelopes(id),
 last_checked_at timestamptz, last_synchronized_at timestamptz, error_code text,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE TABLE brokerage_offerings (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL,
 environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), provider_id uuid NOT NULL REFERENCES integration_providers(id),
 connection_id uuid, account_type text NOT NULL CHECK(account_type IN('live','demo')),
 currencies jsonb NOT NULL CHECK(jsonb_typeof(currencies)='array' AND jsonb_array_length(currencies)>0),
 leverage_options jsonb NOT NULL CHECK(jsonb_typeof(leverage_options)='array' AND jsonb_array_length(leverage_options)>0),
 minimum_funding numeric(28,8) NOT NULL DEFAULT 0 CHECK(minimum_funding>=0),
 enabled boolean NOT NULL DEFAULT true, requires_kyc boolean NOT NULL DEFAULT true,
 provider_mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(provider_mapping)='object'),
 eligibility jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(eligibility)='object'),
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE TABLE brokerage_accounts (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL,
 environment_id uuid NOT NULL, product_instance_id uuid NOT NULL, client_id uuid NOT NULL, offering_id uuid NOT NULL,
 connection_id uuid, provider_id uuid NOT NULL REFERENCES integration_providers(id),
 account_number text NOT NULL, account_type text NOT NULL CHECK(account_type IN('live','demo')),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), leverage integer NOT NULL CHECK(leverage BETWEEN 1 AND 10000),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','provisioning','provider_pending','active','read_only','disabled','restricted','failed','closed','archived')),
 external_account_id text, external_login text, server text NOT NULL DEFAULT '', provider_group text,
 external_reference text, provisioning_mode text NOT NULL DEFAULT 'manual' CHECK(provisioning_mode IN('manual','provider')),
 sync_status text NOT NULL DEFAULT 'unavailable' CHECK(sync_status IN('unavailable','pending','synchronized','failed')),
 synchronized_at timestamptz, provider_revision text, failure_code text,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,account_number),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,client_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,offering_id) REFERENCES brokerage_offerings(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id),
 CHECK(status NOT IN('active','read_only') OR external_account_id IS NOT NULL)
);
CREATE UNIQUE INDEX brokerage_accounts_external ON brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,provider_id,server,external_account_id) WHERE external_account_id IS NOT NULL;
CREATE INDEX brokerage_accounts_worklist ON brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC,id);
CREATE INDEX brokerage_accounts_client ON brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,client_id,created_at DESC,id);
CREATE INDEX brokerage_offerings_scope ON brokerage_offerings(organization_id,brand_id,environment_id,product_instance_id,enabled,created_at DESC,id);
CREATE INDEX brokerage_connections_scope ON brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC,id);
CREATE TABLE brokerage_kyc_cases (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL,
 environment_id uuid NOT NULL, product_instance_id uuid NOT NULL, client_id uuid NOT NULL,
 provider_id uuid REFERENCES integration_providers(id), strategy text NOT NULL CHECK(strategy IN('manual','provider')),
 provider_status text NOT NULL DEFAULT 'manual' CHECK(provider_status IN('manual','unavailable','pending','synchronized','failed')),
 provider_reference text, status text NOT NULL DEFAULT 'submitted' CHECK(status IN('required','submitted','in_review','additional_information','approved','rejected','expired')),
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, external_reference text,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE UNIQUE INDEX brokerage_kyc_one_open_case ON brokerage_kyc_cases(organization_id,brand_id,environment_id,product_instance_id,client_id) WHERE status IN('required','submitted','in_review','additional_information');
CREATE INDEX brokerage_kyc_worklist ON brokerage_kyc_cases(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC,id);
CREATE TABLE brokerage_kyc_documents (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL,
 environment_id uuid NOT NULL, product_instance_id uuid NOT NULL, case_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('identity','address','business','source_of_funds','other')),
 filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 180 AND filename !~ '[/\\]'),
 content_type text NOT NULL CHECK(content_type IN('application/pdf','image/jpeg','image/png')), size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
 storage_state text NOT NULL DEFAULT 'awaiting_upload' CHECK(storage_state IN('awaiting_upload','quarantined','available','deleted')),
 storage_object_reference text, scan_status text NOT NULL DEFAULT 'pending' CHECK(scan_status IN('pending','clean','rejected')),
 encryption_confirmed boolean NOT NULL DEFAULT false, retained_until timestamptz,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,case_id) REFERENCES brokerage_kyc_cases(organization_id,brand_id,environment_id,product_instance_id,id),
 CHECK(storage_state<>'available' OR (storage_object_reference IS NOT NULL AND scan_status='clean' AND encryption_confirmed=true))
);
CREATE INDEX brokerage_documents_case ON brokerage_kyc_documents(organization_id,brand_id,environment_id,product_instance_id,case_id,created_at DESC,id);
CREATE TABLE brokerage_kyc_events (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL,
 environment_id uuid NOT NULL, product_instance_id uuid NOT NULL, case_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), event_type text NOT NULL, from_status text, to_status text NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,case_id) REFERENCES brokerage_kyc_cases(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_kyc_events_case ON brokerage_kyc_events(organization_id,brand_id,environment_id,product_instance_id,case_id,created_at DESC,id);
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['brokerage_connections','brokerage_offerings','brokerage_accounts','brokerage_kyc_cases','brokerage_kyc_documents','brokerage_kyc_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY brokerage_exact_scope ON %I FOR ALL TO azuriya_app USING(current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=NULLIF(current_setting(''azuriya.organization_id'',true),'''') AND brand_id::text=NULLIF(current_setting(''azuriya.brand_id'',true),'''') AND environment_id::text=NULLIF(current_setting(''azuriya.environment_id'',true),'''') AND product_instance_id::text=NULLIF(current_setting(''azuriya.product_instance_id'',true),''''))) WITH CHECK(current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=NULLIF(current_setting(''azuriya.organization_id'',true),'''') AND brand_id::text=NULLIF(current_setting(''azuriya.brand_id'',true),'''') AND environment_id::text=NULLIF(current_setting(''azuriya.environment_id'',true),'''') AND product_instance_id::text=NULLIF(current_setting(''azuriya.product_instance_id'',true),'''')))',table_name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO azuriya_app',table_name);
 END LOOP;
END $$;
REVOKE UPDATE ON brokerage_kyc_events FROM azuriya_app;
