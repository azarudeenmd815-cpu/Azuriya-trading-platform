-- Brokerage business data is separate from Core identity and scoped to the exact product instance.
CREATE TABLE brokerage_clients (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL,
  environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  user_id uuid REFERENCES users(id), client_number text NOT NULL,
  full_name text NOT NULL CHECK(length(trim(full_name)) BETWEEN 1 AND 200),
  email text NOT NULL CHECK(email=lower(trim(email)) AND length(email) BETWEEN 3 AND 320),
  status text NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','invited','registered','onboarding','kyc_pending','kyc_review','active','restricted','suspended','closed','rejected')),
  onboarding_status text NOT NULL DEFAULT 'not_started' CHECK(onboarding_status IN ('not_started','in_progress','complete')),
  country text CHECK(country ~ '^[A-Z]{2}$'), residence_country text CHECK(residence_country ~ '^[A-Z]{2}$'),
  birth_date date CHECK(birth_date IS NULL OR birth_date <= current_date),
  client_type text NOT NULL DEFAULT 'individual' CHECK(client_type IN ('individual','corporate')),
  preferred_currency text NOT NULL DEFAULT 'USD' CHECK(preferred_currency ~ '^[A-Z]{3}$'),
  risk_level text NOT NULL DEFAULT 'normal' CHECK(risk_level IN ('low','normal','high')),
  kyc_status text NOT NULL DEFAULT 'not_started' CHECK(kyc_status IN ('not_started','required','submitted','in_review','additional_information','approved','rejected','expired')),
  source text NOT NULL DEFAULT 'manual' CHECK(length(source) BETWEEN 1 AND 120), referral_source text CHECK(length(referral_source)<=200),
  assigned_staff_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz, closed_at timestamptz,
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,client_number),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,email),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,user_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE INDEX brokerage_clients_operations ON brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,status,created_at DESC,id);
CREATE INDEX brokerage_clients_kyc ON brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,kyc_status);
CREATE INDEX brokerage_clients_staff ON brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,assigned_staff_id);
CREATE INDEX brokerage_clients_search ON brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,lower(full_name),email);

