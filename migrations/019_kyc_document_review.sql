-- Review decisions are separate from immutable malware evidence and case decisions.
ALTER TABLE brokerage_kyc_documents ADD COLUMN review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','rejected','replacement_requested'));
ALTER TABLE brokerage_kyc_documents ADD COLUMN review_reason text CHECK(review_reason IS NULL OR length(review_reason) BETWEEN 3 AND 500);
ALTER TABLE brokerage_kyc_documents ADD COLUMN reviewed_by uuid REFERENCES users(id);
ALTER TABLE brokerage_kyc_documents ADD COLUMN reviewed_at timestamptz;
ALTER TABLE brokerage_kyc_documents ADD COLUMN replacement_for_id uuid;
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_review_record CHECK(review_status='pending' OR(review_reason IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL));
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_case_identity UNIQUE(organization_id,brand_id,environment_id,product_instance_id,case_id,id);
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_replacement_parent FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,case_id,replacement_for_id) REFERENCES brokerage_kyc_documents(organization_id,brand_id,environment_id,product_instance_id,case_id,id);
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_replacement_self CHECK(replacement_for_id IS NULL OR replacement_for_id<>id);
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_one_replacement UNIQUE(organization_id,brand_id,environment_id,product_instance_id,replacement_for_id);
ALTER TABLE brokerage_kyc_documents ADD CONSTRAINT brokerage_document_available_review CHECK(storage_state<>'available' OR review_status='pending');
CREATE INDEX brokerage_document_replacements ON brokerage_kyc_documents(organization_id,brand_id,environment_id,product_instance_id,replacement_for_id,created_at DESC,id) WHERE replacement_for_id IS NOT NULL;
