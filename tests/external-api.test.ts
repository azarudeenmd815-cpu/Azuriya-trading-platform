import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../src/server/db/database.js';
import { createDatabase } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { buildApp } from '../src/server/app.js';
import { FoundationService } from '../src/server/domain/service.js';
import { ExternalApiService } from '../src/server/external-api/service.js';
import { hashPassword } from '../src/server/security/crypto.js';
import { permissions, type Row, type TenantContext } from '../src/shared/types.js';

describe('W08 external developer API', () => {
  let db: Database;
  let app: FastifyInstance;
  let first: TenantContext;
  let second: TenantContext;
  let cookie = '';
  let csrf = '';
  let accountId = '';
  let secondAccountId = '';
  let orderId = '';
  let historicalOrderId = '';
  let secondOrderId = '';
  const positionId = 'position-cycle2-1';
  const secondPositionId = 'position-cycle2-2';
  const mismatchedPositionId = 'position-cycle2-other-account';
  const ownerId = randomUUID();
  const password = 'external-api-owner-password';
  const email = ['external-api-owner', 'test.local'].join('@');

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    const passwordHash = await hashPassword(password);
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [ownerId, email, passwordHash, 'External API Owner']));
    const foundation = new FoundationService(db);
    for (const slug of ['external-api-alpha', 'external-api-beta']) {
      const organization = await foundation.createOrganization({ core: true, userId: ownerId, requestId: randomUUID() }, { name: slug, slug, business_type: 'brokerage', brand_name: slug, environment_name: 'Sandbox', environment_kind: 'sandbox', products: ['brokerage-crm'], plan: 'test', owner_email: email });
      const instance = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT * FROM product_instances WHERE organization_id=$1', [organization.id]))).rows[0];
      const scope: TenantContext = { core: false, userId: ownerId, requestId: randomUUID(), organizationId: String(organization.id), brandId: String(instance.brand_id), environmentId: String(instance.environment_id), productInstanceId: String(instance.id), productSlug: 'brokerage-crm', permissions: [...permissions] };
      if (!first) first = scope; else second = scope;
    }
    accountId = randomUUID();
    secondAccountId = randomUUID();
    orderId = randomUUID();
    historicalOrderId = randomUUID();
    secondOrderId = randomUUID();
    const clientId = randomUUID();
    const offeringId = randomUUID();
    const providerId = (await db.transaction({ core: true }, tx => tx.query<{ id: string }>('SELECT id FROM integration_providers ORDER BY id LIMIT 1'))).rows[0].id;
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO brokerage_clients(id,organization_id,brand_id,environment_id,product_instance_id,user_id,client_number,full_name,email,status,country,residence_country) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [clientId, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, ownerId, 'CLI-EXTERNAL-CYCLE2', 'External API Client', email, 'active', 'IN', 'IN']);
      await tx.query('INSERT INTO brokerage_offerings(id,organization_id,brand_id,environment_id,product_instance_id,name,provider_id,account_type,currencies,leverage_options,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [offeringId, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, 'External API Offering', providerId, 'live', '["USD"]', '[100]', ownerId]);
      const observations = { observed_at: '2026-10-11T00:00:00.000Z', connector_version: 'test', limited: true, positions: [
        { provider_position_id: positionId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'sell', volume: '0.01000000', open_price: '1.12345678', current_price: '1.12000000', profit: '0.00000001', stop_loss: '1.13000000', take_profit: '1.10000000', opened_at: '2026-10-10T00:00:00.000Z' },
        { provider_position_id: secondPositionId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '12.34567890', open_price: '1.20000000', current_price: '1.21000000', profit: '-123.45000000', stop_loss: null, take_profit: '1.30000000', opened_at: '2026-10-09T00:00:00.000Z' },
        { provider_position_id: mismatchedPositionId, provider_account_id: 'different-provider-account', symbol: 'EURUSD', side: 'buy', volume: '999.00000000', open_price: '9.99999999', profit: '999.00000000', opened_at: '2026-10-08T00:00:00.000Z' },
      ] };
      await tx.query('INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,server,created_by,trading_observations) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)', [accountId, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, clientId, offeringId, providerId, 'ACC-CYCLE2', 'live', 'USD', 100, 'active', 'provider-cycle2', 'External', ownerId, JSON.stringify(observations)]);
      await tx.query('INSERT INTO brokerage_accounts(id,organization_id,brand_id,environment_id,product_instance_id,client_id,offering_id,provider_id,account_number,account_type,currency,leverage,status,external_account_id,server,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)', [secondAccountId, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, clientId, offeringId, providerId, 'ACC-CYCLE2-2', 'demo', 'USD', 50, 'active', 'provider-cycle2-2', 'External', ownerId]);
      await tx.query('INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [orderId, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, accountId, 'EURUSD', 'limit', 'buy', '1.23000000', '1.10000000', ownerId]);
      await tx.query("INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,filled_quantity,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'filled',$12)", [historicalOrderId, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, accountId, 'USDJPY', 'market', 'sell', '2.00000000', '2.00000000', ownerId]);
      await tx.query('INSERT INTO brokerage_orders(id,organization_id,brand_id,environment_id,product_instance_id,account_id,instrument,order_type,side,quantity,limit_price,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [secondOrderId, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, secondAccountId, 'GBPUSD', 'limit', 'sell', '3.00000000', '1.25000000', ownerId]);
    });
    app = await buildApp({ db, origin: 'http://localhost', production: false, requireWorker: false });
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = login.cookies.map(value => `${value.name}=${value.value}`).join('; ');
    csrf = login.json().data.csrf_token;
  });

  afterAll(async () => { await app?.close(); await db?.close(); });

  it('creates a one-time scoped credential and lists metadata without secrets', async () => {
    const unauthenticated = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, payload: { name: 'Unauthenticated', scopes: ['accounts:read'] } });
    expect(unauthenticated.statusCode, unauthenticated.body).toBe(401);
    const unsupported = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie, 'x-csrf-token': csrf }, payload: { name: 'Unsupported', scopes: ['api.read'] } });
    expect(unsupported.statusCode, unsupported.body).toBe(400);
    const created = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie, 'x-csrf-token': csrf }, payload: { name: 'CRM read access', scopes: ['accounts:read'] } });
    expect(created.statusCode, created.body).toBe(201);
    const body = created.json().data;
    expect(body.secret).toMatch(/^azk_[A-Za-z0-9_-]{43}$/);
    expect(body.credential).toMatchObject({ name: 'CRM read access', scopes: ['accounts:read'], product_instance_id: first.productInstanceId });
    const listing = await app.inject({ url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie } });
    expect(listing.statusCode, listing.body).toBe(200);
    expect(listing.body).not.toContain(body.secret);
    expect(listing.body).not.toContain('secret_hash');
    const stored = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT secret_hash FROM api_keys WHERE id=$1', [body.credential.id]))).rows[0];
    expect(stored.secret_hash).not.toBe(body.secret);
    expect(String(stored.secret_hash)).toHaveLength(64);

    const scoped = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie, 'x-csrf-token': csrf }, payload: { name: 'CRM orders and positions', scopes: ['orders:read', 'positions:read'] } });
    expect(scoped.statusCode, scoped.body).toBe(201);
    expect(scoped.json().data.credential.scopes).toEqual(['orders:read', 'positions:read']);
    const scopedListing = await app.inject({ url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { cookie } });
    expect(scopedListing.statusCode, scopedListing.body).toBe(200);
    expect(scopedListing.json().data.find((item: { name: string }) => item.name === 'CRM orders and positions')).toMatchObject({ scopes: ['orders:read', 'positions:read'] });
    expect(scopedListing.body).not.toContain(scoped.json().data.secret);
  });

  it('requires api.write and pre-authorized read scopes before creating external credentials', async () => {
    const foundation = new FoundationService(db);
    const apiOnly = await foundation.createApiKey(first, { name: 'External API creator', scopes: ['api.write'] });
    const apiOrders = await foundation.createApiKey(first, { name: 'External orders creator', scopes: ['api.write', 'brokerage.orders.read'] });
    const count = async () => Number((await db.transaction({ core: true }, tx => tx.query<{ total: string }>('SELECT count(*) AS total FROM api_keys WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4', [first.organizationId, first.brandId, first.environmentId, first.productInstanceId]))).rows[0].total);
    const before = await count();

    const deniedPayloads = [
      { name: 'Denied accounts', scopes: ['accounts:read'] },
      { name: 'Denied orders', scopes: ['orders:read'] },
      { name: 'Denied positions', scopes: ['positions:read'] },
    ];
    for (const payload of deniedPayloads) {
      const response = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { authorization: `Bearer ${apiOnly.secret}` }, payload });
      expect(response.statusCode, response.body).toBe(403);
      expect(response.body).not.toContain('azk_');
    }
    expect(await count()).toBe(before);

    const orders = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { authorization: `Bearer ${apiOrders.secret}` }, payload: { name: 'Permitted orders', scopes: ['orders:read'] } });
    expect(orders.statusCode, orders.body).toBe(201);
    expect(orders.json().data.secret).toMatch(/^azk_[A-Za-z0-9_-]{43}$/);
    const deniedPositions = await app.inject({ method: 'POST', url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers: { authorization: `Bearer ${apiOrders.secret}` }, payload: { name: 'Denied positions', scopes: ['positions:read'] } });
    expect(deniedPositions.statusCode, deniedPositions.body).toBe(403);
    expect(deniedPositions.body).not.toContain('azk_');
    expect(await count()).toBe(before + 1);

    const service = new ExternalApiService(db);
    const noApiWrite = { ...first, permissions: ['brokerage.orders.read'] };
    const directBefore = await count();
    await expect(service.createCredential(noApiWrite, { name: 'Direct denied', scopes: ['orders:read'] })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(service.createCredential(first, { name: 'Direct duplicate', scopes: ['orders:read', 'orders:read'] })).rejects.toThrow();
    await expect(service.createCredential(first, { name: 'Direct unsupported', scopes: ['api.write'] as unknown as ['orders:read'] })).rejects.toThrow();
    expect(await count()).toBe(directBefore);
  });

  it('binds direct external reads to the live credential owner and all tenant dimensions', async () => {
    const service = new ExternalApiService(db);
    const credential = await service.createCredential(first, { name: 'Direct read binding', scopes: ['accounts:read'] });
    const validContext: TenantContext = { ...first, credentialId: String(credential.credential.id) };
    const unauthenticatedReads = [
      () => service.listAccounts(first, { limit: 1, offset: 0 }),
      () => service.getAccount(first, accountId),
      () => service.listOrders(first, accountId, { limit: 1, offset: 0 }),
      () => service.getOrder(first, accountId, orderId),
      () => service.listPositions(first, accountId, { limit: 1, offset: 0 }),
      () => service.getPosition(first, accountId, positionId),
    ];
    for (const read of unauthenticatedReads) await expect(read()).rejects.toMatchObject({ statusCode: 401 });
    const valid = await service.listAccounts(validContext, { limit: 1, offset: 0 });
    expect(valid.pagination.total).toBe(2);
    const otherUser = randomUUID();
    const otherEmail = `external-reader-${otherUser}@test.local`;
    const otherRole = await new FoundationService(db).createRole(first, { name: `Account-reader-${otherUser}`, permissions: ['brokerage.accounts.read'] });
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [otherUser, otherEmail, 'external-test-password-hash', 'Other API Reader']));
    await new FoundationService(db).addStaff(first, { email: otherEmail, role_id: String(otherRole.id) });
    await expect(service.listAccounts({ ...validContext, userId: otherUser }, { limit: 1, offset: 0 })).rejects.toMatchObject({ statusCode: 401 });
    const substitutedContexts: TenantContext[] = [
      { ...validContext, organizationId: second.organizationId },
      { ...validContext, brandId: second.brandId },
      { ...validContext, environmentId: second.environmentId },
      { ...validContext, productInstanceId: second.productInstanceId },
    ];
    for (const context of substitutedContexts) await expect(service.listAccounts(context, { limit: 1, offset: 0 })).rejects.toMatchObject({ statusCode: 401 });
    await service.revokeCredential(first, String(credential.credential.id));
    await expect(service.listAccounts(validContext, { limit: 1, offset: 0 })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a legacy accounts:read credential whose staff owner only has api.write', async () => {
    const foundation = new FoundationService(db);
    const legacyOwner = randomUUID();
    const legacyEmail = `legacy-${legacyOwner}@test.local`;
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [legacyOwner, legacyEmail, 'legacy-test-password-hash', 'Legacy API Owner']));
    const role = await foundation.createRole(first, { name: `API-only-${legacyOwner}`, permissions: ['api.write'] });
    await foundation.addStaff(first, { email: legacyEmail, role_id: String(role.id) });
    const legacyScope: TenantContext = { ...first, userId: legacyOwner, permissions: ['api.write'] };
    const legacyKey = await foundation.createApiKey(legacyScope, { name: 'Legacy accounts scope', scopes: ['api.write'] });
    await db.transaction({ core: true }, tx => tx.query('UPDATE api_keys SET scopes=$2::jsonb WHERE id=$1', [legacyKey.key.id, JSON.stringify(['accounts:read'])]));
    const response = await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${legacyKey.secret}` } });
    expect([401, 403]).toContain(response.statusCode);
    expect(response.body).not.toContain('azk_');
  });

  it('enforces Bearer auth, scope denial, tenant isolation, expiry, and revocation', async () => {
    const service = new ExternalApiService(db);
    const credential = await service.createCredential(first, { name: 'External accounts', scopes: ['accounts:read'] });
    const secret = credential.secret;
    expect((await app.inject({ url: '/api/external/v1/accounts' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { cookie } })).statusCode).toBe(401);
    const list = await app.inject({ url: '/api/external/v1/accounts?limit=1&offset=0', headers: { authorization: `Bearer ${secret}` } });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().pagination).toEqual({ total: 2, limit: 1, offset: 0 });
    expect(list.json().data).toHaveLength(1);
    expect((await app.inject({ url: `/api/external/v1/accounts/${randomUUID()}`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts?organization_id=${second.organizationId}`, headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(400);
    const crossCredential = await service.createCredential(second, { name: 'Second tenant', scopes: ['accounts:read'] });
    expect((await app.inject({ url: `/api/v1/instances/${second.productInstanceId}/external-credentials`, headers: { cookie } })).json().data).toHaveLength(1);
    const secondTenantAccounts = await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${crossCredential.secret}` } });
    expect(secondTenantAccounts.statusCode, secondTenantAccounts.body).toBe(200);
    expect(secondTenantAccounts.json().pagination.total).toBe(0);
    await service.revokeCredential(first, String(credential.credential.id));
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${secret}` } })).statusCode).toBe(401);
    const expired = await service.createCredential(first, { name: 'Expired', scopes: ['accounts:read'], expires_at: new Date(Date.now() + 1000).toISOString() });
    await db.transaction({ core: true }, tx => tx.query('UPDATE api_keys SET expires_at=now()-interval \'1 second\' WHERE id=$1', [expired.credential.id]));
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${expired.secret}` } })).statusCode).toBe(401);
    const noScope = await db.transaction({ core: true }, async tx => {
      const id = randomUUID(); const raw = `azk_${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '').slice(0, 11)}`;
      const hash = (await import('node:crypto')).createHash('sha256').update(raw).digest('hex');
      await tx.query('INSERT INTO api_keys(id,organization_id,brand_id,environment_id,product_instance_id,name,prefix,secret_hash,scopes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, first.organizationId, first.brandId, first.environmentId, first.productInstanceId, 'No account scope', raw.slice(0, 12), hash, JSON.stringify(['api.read']), ownerId]);
      return raw;
    });
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: `Bearer ${noScope}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/external/v1/accounts', headers: { authorization: 'Bearer malformed' } })).statusCode).toBe(401);
    expect(crossCredential.secret).not.toBe(secret);
  });

  it('reads tenant-scoped orders and positions with independent scopes', async () => {
    const ordersCredential = await new ExternalApiService(db).createCredential(first, { name: 'Orders read', scopes: ['orders:read'] });
    const positionsCredential = await new ExternalApiService(db).createCredential(first, { name: 'Positions read', scopes: ['positions:read'] });
    const accountsCredential = await new ExternalApiService(db).createCredential(first, { name: 'Accounts only', scopes: ['accounts:read'] });
    const orders = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?limit=1&status=pending`, headers: { authorization: `Bearer ${ordersCredential.secret}` } });
    expect(orders.statusCode, orders.body).toBe(200);
    expect(orders.json()).toMatchObject({ pagination: { total: 1, limit: 1, offset: 0 }, data: [{ id: orderId, account_id: accountId, quantity: '1.23000000', limit_price: '1.10000000', filled_quantity: '0.00000000' }] });
    const order = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders/${orderId}`, headers: { authorization: `Bearer ${ordersCredential.secret}` } });
    expect(order.statusCode, order.body).toBe(200);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders`, headers: { authorization: `Bearer ${accountsCredential.secret}` } })).statusCode).toBe(403);
    const positions = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?status=open`, headers: { authorization: `Bearer ${positionsCredential.secret}` } });
    expect(positions.statusCode, positions.body).toBe(200);
    expect(positions.json()).toMatchObject({ pagination: { total: 2 } });
    expect(positions.json().data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: positionId, account_id: accountId, volume: '0.01000000', open_price: '1.12345678', unrealized_pnl: '0.00000001' }),
    ]));
    expect(positions.json().data.map((item: { id: string }) => item.id)).not.toContain(mismatchedPositionId);
    const position = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions/${positionId}`, headers: { authorization: `Bearer ${positionsCredential.secret}` } });
    expect(position.statusCode, position.body).toBe(200);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions`, headers: { authorization: `Bearer ${ordersCredential.secret}` } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?status=unknown`, headers: { authorization: `Bearer ${ordersCredential.secret}` } })).statusCode).toBe(400);
    const historical = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?status=filled`, headers: { authorization: `Bearer ${ordersCredential.secret}` } });
    expect(historical.statusCode, historical.body).toBe(200);
    expect(historical.json().data).toMatchObject([{ id: historicalOrderId, status: 'filled', filled_quantity: '2.00000000' }]);
    expect((await app.inject({ url: `/api/external/v1/accounts/${randomUUID()}/orders`, headers: { authorization: `Bearer ${ordersCredential.secret}` } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders/${randomUUID()}`, headers: { authorization: `Bearer ${ordersCredential.secret}` } })).statusCode).toBe(404);
  });

  it('enforces account membership, bounded deterministic paging, filters, and read-only order access', async () => {
    const credential = await new ExternalApiService(db).createCredential(first, { name: 'Orders coverage', scopes: ['orders:read'] });
    const accountsCredential = await new ExternalApiService(db).createCredential(first, { name: 'Accounts sort coverage', scopes: ['accounts:read'] });
    const otherTenantCredential = await new ExternalApiService(db).createCredential(second, { name: 'Other tenant orders', scopes: ['orders:read'] });
    const headers = { authorization: `Bearer ${credential.secret}` };
    const firstPage = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?limit=1&offset=0`, headers });
    expect(firstPage.statusCode, firstPage.body).toBe(200);
    expect(firstPage.json().pagination).toEqual({ total: 2, limit: 1, offset: 0 });
    expect(firstPage.json().data).toHaveLength(1);
    const secondPage = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?limit=1&offset=1`, headers });
    expect(secondPage.statusCode, secondPage.body).toBe(200);
    expect(secondPage.json().data).toHaveLength(1);
    expect(firstPage.json().data[0].id).not.toBe(secondPage.json().data[0].id);
    const pending = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?status=pending`, headers });
    expect(pending.statusCode, pending.body).toBe(200);
    expect(pending.json().data.map((row: { status: string }) => row.status)).toEqual(['pending']);
    const accountHeaders = { authorization: `Bearer ${accountsCredential.secret}` };
    const defaultSort = await app.inject({ url: '/api/external/v1/accounts?sort=created_at', headers: accountHeaders });
    expect(defaultSort.statusCode, defaultSort.body).toBe(200);
    for (const sort of ['constructor', 'toString', '__proto__']) {
      const inheritedSort = await app.inject({ url: `/api/external/v1/accounts?sort=${sort}`, headers: accountHeaders });
      expect(inheritedSort.statusCode, inheritedSort.body).toBe(200);
      expect(inheritedSort.json().data).toEqual(defaultSort.json().data);
    }
    const filled = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?status=filled`, headers });
    expect(filled.statusCode, filled.body).toBe(200);
    expect(filled.json().data.map((row: { id: string; status: string }) => [row.id, row.status])).toEqual([[historicalOrderId, 'filled']]);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?limit=0`, headers })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders?status=not-a-status`, headers })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/external/v1/accounts/${secondAccountId}/orders/${orderId}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders/${secondOrderId}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders`, headers: { authorization: `Bearer ${otherTenantCredential.secret}` } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders/${orderId}`, headers: { authorization: `Bearer ${otherTenantCredential.secret}` } })).statusCode).toBe(404);
    const before = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT status,filled_quantity FROM brokerage_orders WHERE id=$1', [orderId]))).rows[0];
    await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders/${orderId}`, headers });
    const after = (await db.transaction({ core: true }, tx => tx.query<Row>('SELECT status,filled_quantity FROM brokerage_orders WHERE id=$1', [orderId]))).rows[0];
    expect(after).toMatchObject(before);
    const adminAttempt = await app.inject({ url: `/api/v1/instances/${first.productInstanceId}/external-credentials`, headers });
    expect(adminAttempt.statusCode).toBe(403);
    expect(adminAttempt.json().error.code).toBe('PERMISSION_DENIED');
  });

  it('enforces position scope, account membership, exact decimals, and snapshot ownership', async () => {
    const credential = await new ExternalApiService(db).createCredential(first, { name: 'Positions coverage', scopes: ['positions:read'] });
    const otherTenantCredential = await new ExternalApiService(db).createCredential(second, { name: 'Other tenant positions', scopes: ['positions:read'] });
    const headers = { authorization: `Bearer ${credential.secret}` };
    const page = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?limit=1&offset=0`, headers });
    expect(page.statusCode, page.body).toBe(200);
    expect(page.json().pagination).toEqual({ total: 2, limit: 1, offset: 0 });
    expect(page.json().data[0]).toMatchObject({ volume: '0.01000000', open_price: '1.12345678', unrealized_pnl: '0.00000001' });
    const all = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?limit=100`, headers });
    expect(all.statusCode, all.body).toBe(200);
    expect(all.json().data).toHaveLength(2);
    expect(all.json().data.map((row: { id: string }) => row.id)).not.toContain(mismatchedPositionId);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?status=closed`, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?status=invalid`, headers })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/external/v1/accounts/${secondAccountId}/positions/${positionId}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions/${positionId}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions/${mismatchedPositionId}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions`, headers: { authorization: `Bearer ${otherTenantCredential.secret}` } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions/${positionId}`, headers: { authorization: `Bearer ${otherTenantCredential.secret}` } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders`, headers })).statusCode).toBe(403);
  });

  it('does not expose a provider position whose provider account differs from the parent account', async () => {
    const credential = await new ExternalApiService(db).createCredential(first, { name: 'Position ownership regression', scopes: ['positions:read'] });
    const response = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions/${mismatchedPositionId}`, headers: { authorization: `Bearer ${credential.secret}` } });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('POSITION_NOT_FOUND');
  });

  it('omits malformed provider snapshot values instead of exposing invalid decimals', async () => {
    const credential = await new ExternalApiService(db).createCredential(first, { name: 'Malformed snapshot regression', scopes: ['positions:read'] });
    const malformedRequiredId = 'position-cycle3-malformed-required';
    const malformedOptionalId = 'position-cycle3-malformed-optional';
    const malformedTimestampId = 'position-cycle3-malformed-timestamp';
    const excessivePrecisionTimestampId = 'position-cycle5-excessive-precision-timestamp';
    const invalidCalendarId = 'position-cycle3-invalid-calendar';
    const original = (await db.transaction({ core: true }, tx => tx.query<{ trading_observations: unknown }>('SELECT trading_observations FROM brokerage_accounts WHERE id=$1', [accountId]))).rows[0].trading_observations as { positions: unknown[]; observed_at: string; connector_version: string; limited: boolean };
    const observations = {
      ...original,
      positions: [
        ...original.positions,
        { provider_position_id: malformedRequiredId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '1e3', open_price: '1.20000000', opened_at: '2026-10-11T00:00:00.000Z' },
        { provider_position_id: malformedOptionalId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '2.00000000', open_price: '1.20000000', current_price: 'NaN', profit: '1e3', stop_loss: 'Infinity', take_profit: '1.30000000', opened_at: '2026-10-11T00:00:00.000Z' },
        { provider_position_id: malformedTimestampId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '3.00000000', open_price: '1.20000000', opened_at: 'not-a-timestamp' },
        { provider_position_id: excessivePrecisionTimestampId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '4.00000000', open_price: '1.20000000', opened_at: '2026-10-11T00:00:00.1234567890Z' },
        { provider_position_id: invalidCalendarId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '4.00000000', open_price: '1.20000000', opened_at: '2026-02-29T00:00:00.000Z' },
      ],
    };
    await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_accounts SET trading_observations=$2::jsonb WHERE id=$1', [accountId, JSON.stringify(observations)]));
    try {
      const response = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?limit=100`, headers: { authorization: `Bearer ${credential.secret}` } });
      expect(response.statusCode, response.body).toBe(200);
      const data = response.json().data as Array<Record<string, unknown>>;
      expect(data.map(item => item.id)).not.toContain(malformedRequiredId);
      expect(data.map(item => item.id)).not.toContain(malformedTimestampId);
      expect(data.map(item => item.id)).not.toContain(excessivePrecisionTimestampId);
      expect(data.map(item => item.id)).not.toContain(invalidCalendarId);
      expect(data.find(item => item.id === malformedOptionalId)).toMatchObject({ volume: '2.00000000', open_price: '1.20000000', take_profit: '1.30000000' });
      expect(data.find(item => item.id === malformedOptionalId)).not.toHaveProperty('current_price');
      expect(data.find(item => item.id === malformedOptionalId)).not.toHaveProperty('unrealized_pnl');
      expect(data.find(item => item.id === malformedOptionalId)).not.toHaveProperty('stop_loss');
    } finally {
      await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_accounts SET trading_observations=$2::jsonb WHERE id=$1', [accountId, JSON.stringify(original)]));
    }
  });

  it('orders valid position timestamps chronologically across timezone offsets', async () => {
    const credential = await new ExternalApiService(db).createCredential(first, { name: 'Position ordering regression', scopes: ['positions:read'] });
    const laterId = 'position-cycle3-offset-later';
    const earlierId = 'position-cycle3-offset-earlier';
    const original = (await db.transaction({ core: true }, tx => tx.query<{ trading_observations: unknown }>('SELECT trading_observations FROM brokerage_accounts WHERE id=$1', [accountId]))).rows[0].trading_observations as { positions: unknown[]; observed_at: string; connector_version: string; limited: boolean };
    const observations = {
      ...original,
      positions: [
        ...original.positions,
        { provider_position_id: laterId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '4.00000000', open_price: '1.20000000', opened_at: '2026-10-11T00:00:00-05:00' },
        { provider_position_id: earlierId, provider_account_id: 'provider-cycle2', symbol: 'EURUSD', side: 'buy', volume: '5.00000000', open_price: '1.20000000', opened_at: '2026-10-11T04:00:00Z' },
      ],
    };
    await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_accounts SET trading_observations=$2::jsonb WHERE id=$1', [accountId, JSON.stringify(observations)]));
    try {
      const response = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?limit=100`, headers: { authorization: `Bearer ${credential.secret}` } });
      expect(response.statusCode, response.body).toBe(200);
      const ids = (response.json().data as Array<{ id: string }>).map(item => item.id);
      expect(ids.indexOf(laterId)).toBeLessThan(ids.indexOf(earlierId));
    } finally {
      await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_accounts SET trading_observations=$2::jsonb WHERE id=$1', [accountId, JSON.stringify(original)]));
    }
  });

  it('exposes canonical snapshot freshness without allowing malformed metadata to poison positions', async () => {
    const credential = await new ExternalApiService(db).createCredential(first, { name: 'Position freshness regression', scopes: ['positions:read'] });
    const original = (await db.transaction({ core: true }, tx => tx.query<{ trading_observations: unknown }>('SELECT trading_observations FROM brokerage_accounts WHERE id=$1', [accountId]))).rows[0].trading_observations as { positions: unknown[]; observed_at: string; connector_version: string; limited: boolean };
    const validObservations = { ...original, observed_at: '2026-10-11T04:00:00-05:00' };
    await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_accounts SET trading_observations=$2::jsonb WHERE id=$1', [accountId, JSON.stringify(validObservations)]));
    try {
      const valid = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions/${positionId}`, headers: { authorization: `Bearer ${credential.secret}` } });
      expect(valid.statusCode, valid.body).toBe(200);
      expect(valid.json().data).toMatchObject({ id: positionId, observed_at: '2026-10-11T04:00:00-05:00' });
      const validList = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions?limit=100`, headers: { authorization: `Bearer ${credential.secret}` } });
      expect(validList.statusCode, validList.body).toBe(200);
      expect(validList.json().data.find((item: { id: string }) => item.id === positionId)).toMatchObject({ observed_at: '2026-10-11T04:00:00-05:00' });

      const malformedObservations = { ...validObservations, observed_at: 'not-a-timestamp' };
      await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_accounts SET trading_observations=$2::jsonb WHERE id=$1', [accountId, JSON.stringify(malformedObservations)]));
      const malformed = await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions/${positionId}`, headers: { authorization: `Bearer ${credential.secret}` } });
      expect(malformed.statusCode, malformed.body).toBe(200);
      expect(malformed.json().data).toMatchObject({ id: positionId, open_price: '1.12345678' });
      expect(malformed.json().data).not.toHaveProperty('observed_at');
    } finally {
      await db.transaction({ core: true }, tx => tx.query('UPDATE brokerage_accounts SET trading_observations=$2::jsonb WHERE id=$1', [accountId, JSON.stringify(original)]));
    }
  });

  it('rejects invalid and expired credentials for each new resource without session fallback', async () => {
    const service = new ExternalApiService(db);
    const expired = await service.createCredential(first, { name: 'Expired orders', scopes: ['orders:read'] });
    await db.transaction({ core: true }, tx => tx.query("UPDATE api_keys SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.credential.id]));
    const expiredHeaders = { authorization: `Bearer ${expired.secret}` };
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders`, headers: expiredHeaders })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions`, headers: expiredHeaders })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders`, headers: { authorization: 'Bearer azk_invalid-token' } })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/external/v1/accounts/${accountId}/positions`, headers: { authorization: 'Bearer azk_invalid-token' } })).statusCode).toBe(401);
    const sessionOnly = await app.inject({ url: `/api/external/v1/accounts/${accountId}/orders`, headers: { cookie } });
    expect(sessionOnly.statusCode).toBe(401);
  });
});