CREATE TABLE brokerage_tags (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80), color text NOT NULL DEFAULT '#1677FF' CHECK(color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE UNIQUE INDEX brokerage_tags_name ON brokerage_tags(organization_id,brand_id,environment_id,product_instance_id,lower(name));
CREATE TABLE brokerage_client_tags (
  organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL, tag_id uuid NOT NULL, assigned_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,brand_id,environment_id,product_instance_id,client_id,tag_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,tag_id) REFERENCES brokerage_tags(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_client_tags_filter ON brokerage_client_tags(organization_id,brand_id,environment_id,product_instance_id,tag_id,client_id);

CREATE TABLE brokerage_notes (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL, author_id uuid NOT NULL REFERENCES users(id), category text NOT NULL DEFAULT 'general' CHECK(length(category) BETWEEN 1 AND 60),
  text text NOT NULL CHECK(length(trim(text)) BETWEEN 1 AND 10000), visibility text NOT NULL DEFAULT 'staff' CHECK(visibility IN ('staff','private')),
  pinned boolean NOT NULL DEFAULT false, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_notes_client ON brokerage_notes(organization_id,brand_id,environment_id,product_instance_id,client_id,created_at DESC);
CREATE TABLE brokerage_note_revisions (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  note_id uuid NOT NULL, editor_id uuid NOT NULL REFERENCES users(id), category text NOT NULL, text text NOT NULL,
  visibility text NOT NULL CHECK(visibility IN ('staff','private')), pinned boolean NOT NULL, deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,note_id) REFERENCES brokerage_notes(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE TABLE brokerage_staff_assignments (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL, staff_id uuid NOT NULL REFERENCES users(id), assigned_by uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK(role IN ('account_manager','compliance_reviewer','support_owner')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,client_id,role),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE TABLE brokerage_tasks (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  client_id uuid, owner_id uuid REFERENCES users(id), created_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=5000), due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_tasks_backlog ON brokerage_tasks(organization_id,brand_id,environment_id,product_instance_id,status,due_at,id);
CREATE TABLE brokerage_settings (
  organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  allowed_countries jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(allowed_countries)='array'),
  restricted_countries jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(restricted_countries)='array'),
  allowed_client_types jsonb NOT NULL DEFAULT '["individual","corporate"]' CHECK(jsonb_typeof(allowed_client_types)='array'),
  minimum_age integer NOT NULL DEFAULT 18 CHECK(minimum_age BETWEEN 0 AND 100), require_kyc boolean NOT NULL DEFAULT true,
  allow_account_requests boolean NOT NULL DEFAULT true,
  onboarding_steps jsonb NOT NULL DEFAULT '["identity","terms","profile","verification","eligibility"]' CHECK(jsonb_typeof(onboarding_steps)='array'),
  updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,brand_id,environment_id,product_instance_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE TABLE brokerage_consent_documents (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  document_type text NOT NULL CHECK(document_type IN ('terms','privacy','disclosure')), version text NOT NULL CHECK(length(version) BETWEEN 1 AND 80),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200), content text NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 100000),
  document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'), required boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,document_type,version),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE UNIQUE INDEX brokerage_active_consent_document ON brokerage_consent_documents(organization_id,brand_id,environment_id,product_instance_id,document_type) WHERE active;
CREATE TABLE brokerage_consents (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
  client_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id), document_id uuid NOT NULL,
  document_type text NOT NULL CHECK(document_type IN ('terms','privacy','disclosure')), version text NOT NULL,
  document_hash text NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'), accepted_content text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(), request_id text NOT NULL, ip_address inet, user_agent text CHECK(length(user_agent)<=500),
  UNIQUE(organization_id,brand_id,environment_id,product_instance_id,client_id,document_id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,client_id) REFERENCES brokerage_clients(organization_id,brand_id,environment_id,product_instance_id,id),
  FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,document_id) REFERENCES brokerage_consent_documents(organization_id,brand_id,environment_id,product_instance_id,id)
);
CREATE INDEX brokerage_consents_client ON brokerage_consents(organization_id,brand_id,environment_id,product_instance_id,client_id,document_type,version);

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['brokerage_clients','brokerage_tags','brokerage_client_tags','brokerage_notes','brokerage_note_revisions','brokerage_staff_assignments','brokerage_tasks','brokerage_settings','brokerage_consent_documents','brokerage_consents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY brokerage_full_scope ON %I USING (current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=current_setting(''azuriya.organization_id'',true) AND brand_id::text=current_setting(''azuriya.brand_id'',true) AND environment_id::text=current_setting(''azuriya.environment_id'',true) AND product_instance_id::text=current_setting(''azuriya.product_instance_id'',true))) WITH CHECK (current_setting(''azuriya.core'',true)=''true'' OR (organization_id::text=current_setting(''azuriya.organization_id'',true) AND brand_id::text=current_setting(''azuriya.brand_id'',true) AND environment_id::text=current_setting(''azuriya.environment_id'',true) AND product_instance_id::text=current_setting(''azuriya.product_instance_id'',true)))', table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO azuriya_app',table_name);
  END LOOP;
END $policies$;
REVOKE UPDATE,DELETE ON brokerage_consents,brokerage_note_revisions FROM azuriya_app;
REVOKE DELETE ON brokerage_consent_documents FROM azuriya_app;
CREATE FUNCTION brokerage_immutable_document_content() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.organization_id<>OLD.organization_id OR NEW.brand_id<>OLD.brand_id OR NEW.environment_id<>OLD.environment_id OR NEW.product_instance_id<>OLD.product_instance_id OR NEW.document_type<>OLD.document_type OR NEW.version<>OLD.version OR NEW.title<>OLD.title OR NEW.content<>OLD.content OR NEW.document_hash<>OLD.document_hash THEN
    RAISE EXCEPTION 'Published consent content is immutable; publish a new version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER brokerage_consent_content_immutable BEFORE UPDATE ON brokerage_consent_documents FOR EACH ROW EXECUTE FUNCTION brokerage_immutable_document_content();
