SELECT set_config('azuriya.core','true',true);
UPDATE products SET modules='["clients","onboarding","accounts","verification","finance","ib_partners","reports","communications","integrations","staff"]'::jsonb,
 description='White-label brokerage client, verification, account and payment operations.' WHERE slug='brokerage-crm';
SELECT set_config('azuriya.core','false',true);
