import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../src/shared/types.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { MarketDataService } from '../src/server/market-data/quotes.js';
import { buildApp } from '../src/server/app.js';
import { hashPassword } from '../src/server/security/crypto.js';

type ScopeRow = { organization_id: string; brand_id: string; environment_id: string; product_instance_id: string };

describe('market-data entitlement and RLS boundaries', () => {
  let db: Database;
  let service: MarketDataService;
  let scope: TenantContext;
  let sibling: TenantContext;
  let instrumentEnabled: string;
  let instrumentDisabled: string;
  let sourceId: string;
  let quoteId: string;
  const coreId = randomUUID();
  const ownerId = randomUUID();
  const clientId = randomUUID();
  const core = { userId: coreId, requestId: randomUUID(), core: true as const };

  const scopeFrom = (row: ScopeRow, userId = ownerId): TenantContext => ({
    userId,
    requestId: randomUUID(),
    core: false,
    organizationId: row.organization_id,
    brandId: row.brand_id,
    environmentId: row.environment_id,
    productInstanceId: row.product_instance_id,
    productSlug: 'brokerage-crm',
    permissions: ['brokerage.accounts.read'],
  });

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    const passwordHash = await hashPassword('market-data-boundary-password');
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)', [coreId, `market-core-${coreId}@test.local`, passwordHash, 'Market Core', 'super_admin']);
      await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [ownerId, `market-owner-${ownerId}@test.local`, passwordHash, 'Market Owner']);
      await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [clientId, `market-client-${clientId}@test.local`, passwordHash, 'Market Client']);
    });
    const foundation = new FoundationService(db);
    const organization = await foundation.createOrganization(core, {
      name: 'Market Boundary', slug: `market-boundary-${coreId.slice(0, 8)}`, business_type: 'brokerage',
      brand_name: 'Market Boundary', environment_name: 'Production', environment_kind: 'production',
      products: ['brokerage-crm'], plan: 'test', owner_email: `market-owner-${ownerId}@test.local`,
    });
    const firstInstanceId = String((organization.product_instances as Array<Record<string, unknown>>)[0].id);
    const firstRow = (await db.transaction({ core: true }, tx => tx.query<ScopeRow>('SELECT organization_id,brand_id,environment_id,id AS product_instance_id FROM product_instances WHERE id=$1', [firstInstanceId]))).rows[0];
    const secondBrand = randomUUID();
    const secondEnvironment = randomUUID();
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO brands(id,organization_id,name) VALUES($1,$2,$3)', [secondBrand, organization.id, 'Sibling Brand']));
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO environments(id,organization_id,brand_id,name,kind) VALUES($1,$2,$3,$4,$5)', [secondEnvironment, organization.id, secondBrand, 'Sibling Production', 'production']));
    const secondInstance = await foundation.provision(core, { organization_id: String(organization.id), brand_id: secondBrand, environment_id: secondEnvironment, product_slug: 'brokerage-crm', plan: 'test' });
    const secondRow: ScopeRow = { organization_id: String(organization.id), brand_id: secondBrand, environment_id: secondEnvironment, product_instance_id: String(secondInstance.id) };
    scope = scopeFrom(firstRow);
    sibling = scopeFrom(secondRow);
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), scope.organizationId, clientId, scope.productInstanceId]);
      instrumentEnabled = randomUUID(); instrumentDisabled = randomUUID(); sourceId = randomUUID(); quoteId = randomUUID();
      for (const [id, symbol] of [[instrumentEnabled, 'EURUSD'], [instrumentDisabled, 'USDJPY']] as const) await tx.query('INSERT INTO market_data_instruments(id,symbol,display_name,price_scale,tick_size) VALUES($1,$2,$3,$4,$5)', [id, symbol, symbol, 5, '0.00001']);
      await tx.query('INSERT INTO market_data_sources(id,slug,source_kind,provenance) VALUES($1,$2,$3,$4)', [sourceId, `simulated-${sourceId.slice(0, 8)}`, 'simulated', 'simulated']);
      await tx.query('INSERT INTO market_data_instrument_access(organization_id,brand_id,environment_id,product_instance_id,instrument_id,enabled) VALUES($1,$2,$3,$4,$5,true),($1,$2,$3,$4,$6,false)', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentEnabled, instrumentDisabled]);
      await tx.query('INSERT INTO market_data_latest_quotes(id,organization_id,brand_id,environment_id,product_instance_id,instrument_id,source_id,bid,ask,source_event_at,received_at,event_id,provenance,source_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [quoteId, scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentEnabled, sourceId, '1.10000', '1.10002', '2026-10-11T00:00:00Z', '2026-10-11T00:00:01Z', 'boundary-quote', 'simulated', 'simulated']);
      await tx.query('INSERT INTO market_data_latest_quotes(id,organization_id,brand_id,environment_id,product_instance_id,instrument_id,source_id,bid,ask,source_event_at,received_at,event_id,provenance,source_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [randomUUID(), scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentDisabled, sourceId, '110.00000', '110.00002', '2026-10-11T00:00:00Z', '2026-10-11T00:00:01Z', 'disabled-quote', 'simulated', 'simulated']);
    });
    service = new MarketDataService(db);
  });

  afterAll(async () => { await db?.close(); });

  it('enforces enabled, disabled, and absent entitlements on catalog and quote reads', async () => {
    expect((await service.listInstruments(scope)).map(row => row.id)).toEqual([instrumentEnabled]);
    expect(await service.getLatest(scope, instrumentEnabled)).toMatchObject({ id: quoteId, bid: '1.1' });
    expect(await service.getLatest(scope, instrumentDisabled)).toBeNull();
    expect(await service.listLatest(scope, [instrumentEnabled, instrumentDisabled])).toHaveLength(1);
    expect(await service.listInstruments(sibling)).toEqual([]);
    expect(await service.getLatest(sibling, instrumentEnabled)).toBeNull();
    expect(await service.listLatest(sibling, [instrumentEnabled])).toEqual([]);
    for (const [target, instrumentId] of [[scope, instrumentDisabled], [sibling, instrumentEnabled]] as const) {
      await expect(service.ingest(target, { instrumentId, sourceId, bid: '1.1', ask: '1.10002', sourceEventAt: '2026-10-10T00:00:00Z', eventId: 'unauthorized-entitlement' }, 'internal-market-data')).rejects.toMatchObject({ code: 'INSTRUMENT_NOT_AUTHORIZED' });
    }
  });

  it('keeps direct restricted-role reads and writes tenant and entitlement isolated', async () => {
    expect((await db.transaction(scope, tx => tx.query('SELECT instrument_id FROM market_data_instrument_access WHERE instrument_id=$1', [instrumentEnabled]))).rows).toHaveLength(1);
    expect((await db.transaction(scope, tx => tx.query('SELECT id FROM market_data_latest_quotes WHERE id=$1', [quoteId]))).rows).toHaveLength(1);
    expect((await db.transaction(sibling, tx => tx.query('SELECT instrument_id FROM market_data_instrument_access'))).rows).toEqual([]);
    expect((await db.transaction(sibling, tx => tx.query('SELECT id FROM market_data_latest_quotes'))).rows).toEqual([]);
    expect((await db.transaction(scope, tx => tx.query('UPDATE market_data_instrument_access SET enabled=false WHERE instrument_id=$1 RETURNING instrument_id', [instrumentEnabled]))).rows).toEqual([]);
    await expect(db.transaction(sibling, tx => tx.query('INSERT INTO market_data_instrument_access(organization_id,brand_id,environment_id,product_instance_id,instrument_id) VALUES($1,$2,$3,$4,$5)', [sibling.organizationId, sibling.brandId, sibling.environmentId, sibling.productInstanceId, instrumentEnabled]))).rejects.toMatchObject({ code: '42501' });
    await expect(db.transaction(scope, tx => tx.query('INSERT INTO market_data_latest_quotes(id,organization_id,brand_id,environment_id,product_instance_id,instrument_id,source_id,bid,ask,source_event_at,received_at,event_id,provenance,source_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [randomUUID(), scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentEnabled, sourceId, '1.2', '1.20002', '2026-10-11T00:00:00Z', '2026-10-11T00:00:01Z', 'forged', 'simulated', 'simulated']))).rejects.toMatchObject({ code: '42501' });
    expect((await db.transaction(sibling, tx => tx.query('UPDATE market_data_latest_quotes SET bid=$1 WHERE id=$2 RETURNING id', ['1.0', quoteId]))).rows).toEqual([]);
    expect((await db.transaction(scope, tx => tx.query('SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'))).rows).toEqual([{ current_user: 'azuriya_app', rolsuper: false, rolbypassrls: false }]);
    await db.transaction({ core: true }, tx => tx.query('UPDATE market_data_instrument_access SET enabled=false WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND instrument_id=$5', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentEnabled]));
    try {
      expect((await db.transaction(scope, tx => tx.query('SELECT id FROM market_data_latest_quotes WHERE id=$1', [quoteId]))).rows).toEqual([]);
      expect(await service.getLatest(scope, instrumentEnabled)).toBeNull();
      expect(await service.listLatest(scope, [instrumentEnabled])).toEqual([]);
      expect(await service.listInstruments(scope)).toEqual([]);
      expect((await db.transaction({ core: true }, tx => tx.query('SELECT id,bid::text FROM market_data_latest_quotes WHERE id=$1', [quoteId]))).rows).toEqual([{ id: quoteId, bid: '1.100000000000000000' }]);
    } finally {
      await db.transaction({ core: true }, tx => tx.query('UPDATE market_data_instrument_access SET enabled=true WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND instrument_id=$5', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentEnabled]));
    }
  });

  it('checks each brand, environment, and product-instance RLS dimension inside one organization', async () => {
    for (const changed of [{ brandId: sibling.brandId }, { environmentId: sibling.environmentId }, { productInstanceId: sibling.productInstanceId }]) {
      const mismatched = { ...scope, ...changed };
      expect((await db.transaction(mismatched, tx => tx.query('SELECT instrument_id FROM market_data_instrument_access'))).rows).toEqual([]);
      expect((await db.transaction(mismatched, tx => tx.query('SELECT id FROM market_data_latest_quotes'))).rows).toEqual([]);
      expect(await service.listInstruments(mismatched)).toEqual([]);
      expect(await service.getLatest(mismatched, instrumentEnabled)).toBeNull();
    }
    expect((await db.query('SELECT instrument_id FROM market_data_instrument_access')).rows).toEqual([]);
    expect((await db.query('SELECT id FROM market_data_latest_quotes')).rows).toEqual([]);
  });

  it('keeps source provenance immutable while allowing controlled source administration', async () => {
    const current = (await db.transaction({ core: true }, tx => tx.query<{ slug: string; active: boolean; provenance: string }>('SELECT slug,active,provenance FROM market_data_sources WHERE id=$1', [sourceId]))).rows[0];
    const alternateSourceId = randomUUID();
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO market_data_sources(id,slug,source_kind,provenance) VALUES($1,$2,$3,$4)', [alternateSourceId, `simulated-${alternateSourceId.slice(0, 8)}`, 'simulated', 'simulated']));
    expect((await db.transaction({ core: true }, tx => tx.query<{ slug: string; active: boolean; provenance: string }>('UPDATE market_data_sources SET slug=$1,active=false WHERE id=$2 RETURNING slug,active,provenance', [`renamed-${sourceId.slice(0, 8)}`, sourceId]))).rows[0]).toMatchObject({ active: false, provenance: 'simulated' });
    await expect(db.transaction({ core: true }, tx => tx.query('UPDATE market_data_sources SET provenance=$1 WHERE id=$2', ['verified_provider', sourceId]))).rejects.toMatchObject({ code: '42501' });
    await expect(db.transaction({ core: true }, tx => tx.query('UPDATE market_data_latest_quotes SET provenance=$1,source_kind=$2 WHERE id=$3', ['verified_provider', 'provider', quoteId]))).rejects.toMatchObject({ code: '42501' });
    await expect(db.transaction({ core: true }, tx => tx.query('UPDATE market_data_latest_quotes SET source_id=$1 WHERE id=$2', [alternateSourceId, quoteId]))).rejects.toMatchObject({ code: '42501' });
    expect((await db.transaction({ core: true }, tx => tx.query<{ id: string; bid: string }>('UPDATE market_data_latest_quotes SET bid=$1 WHERE id=$2 RETURNING id,bid::text', ['1.10001', quoteId]))).rows[0]).toMatchObject({ id: quoteId, bid: '1.100010000000000000' });
    expect((await db.transaction({ core: true }, tx => tx.query<{ slug: string; active: boolean; provenance: string }>('UPDATE market_data_sources SET active=true WHERE id=$1 RETURNING slug,active,provenance', [sourceId]))).rows[0]).toMatchObject({ slug: `renamed-${sourceId.slice(0, 8)}`, active: true, provenance: current.provenance });
  });

  it('keeps source event ordering enforced for trusted direct snapshot writes', async () => {
    const orderingSourceId = randomUUID();
    const orderingQuoteId = randomUUID();
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO market_data_sources(id,slug,source_kind,provenance) VALUES($1,$2,$3,$4)', [orderingSourceId, `simulated-${orderingSourceId.slice(0, 8)}`, 'simulated', 'simulated']));
    await expect(db.transaction({ core: true }, tx => tx.query(
      'INSERT INTO market_data_latest_quotes(id,organization_id,brand_id,environment_id,product_instance_id,instrument_id,source_id,bid,ask,source_event_at,received_at,event_id,provenance,source_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [orderingQuoteId, scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentEnabled, orderingSourceId, '1.10000', '1.10002', '2026-10-11T00:00:02Z', '2026-10-11T00:00:01Z', 'invalid-ordering', 'simulated', 'simulated'],
    ))).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces bounded instrument and quote lists', async () => {
    await expect(service.listInstruments(scope, 101)).rejects.toMatchObject({ code: 'INSTRUMENT_QUERY_LIMIT' });
    await expect(service.listLatest(scope, Array.from({ length: 101 }, () => randomUUID()))).rejects.toMatchObject({ code: 'QUOTE_QUERY_LIMIT' });
    expect(await service.listLatest(scope, [])).toEqual([]);
  });
});

