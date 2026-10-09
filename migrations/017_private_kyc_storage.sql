-- Forward-only private byte receipts, immutable scan evidence and tenant retention policy.
ALTER TABLE brokerage_kyc_documents DROP CONSTRAINT brokerage_kyc_documents_storage_state_check;
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_kyc_documents_storage_state_check CHECK(storage_state IN('awaiting_upload','quarantined','available','deletion_pending','deleted'));
ALTER TABLE brokerage_kyc_documents ADD COLUMN storage_version text;
ALTER TABLE brokerage_kyc_documents ADD COLUMN upload_sha256 text CHECK(upload_sha256 IS NULL OR upload_sha256 ~ '^[a-f0-9]{64}$');
ALTER TABLE brokerage_kyc_documents ADD COLUMN upload_token uuid;
ALTER TABLE brokerage_kyc_documents ADD COLUMN upload_reserved_at timestamptz;
ALTER TABLE brokerage_kyc_documents ADD COLUMN receipt_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE brokerage_kyc_documents ADD COLUMN scan_evidence_id uuid;
ALTER TABLE brokerage_kyc_documents ADD COLUMN storage_error_code text;
ALTER TABLE brokerage_kyc_documents ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;
ALTER TABLE brokerage_kyc_documents ADD COLUMN legal_hold_reason text CHECK(legal_hold_reason IS NULL OR length(legal_hold_reason) BETWEEN 3 AND 500);
ALTER TABLE brokerage_kyc_documents ADD COLUMN deleted_at timestamptz;
ALTER TABLE brokerage_kyc_documents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE brokerage_kyc_scan_evidence (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
 document_id uuid NOT NULL, upload_sha256 text NOT NULL CHECK(upload_sha256 ~ '^[a-f0-9]{64}$'), storage_version text NOT NULL CHECK(length(storage_version) BETWEEN 1 AND 1024),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520), status text NOT NULL CHECK(status IN('clean','rejected')),
 engine text NOT NULL CHECK(engine='clamav-clamd'), signature_version text NOT NULL CHECK(length(signature_version) BETWEEN 1 AND 300), scanned_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,document_id,upload_sha256,storage_version,id,status),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,document_id) REFERENCES brokerage_kyc_documents(organization_id,brand_id,environment_id,product_instance_id,id)
);
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_evidence_receipt FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,id,upload_sha256,storage_version,scan_evidence_id,scan_status) REFERENCES brokerage_kyc_scan_evidence(organization_id,brand_id,environment_id,product_instance_id,document_id,upload_sha256,storage_version,id,status);
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_available_evidence CHECK(storage_state<>'available' OR(receipt_confirmed=true AND scan_evidence_id IS NOT NULL AND storage_version IS NOT NULL AND upload_sha256 IS NOT NULL));
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_confirmed_receipt CHECK(receipt_confirmed=false OR(storage_object_reference IS NOT NULL AND storage_version IS NOT NULL AND upload_sha256 IS NOT NULL AND encryption_confirmed=true));
CREATE INDEX brokerage_kyc_retention_due ON brokerage_kyc_documents(retained_until) WHERE retained_until IS NOT NULL AND storage_state NOT IN('deleted','deletion_pending') AND legal_hold=false;

CREATE TABLE brokerage_kyc_storage_policy (
 organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
 retention_days integer CHECK(retention_days BETWEEN 1 AND 36500), updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,brand_id,environment_id,product_instance_id),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['brokerage_kyc_scan_evidence','brokerage_kyc_storage_policy'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(current_setting(''azuriya.core'',true)=''true'' OR(organization_id::text=current_setting(''azuriya.organization_id'',true) AND brand_id::text=current_setting(''azuriya.brand_id'',true) AND environment_id::text=current_setting(''azuriya.environment_id'',true) AND product_instance_id::text=current_setting(''azuriya.product_instance_id'',true))) WITH CHECK(current_setting(''azuriya.core'',true)=''true'' OR(organization_id::text=current_setting(''azuriya.organization_id'',true) AND brand_id::text=current_setting(''azuriya.brand_id'',true) AND environment_id::text=current_setting(''azuriya.environment_id'',true) AND product_instance_id::text=current_setting(''azuriya.product_instance_id'',true)))',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON brokerage_kyc_scan_evidence TO azuriya_app;
GRANT SELECT,INSERT,UPDATE ON brokerage_kyc_storage_policy TO azuriya_app;
REVOKE UPDATE,DELETE ON brokerage_kyc_scan_evidence FROM azuriya_app;
