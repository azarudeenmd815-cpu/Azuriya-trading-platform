-- Product-specific permissions do not change limited foundation roles.
INSERT INTO permissions(code) VALUES ('brokerage.clients.read'),('brokerage.clients.write'),('brokerage.notes.read'),('brokerage.notes.write'),('brokerage.accounts.read'),('brokerage.accounts.write'),('brokerage.kyc.read'),('brokerage.kyc.review'),('brokerage.finance.read'),('brokerage.finance.write'),('brokerage.finance.approve'),('brokerage.finance.process'),('brokerage.partners.read'),('brokerage.partners.write'),('brokerage.reports.read'),('brokerage.reports.export'),('brokerage.settings.write'),('brokerage.connections.read'),('brokerage.connections.write'),('brokerage.communications.read'),('brokerage.communications.write'),('brokerage.tasks.read'),('brokerage.tasks.write') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(organization_id,role_id,permission_code)
SELECT r.organization_id,r.id,p.code FROM roles r CROSS JOIN permissions p
WHERE p.code LIKE 'brokerage.%' AND (SELECT count(*) FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_code IN ('overview.read','branding.read','branding.write','domains.read','domains.write','integrations.read','integrations.write','staff.read','staff.write','roles.read','roles.write','api.read','api.write','webhooks.read','webhooks.write','audit.read','settings.read','settings.write'))=18
ON CONFLICT DO NOTHING;
CREATE TABLE brokerage_notifications (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
 recipient_user_id uuid REFERENCES users(id), event_type text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL, message text NOT NULL,
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
CREATE INDEX brokerage_notifications_scope_time ON brokerage_notifications(organization_id,brand_id,environment_id,product_instance_id,created_at DESC);
CREATE TABLE brokerage_email_templates (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, brand_id uuid NOT NULL, environment_id uuid NOT NULL, product_instance_id uuid NOT NULL,
 event_type text NOT NULL, subject text NOT NULL CHECK(length(subject)<=200), body text NOT NULL CHECK(length(body)<=10000), enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,brand_id,environment_id,product_instance_id,event_type),
 FOREIGN KEY(organization_id,brand_id,environment_id,product_instance_id) REFERENCES product_instances(organization_id,brand_id,environment_id,id)
);
ALTER TABLE brokerage_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_notifications_scope ON brokerage_notifications TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
ALTER TABLE brokerage_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokerage_email_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY brokerage_email_templates_scope ON brokerage_email_templates TO azuriya_app USING(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),''))) WITH CHECK(current_setting('azuriya.core',true)='true' OR (organization_id::text=NULLIF(current_setting('azuriya.organization_id',true),'') AND brand_id::text=NULLIF(current_setting('azuriya.brand_id',true),'') AND environment_id::text=NULLIF(current_setting('azuriya.environment_id',true),'') AND product_instance_id::text=NULLIF(current_setting('azuriya.product_instance_id',true),'')));
GRANT SELECT,INSERT,UPDATE ON brokerage_notifications,brokerage_email_templates TO azuriya_app;

