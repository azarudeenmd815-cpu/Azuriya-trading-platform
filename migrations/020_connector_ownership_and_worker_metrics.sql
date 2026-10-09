-- Additional ownership defenses for provider and encrypted credential linkages.
ALTER TABLE brokerage_connections ADD CONSTRAINT connector_provider_owned UNIQUE(organization_id,brand_id,environment_id,product_instance_id,id,provider_id);
ALTER TABLE brokerage_offerings ADD FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id,provider_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id,provider_id);
ALTER TABLE brokerage_accounts ADD FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id,provider_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id,provider_id);
ALTER TABLE brokerage_payment_methods ADD FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,connection_id,provider_id) REFERENCES brokerage_connections(organization_id,brand_id,environment_id,product_instance_id,id,provider_id);
ALTER TABLE credential_envelopes ADD CONSTRAINT connector_credential_owned UNIQUE(organization_id,provider_id,product_instance_id,id);
-- The existing provider-neutral vault stores these identifiers as text.
ALTER TABLE brokerage_connections ADD COLUMN credential_provider_binding text GENERATED ALWAYS AS(provider_id::text) STORED;
ALTER TABLE brokerage_connections ADD COLUMN credential_instance_binding text GENERATED ALWAYS AS(product_instance_id::text) STORED;
ALTER TABLE brokerage_accounts ADD COLUMN credential_provider_binding text GENERATED ALWAYS AS(provider_id::text) STORED;
ALTER TABLE brokerage_accounts ADD COLUMN credential_instance_binding text GENERATED ALWAYS AS(product_instance_id::text) STORED;
ALTER TABLE brokerage_connections ADD FOREIGN KEY(organization_id,credential_provider_binding,credential_instance_binding,credential_reference) REFERENCES credential_envelopes(organization_id,provider_id,product_instance_id,id);
ALTER TABLE brokerage_connections ADD FOREIGN KEY(organization_id,credential_provider_binding,credential_instance_binding,candidate_credential_reference) REFERENCES credential_envelopes(organization_id,provider_id,product_instance_id,id);
ALTER TABLE brokerage_accounts ADD FOREIGN KEY(organization_id,credential_provider_binding,credential_instance_binding,trader_credential_reference) REFERENCES credential_envelopes(organization_id,provider_id,product_instance_id,id);
ALTER TABLE connector_operations ADD CHECK(split_part(operation_type,'.',1)=resource_type);
ALTER TABLE connector_reconciliations ADD COLUMN owned_account_id uuid GENERATED ALWAYS AS(CASE WHEN resource_type='account' THEN resource_id ELSE NULL END) STORED;
ALTER TABLE connector_reconciliations ADD COLUMN owned_payment_id uuid GENERATED ALWAYS AS(CASE WHEN resource_type='payment' THEN resource_id ELSE NULL END) STORED;
ALTER TABLE connector_reconciliations ADD FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,owned_account_id) REFERENCES brokerage_accounts(organization_id,brand_id,environment_id,product_instance_id,id);
ALTER TABLE connector_reconciliations ADD FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id,owned_payment_id) REFERENCES brokerage_payment_requests(organization_id,brand_id,environment_id,product_instance_id,id);
ALTER TABLE connector_reconciliations ADD CHECK(resource_type<>'connection' OR resource_id=connection_id);
CREATE FUNCTION connector_operation_secret_owned() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.secret_reference IS NOT NULL AND NOT EXISTS(SELECT 1 FROM credential_envelopes v JOIN brokerage_connections c ON c.provider_id::text=v.provider_id AND c.organization_id=v.organization_id AND c.product_instance_id::text=v.product_instance_id WHERE v.id=NEW.secret_reference AND c.id=NEW.connection_id AND c.organization_id=NEW.organization_id AND c.brand_id=NEW.brand_id AND c.environment_id=NEW.environment_id AND c.product_instance_id=NEW.product_instance_id) THEN RAISE EXCEPTION 'Credential scope mismatch' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER connector_operation_secret_owned BEFORE INSERT OR UPDATE OF secret_reference,connection_id,organization_id,brand_id,environment_id,product_instance_id ON connector_operations FOR EACH ROW EXECUTE FUNCTION connector_operation_secret_owned();
-- Existing Core-only heartbeat rows publish bounded aggregate labels. No client
-- names, object IDs, money, connection IDs or credentials enter these metrics.
ALTER TABLE worker_heartbeats ADD COLUMN connector_metrics jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(connector_metrics)='array' AND jsonb_array_length(connector_metrics)<=129);
