-- Describe the operational CRM module without enabling trading execution.
UPDATE products SET modules='["clients","onboarding","accounts","verification","finance","ib_partners","reports","communications","integrations","staff"]'::jsonb,
 description='White-label brokerage client, verification, account and payment operations.' WHERE slug='brokerage-crm';
-- Restricted schema owners may be subject to forced RLS too. The migration
-- capability explicitly authorizes this one-time full-admin permission upgrade.
SELECT set_config('azuriya.core','true',true);
INSERT INTO role_permissions(organization_id,role_id,permission_code)
SELECT r.organization_id,r.id,p.code FROM roles r CROSS JOIN permissions p
WHERE p.code LIKE 'brokerage.%' AND (SELECT count(*) FROM role_permissions rp WHERE rp.role_id=r.id AND rp.permission_code IN ('overview.read','branding.read','branding.write','domains.read','domains.write','integrations.read','integrations.write','staff.read','staff.write','roles.read','roles.write','api.read','api.write','webhooks.read','webhooks.write','audit.read','settings.read','settings.write'))=18
ON CONFLICT DO NOTHING;
SELECT set_config('azuriya.core','false',true);
