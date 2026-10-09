import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AesCredentialVault, type CredentialScope, type CredentialStore, type EncryptedCredential } from '../src/server/domain/vault.js';
import { FoundationService } from '../src/server/domain/service.js';
import { permissions, type Actor, type OrganizationInput, type Row, type TenantContext } from '../src/shared/types.js';
import { normalizeHostname } from '../src/server/domain/dns.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { DatabaseDomainResolver, UnconfiguredEdgeProvisioner, UnconfiguredSslProvisioner } from '../src/server/domain/domain-delivery.js';
import { tradingOperation, type TradingProviderAdapter } from '../src/server/domain/trading-provider.js';

describe('persisted platform domain workflows', () => {
  let db: Database;
  let service: FoundationService;
  const txt = new Map<string, string[][]>();
  const core: Actor = { userId: randomUUID(), requestId: randomUUID(), core: true };
  const ownerId = randomUUID();
  let brokerage: TenantContext;
  let prop: TenantContext;
  let hub: TenantContext;
  const organizationInput = (slug: string, products: OrganizationInput['products']): OrganizationInput => ({ name: slug.toUpperCase(), slug, business_type: slug === 'prop' ? 'prop_firm' : 'brokerage', brand_name: `${slug} brand`, environment_name: 'production', environment_kind: 'production', products, plan: 'foundation', owner_email: 'owner@example.com' });
  const tenantContext = (org: Row, instance: Row, productSlug: string): TenantContext => ({ userId: ownerId, requestId: randomUUID(), core: false, organizationId: String(org.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug, permissions: [...permissions] });
  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO users (id,email,password_hash,display_name,core_role) VALUES ($1,$2,$3,$4,$5),($6,$7,$8,$9,NULL)', [core.userId, 'core@example.com', 'test-password-hash', 'Core', 'super_admin', ownerId, 'owner@example.com', 'test-password-hash', 'Owner']);
    });
    service = new FoundationService(db, { dns: { async resolveTxt(hostname) { const answer = txt.get(hostname); if (!answer) throw Object.assign(new Error('No TXT records'), { code: 'ENODATA' }); return answer; } } });
  });
  afterAll(async () => { await db?.close(); });
  it('atomically provisions organizations, real branding, environments, subscriptions, and owner roles', async () => {
    const org = await service.createOrganization(core, organizationInput('broker', ['brokerage-crm']));
    const other = await service.createOrganization(core, organizationInput('prop', ['prop-crm']));
    const separate = await service.createOrganization(core, organizationInput('hub', ['trading-hub']));
    const all = await service.coreList('product-instances', { limit: 100 }, core);
    const first = all.data.find(row => row.organization_id === org.id)!;
    const second = all.data.find(row => row.organization_id === other.id)!;
    const third = all.data.find(row => row.organization_id === separate.id)!;
    expect(first).toMatchObject({ organization_id: org.id, status: 'active' });
    brokerage = tenantContext(org, first, 'brokerage-crm');
    prop = tenantContext(other, second, 'prop-crm');
    hub = tenantContext(separate, third, 'trading-hub');
    const persisted = await db.transaction({ core: true }, async tx => {
      const membership = await tx.query<Row>('SELECT id, role_id FROM staff_memberships WHERE organization_id=$1 AND user_id=$2', [org.id, ownerId]);
      const grants = await tx.query<Row>('SELECT permission_code FROM role_permissions WHERE role_id=$1', [membership.rows[0].role_id]);
      const subscriptions = await tx.query<Row>('SELECT id FROM product_subscriptions WHERE organization_id=$1', [org.id]);
      const audits = await tx.query<Row>('SELECT action FROM audit_events WHERE organization_id=$1', [org.id]);
      return { membership: membership.rows, grants: grants.rows, subscriptions: subscriptions.rows, audits: audits.rows };
    });
    expect(persisted.membership).toHaveLength(1);
    expect(persisted.grants.map(row => row.permission_code).sort()).toEqual([...permissions].sort());
    expect(persisted.subscriptions).toHaveLength(1);
    expect(persisted.audits.some(row => row.action === 'organization.created')).toBe(true);
  });
  it('rolls back provisioning if the owner is unknown, scope is foreign, or audit outbox cannot commit', async () => {
    await expect(service.createOrganization(core, { ...organizationInput('invalid-owner', ['brokerage-crm']), owner_email: 'unknown@example.com' })).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    await expect(service.provision(core, { organization_id: brokerage.organizationId, brand_id: prop.brandId, environment_id: prop.environmentId, product_slug: 'api', plan: 'foundation' })).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
    const rejectingDb: Database = { query: (sql, params) => db.query(sql, params), close: async () => {}, transaction: (context, work) => db.transaction(context, tx => work({ query: async (sql, params) => { if (/INSERT INTO outbox_events/.test(sql)) throw new Error('Outbox write unavailable'); return tx.query(sql, params); } })) };
    await expect(new FoundationService(rejectingDb).createOrganization(core, organizationInput('rollback', ['trading-hub']))).rejects.toThrow('Outbox write unavailable');
    const list = await service.coreList('organizations', { limit: 100 }, core);
    expect(list.data.map(row => row.slug)).not.toContain('invalid-owner');
    expect(list.data.map(row => row.slug)).not.toContain('rollback');
  });
  it('persists brand configuration and does not expose another tenant branding', async () => {
    await service.updateBranding(brokerage, { business_name: 'Broker Blue', primary_color: '#123456', support_email: 'support@broker.example' });
    expect(await service.branding(brokerage)).toMatchObject({ config: { business_name: 'Broker Blue', primary_color: '#123456' } });
    expect(JSON.stringify(await service.branding(prop))).not.toContain('Broker Blue');
    await expect(service.updateBranding({ ...brokerage, brandId: prop.brandId }, { business_name: 'Forbidden', primary_color: '#123456' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('lists one shared, product-filtered integration catalog in both CRM instances', async () => {
    const brokerCatalog = await service.tenantList(brokerage, 'integrations', { limit: 100 });
    const propCatalog = await service.tenantList(prop, 'integrations', { limit: 100 });
    expect(brokerCatalog.data.length).toBeGreaterThan(0);
    expect(propCatalog.data.length).toBeGreaterThan(0);
    expect(brokerCatalog.data.some(row => propCatalog.data.some(other => row.id === other.id))).toBe(true);
    expect(brokerCatalog.data.every(row => (row.supported_products as string[]).includes('brokerage-crm') && row.connector_available === false)).toBe(true);
    expect(propCatalog.data.every(row => (row.supported_products as string[]).includes('prop-crm'))).toBe(true);
  });
  it('seeds the required six real catalog definitions and separates planned capabilities from available connectors', async () => {
    const catalog = await service.coreList('integration-providers', { limit: 100 }, core);
    expect(catalog.data.map(row => row.name).sort()).toEqual(['Azuriya Brokerage', 'MetaTrader 5', 'MetaTrader 4', 'TradeLocker', 'cTrader', 'Match-Trader'].sort());
    for (const provider of catalog.data) {
      expect(provider).toMatchObject({ connector_available: false, connection_mode: 'request', status: 'request_only', capabilities: [] });
      expect(provider.planned_capabilities).toContain('account.read');
    }
    await db.transaction({ core: true }, tx => tx.query("INSERT INTO integration_providers (id,name,slug,category,supported_products) VALUES ($1,'Existing Analytics','existing-analytics','analytics','[\"trading-hub\"]'::jsonb)", [randomUUID()]));
    await seedCatalog(db);
    expect((await service.coreList('integration-providers', { search: 'Existing Analytics' }, core)).data).toHaveLength(1);
  });
  it('persists integration requests and Core triage while keeping internal notes private from tenants and audit metadata', async () => {
    const request = await service.requestIntegration(brokerage, { provider_name: 'Requested provider', category: 'Trading', notes: 'Please assess this provider.' });
    expect(request.status).toBe('requested');
    await service.triageRequest(core, String(request.id), { status: 'reviewing', priority: 'high', internal_notes: 'Private Core deliberation' });
    const tenantRequests = await service.tenantList(brokerage, 'integration-requests', {});
    expect(tenantRequests.data.find(row => row.id === request.id)).toMatchObject({ status: 'reviewing', priority: 'high' });
    expect(JSON.stringify(tenantRequests)).not.toContain('Private Core deliberation');
    expect((await service.tenantList(prop, 'integration-requests', {})).data).toHaveLength(0);
    const coreRequests = await service.coreList('integration-requests', {}, core);
    expect(coreRequests.data.find(row => row.id === request.id)?.internal_notes).toBe('Private Core deliberation');
    expect(coreRequests.data.find(row => row.id === request.id)).toMatchObject({ organization_name: 'BROKER', product_name: 'Brokerage CRM', environment_name: 'production' });
    expect(JSON.stringify(await service.tenantList(brokerage, 'audit', { limit: 100 }))).not.toContain('Private Core deliberation');
    await expect(service.triageRequest(brokerage, String(request.id), { status: 'connected' })).rejects.toMatchObject({ code: 'CORE_ACCESS_REQUIRED' });
  });
  it('creates one-time high entropy API keys, stores only hashes, and enforces scopes and revoke ownership', async () => {
    const generated = await service.createApiKey(brokerage, { name: 'Automation', scopes: ['overview.read'] });
    expect(generated.secret).toMatch(/^azk_[A-Za-z0-9_-]{43}$/);
    const stored = await db.transaction({ core: true }, tx => tx.query<Row>('SELECT secret_hash FROM api_keys WHERE id=$1', [generated.key.id]));
    expect(stored.rows[0].secret_hash).toBe(createHash('sha256').update(generated.secret).digest('hex'));
    expect(JSON.stringify(generated.key)).not.toContain('secret_hash');
    expect(JSON.stringify(await service.coreList('api-keys', {}, core))).not.toContain(generated.secret);
    expect(JSON.stringify(await service.tenantList(brokerage, 'api-keys', {}))).not.toContain('secret_hash');
    expect(JSON.stringify(await service.tenantList(brokerage, 'audit', { limit: 100 }))).not.toContain(generated.secret);
    await expect(service.revokeApiKey(prop, String(generated.key.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.createApiKey({ ...brokerage, permissions: ['api.write'] }, { name: 'Escalation', scopes: ['staff.write'] })).rejects.toMatchObject({ code: 'INVALID_SCOPES' });
    expect((await service.revokeApiKey(brokerage, String(generated.key.id))).revoked_at).toBeTruthy();
  });
  it('requires real TXT DNS ownership and does not activate SSL or edge routing', async () => {
    const domain = await service.createDomain(brokerage, { hostname: 'TRADE.Broker.Example.', application_type: 'client_portal', is_primary: true });
    expect(domain.hostname).toBe('trade.broker.example');
    const record = domain.verification_record as { name: string; value: string };
    const tenantDomains = await service.tenantList(brokerage, 'domains', {});
    expect(tenantDomains.data.find(row => row.id === domain.id)?.verification_record).toEqual(record);
    expect(JSON.stringify(await service.coreList('domains', {}, core))).not.toContain(record.value);
    const missing = await service.verifyDomain(brokerage, String(domain.id));
    expect(missing.status).toBe('awaiting_dns');
    expect(missing.verified_at).toBeNull();
    txt.set(record.name, [[record.value.slice(0, 12), record.value.slice(12)]]);
    const verified = await service.verifyDomain(brokerage, String(domain.id));
    expect(verified).toMatchObject({ status: 'verified', ssl_status: 'pending', edge_status: 'pending' });
    expect(verified.verified_at).toBeTruthy();
    await expect(service.createDomain(prop, { hostname: 'trade.broker.example', application_type: 'client_portal' })).rejects.toMatchObject({ code: 'HOSTNAME_UNAVAILABLE' });
    await expect(service.verifyDomain(prop, String(domain.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await service.disableDomain(brokerage, String(domain.id))).status).toBe('disabled');
  });
  it('validates staff role and instance scope and persists disabled staff and role permissions', async () => {
    const role = await service.createRole(brokerage, { name: 'Reader', permissions: ['overview.read', 'integrations.read'] });
    const foreignRole = await service.createRole(prop, { name: 'Foreign reader', permissions: ['overview.read'] });
    await expect(service.addStaff(brokerage, { email: 'core@example.com', role_id: String(foreignRole.id) })).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
    await expect(service.addStaff(brokerage, { email: 'core@example.com', role_id: String(role.id), product_instance_id: prop.productInstanceId, environment_id: prop.environmentId })).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
    // A Core identity must not become a tenant identity by adding a membership.
    await expect(service.addStaff(brokerage, { email: 'core@example.com', role_id: String(role.id) })).rejects.toMatchObject({ code: 'CORE_IDENTITY_NOT_TENANT_STAFF' });
    const staffId = randomUUID();
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)', [staffId, 'reader@example.com', 'test-password-hash', 'Reader']));
    const membership = await service.addStaff(brokerage, { email: 'reader@example.com', role_id: String(role.id) });
    expect(membership).toMatchObject({ organization_id: brokerage.organizationId, product_instance_id: brokerage.productInstanceId });
    expect((await service.updateStaff(brokerage, String(membership.id), { status: 'disabled' })).status).toBe('disabled');
    await expect(service.updateStaff(prop, String(membership.id), { status: 'active' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('persists safe webhooks without simulated delivery or signing credentials', async () => {
    const webhook = await service.createWebhook(brokerage, { name: 'Audit consumer', url: 'https://hooks.example/azuriya', events: ['organization.updated'] });
    expect(webhook).toMatchObject({ organization_id: brokerage.organizationId, status: 'disabled', delivery_available: false });
    await expect(service.createWebhook(brokerage, { name: 'Unsafe', url: 'http://localhost/hook', events: ['organization.updated'] })).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_URL' });
    const deliveries = await db.transaction({ core: true }, tx => tx.query<Row>('SELECT id FROM webhook_deliveries WHERE organization_id=$1', [brokerage.organizationId]));
    expect(deliveries.rows).toHaveLength(0);
  });
  it('supports Trading Hub as a stand-alone product and global flag overrides without a brokerage', async () => {
    const overview = await service.overview(hub);
    expect(overview.product_slug).toBe('trading-hub');
    expect((await service.branding(hub)).organization_id).toBe(hub.organizationId);
    await service.setFeatureFlag(core, { key: 'standalone_hub', enabled: true, description: 'Stand-alone hub available' });
    expect((await service.tenantList(hub, 'settings', {})).data.some(row => row.key === 'standalone_hub' && row.enabled === true)).toBe(true);
    await expect(service.setFeatureFlag(hub, { key: 'forbidden', enabled: true })).rejects.toMatchObject({ code: 'CORE_ACCESS_REQUIRED' });
  });
  it('paginates safe Core lists and prevents unsafe sort/resource interpolation', async () => {
    const first = await service.coreList('organizations', { limit: 1, offset: 0, sort: 'name', direction: 'asc' }, core);
    const second = await service.coreList('organizations', { limit: 1, offset: 1, sort: 'name', direction: 'asc' }, core);
    expect(first.pagination).toMatchObject({ total: 3, limit: 1, offset: 0 });
    expect(first.data[0].id).not.toBe(second.data[0].id);
    expect((await service.coreList('organizations', { search: 'PROP' }, core)).data).toHaveLength(1);
    await expect(service.coreList('organizations; DROP TABLE users', {}, core)).rejects.toMatchObject({ code: 'UNKNOWN_RESOURCE' });
    for (const unsafeResource of ['__proto__', 'constructor', 'toString']) await expect(service.coreList(unsafeResource, {}, core)).rejects.toMatchObject({ code: 'UNKNOWN_RESOURCE' });
    await expect(service.coreList('organizations', { sort: 'id;DROP TABLE users' }, core)).rejects.toMatchObject({ code: 'INVALID_SORT' });
    expect((await service.updateOrganization(core, brokerage.organizationId, { status: 'suspended' })).status).toBe('suspended');
  });
  it('exposes safe columns for every Core resource and withholds private credential references', async () => {
    for (const resource of ['organizations', 'brands', 'environments', 'products', 'product-instances', 'domains', 'integration-providers', 'integration-connections', 'integration-requests', 'api-applications', 'api-keys', 'oauth-clients', 'service-accounts', 'webhook-endpoints', 'staff', 'roles', 'audit-events', 'feature-flags', 'support-access-grants']) {
      const page = await service.coreList(resource, {}, core);
      expect(page.pagination.total).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(page)).not.toMatch(/"(?:secret_hash|client_secret_hash|credential_reference|password_hash|signing_secret_reference|verification_token)"/);
    }
  });
  it('persists a Prop CRM integration request in its own tenant scope and exposes it in Core', async () => {
    const request = await service.requestIntegration(prop, { provider_name: 'Prop Provider Request', category: 'trading_platform', current_provider: 'Independent provider', website: 'https://prop-provider.example' });
    expect(request).toMatchObject({ organization_id: prop.organizationId, product_instance_id: prop.productInstanceId, status: 'requested' });
    expect((await service.tenantList(prop, 'integration-requests', {})).data.some(row => row.id === request.id)).toBe(true);
    expect((await service.coreList('integration-requests', {}, core)).data.find(row => row.id === request.id)).toMatchObject({ product_slug: 'prop-crm', organization_name: 'PROP' });
  });
  it('lists real subscription plan/limits metadata in Core and tenant-owned API applications', async () => {
    const subscriptions = await service.coreList('product-subscriptions', {}, core);
    expect(subscriptions.pagination.total).toBe(3);
    expect(subscriptions.data.find(row => row.organization_id === prop.organizationId)).toMatchObject({ organization_name: 'PROP', product_name: 'Prop Firm CRM', plan: 'foundation', limits: {} });
    expect((await service.tenantList(prop, 'api-applications', {})).data).toEqual([]);
  });
  it('checks active organization, brand, environment, product, subscription, and instance inside every tenant transaction', async () => {
    const ids = await db.transaction({ core: true }, tx => tx.query<Row>('SELECT product_id,subscription_id FROM product_instances WHERE id=$1', [prop.productInstanceId]));
    const cases: [string, string, string][] = [['organizations', prop.organizationId, 'suspended'], ['brands', prop.brandId, 'disabled'], ['environments', prop.environmentId, 'disabled'], ['products', String(ids.rows[0].product_id), 'disabled'], ['product_subscriptions', String(ids.rows[0].subscription_id), 'suspended'], ['product_instances', prop.productInstanceId, 'suspended']];
    for (const [table, entityId, status] of cases) {
      try {
        await db.transaction({ core: true }, tx => tx.query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [entityId, status]));
        await expect(service.branding(prop)).rejects.toMatchObject({ code: 'TENANT_UNAVAILABLE' });
      } finally { await db.transaction({ core: true }, tx => tx.query(`UPDATE ${table} SET status='active' WHERE id=$1`, [entityId])); }
    }
  });
  it('resolves no routing for an unverified or disabled domain, and requires an entirely active scope', async () => {
    const domain = await service.createDomain(prop, { hostname: 'portal.prop.example', application_type: 'client_portal' });
    const resolver = new DatabaseDomainResolver(db);
    expect(await resolver.resolve('PORTAL.PROP.EXAMPLE.')).toBeNull();
    await db.transaction({ core: true }, tx => tx.query("UPDATE domains SET status='active',verified_at=now(),ssl_status='active',edge_status='active',certificate_reference='test-certificate',edge_reference='test-edge',certificate_expires_at=now()+interval '30 days' WHERE id=$1", [domain.id]));
    expect(await resolver.resolve('portal.prop.example')).toMatchObject({ organization_id: prop.organizationId, product_instance_id: prop.productInstanceId, product_slug: 'prop-crm', application_type: 'client_portal' });
    try {
      await db.transaction({ core: true }, tx => tx.query("UPDATE organizations SET status='suspended' WHERE id=$1", [prop.organizationId]));
      expect(await resolver.resolve('portal.prop.example')).toBeNull();
    } finally { await db.transaction({ core: true }, tx => tx.query("UPDATE organizations SET status='active' WHERE id=$1", [prop.organizationId])); }
    await service.disableDomain(prop, String(domain.id));
    expect(await resolver.resolve('portal.prop.example')).toBeNull();
  });
});

describe('unconfigured delivery and provider operation boundaries', () => {
  it('fails closed for SSL and edge actions when deployment services are absent', async () => {
    const domain = { id: 'domain', hostname: 'portal.example', verified_at: '2026-10-02T00:00:00Z', organization_id: 'org', brand_id: 'brand', environment_id: 'env', product_instance_id: 'instance' };
    const ssl = new UnconfiguredSslProvisioner();
    const edge = new UnconfiguredEdgeProvisioner();
    for (const action of [() => ssl.provision(domain), () => ssl.revoke(domain), () => edge.configure(domain, 'certificate-reference'), () => edge.disable(domain)]) await expect(action()).rejects.toMatchObject({ code: 'DOMAIN_DELIVERY_UNAVAILABLE' });
  });
  it('requires both a real adapter operation and declared provider capability', () => {
    const read = async () => ({ provider_account_id: 'account', display_name: 'Account', currency: 'USD', group_id: 'group', leverage: 100, status: 'enabled' as const });
    const adapter: TradingProviderAdapter = { descriptor: { id: 'provider', slug: 'provider', name: 'Provider', category: 'trading_platform', supportedProducts: ['prop-crm'], capabilities: ['account.read'], connectionMode: 'api_key', connectorAvailable: false, managed: false }, async validateConnection() { return { status: 'failed', checkedAt: '2026-10-02T00:00:00Z' }; }, async disconnect() {}, trading: { getAccount: read } };
    expect(() => tradingOperation(adapter, 'getAccount')).toThrowError(expect.objectContaining({ code: 'PROVIDER_CAPABILITY_UNAVAILABLE' }));
    adapter.descriptor.connectorAvailable = true;
    expect(tradingOperation(adapter, 'getAccount')).toBe(read);
    expect(() => tradingOperation(adapter, 'setBalance')).toThrowError(expect.objectContaining({ code: 'PROVIDER_CAPABILITY_UNAVAILABLE' }));
    adapter.descriptor.capabilities = [];
    expect(() => tradingOperation(adapter, 'getAccount')).toThrowError(expect.objectContaining({ code: 'PROVIDER_CAPABILITY_UNAVAILABLE' }));
  });
});

describe('domain hostname normalization', () => {
  it('normalizes DNS case, final dots, and international labels to one global hostname', () => {
    expect(normalizeHostname('  TRADE.Example.com.  ')).toBe('trade.example.com');
    expect(normalizeHostname('Bücher.example')).toBe('xn--bcher-kva.example');
  });
  it.each(['https://example.com', '*.example.com', 'localhost', '127.0.0.1', 'example.com:443', 'example.com/path', '-bad.example', 'bad..example', 'a.example?x=1'])('rejects non-DNS hostname %s', (hostname) => {
    expect(() => normalizeHostname(hostname)).toThrowError(expect.objectContaining({ code: 'INVALID_HOSTNAME' }));
  });
});

describe('domain authorization before persistence', () => {
  const forbiddenBackend = { async query() { throw new Error('Unauthorized access reached the database'); }, async transaction() { throw new Error('Unauthorized access reached the database'); }, async close() {} };
  const actor: TenantContext = { userId: 'u', requestId: 'r', core: false, organizationId: 'o', brandId: 'b', environmentId: 'e', productInstanceId: 'i', productSlug: 'brokerage-crm', permissions: [] };
  const service = new FoundationService(forbiddenBackend);
  it('requires trusted Core authorization even when called outside an HTTP route', async () => {
    await expect(service.coreList('organizations', {})).rejects.toMatchObject({ code: 'CORE_ACCESS_REQUIRED' });
    await expect(service.coreList('organizations', {}, actor)).rejects.toMatchObject({ code: 'CORE_ACCESS_REQUIRED' });
  });
  it('requires resource permission and rejects Core actors on tenant surfaces', async () => {
    await expect(service.tenantList(actor, 'api-keys', {})).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(service.tenantList({ ...actor, core: true, permissions: ['api.read'] }, 'api-keys', {})).rejects.toMatchObject({ code: 'TENANT_ACCESS_REQUIRED' });
  });
});

describe('credential vault', () => {
  const scope: CredentialScope = { organizationId: 'tenant-a', providerId: 'provider-a', productInstanceId: 'instance-a' };
  it('encrypts stored credentials and authenticates their tenant/provider/instance binding', async () => {
    const stored = new Map<string, EncryptedCredential>();
    const backend: CredentialStore = {
      async put(reference, envelope) { stored.set(reference, envelope); },
      async get(reference) { return stored.get(reference); },
    };
    const vault = new AesCredentialVault(backend, randomBytes(32));
    const reference = await vault.store(scope, { token: 'credential-to-protect' });
    expect(JSON.stringify([...stored.values()])).not.toContain('credential-to-protect');
    expect(await vault.read(scope, reference)).toEqual({ token: 'credential-to-protect' });
    await expect(vault.read({ ...scope, organizationId: 'tenant-b' }, reference)).rejects.toMatchObject({ code: 'CREDENTIAL_AUTHENTICATION_FAILED' });
    const envelope = stored.get(reference)!;
    stored.set(reference, { ...envelope, tag: randomBytes(16).toString('base64url') });
    await expect(vault.read(scope, reference)).rejects.toMatchObject({ code: 'CREDENTIAL_AUTHENTICATION_FAILED' });
  });
  it('fails closed when no encryption key is configured', async () => {
    const backend: CredentialStore = { async put() { throw new Error('Must not persist'); }, async get() { return undefined; } };
    await expect(new AesCredentialVault(backend).store(scope, { token: 'secret' })).rejects.toMatchObject({ code: 'CREDENTIAL_VAULT_UNAVAILABLE' });
  });
});