describe('market-data instrument HTTP authorization', () => {
  let db: Database;
  let app: FastifyInstance;
  let instanceId: string;
  let ownerCookie: string;
  let clientCookie: string;
  const coreId = randomUUID(); const ownerId = randomUUID(); const clientId = randomUUID();
  const password = 'market-data-http-password';

  beforeAll(async () => {
    db = await createDatabase(); await migrate(db); await seedCatalog(db);
    const hash = await hashPassword(password);
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO users(id,email,password_hash,display_name,core_role) VALUES($1,$2,$3,$4,$5)', [coreId, `http-core-${coreId}@test.local`, hash, 'HTTP Core', 'super_admin']);
      await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [ownerId, `http-owner-${ownerId}@test.local`, hash, 'HTTP Owner']);
      await tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [clientId, `http-client-${clientId}@test.local`, hash, 'HTTP Client']);
    });
    const foundation = new FoundationService(db);
    const organization = await foundation.createOrganization({ userId: coreId, requestId: randomUUID(), core: true }, { name: 'Market HTTP', slug: `market-http-${coreId.slice(0, 8)}`, business_type: 'brokerage', brand_name: 'Market HTTP', environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test', owner_email: `http-owner-${ownerId}@test.local` });
    instanceId = String((organization.product_instances as Array<Record<string, unknown>>)[0].id);
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO client_memberships(id,organization_id,user_id,product_instance_id) VALUES($1,$2,$3,$4)', [randomUUID(), organization.id, clientId, instanceId]));
    app = await buildApp({ db, origin: 'http://localhost', production: false, requireWorker: false });
    const login = async (email: string) => {
      const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return response.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    };
    ownerCookie = await login(`http-owner-${ownerId}@test.local`);
    clientCookie = await login(`http-client-${clientId}@test.local`);
  });

  afterAll(async () => { await app?.close(); await db?.close(); });

  it('requires authentication and applies staff/client tenancy to instrument reads', async () => {
    const staffUrl = `/api/v1/instances/${instanceId}/brokerage/quotes/instruments`;
    const clientUrl = `/api/v1/client/instances/${instanceId}/brokerage/quotes/instruments`;
    expect((await app.inject({ url: staffUrl })).statusCode).toBe(401);
    expect((await app.inject({ url: clientUrl })).statusCode).toBe(401);
    expect((await app.inject({ url: staffUrl, headers: { cookie: ownerCookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: clientUrl, headers: { cookie: clientCookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: clientUrl, headers: { cookie: ownerCookie } })).statusCode).toBe(403);
    expect((await app.inject({ url: staffUrl, headers: { cookie: clientCookie } })).statusCode).toBe(403);
  });
});
