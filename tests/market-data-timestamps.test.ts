import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppError } from '../src/server/domain/errors.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import { MarketDataService, normalizeQuote } from '../src/server/market-data/quotes.js';
import type { TenantContext } from '../src/shared/types.js';

type Fixture = {
  db: Database;
  service: MarketDataService;
  scope: TenantContext;
  instrumentId: string;
  sourceId: string;
};

const instrumentFor = (id: string) => ({ id, symbol: `EUR${id.slice(0, 4).toUpperCase()}`, price_scale: 5, tick_size: '0.00001', zero_spread_allowed: true, active: true });
const sourceFor = (id: string) => ({ id, source_kind: 'simulated' as const, provenance: 'simulated' as const, active: true });

async function createFixture(): Promise<Fixture> {
  const db = await createDatabase();
  await migrate(db);
  await seedCatalog(db);
  const userId = randomUUID();
  const core = { userId, requestId: randomUUID(), core: true as const };
  const email = `market-time-${userId}@test.local`;
  await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [userId, email, 'unused', 'Market timestamp test']));
  const foundation = new FoundationService(db);
  const organization = await foundation.createOrganization(core, {
    name: 'Timestamp Market', slug: `timestamp-market-${userId.slice(0, 8)}`, business_type: 'brokerage', brand_name: 'Timestamp Market',
    environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'test',
  });
  const productInstanceId = String((organization.product_instances as Array<Record<string, unknown>>)[0].id);
  const scopeRow = (await db.transaction({ core: true }, tx => tx.query<{ organization_id: string; brand_id: string; environment_id: string; product_instance_id: string }>('SELECT organization_id,brand_id,environment_id,id AS product_instance_id FROM product_instances WHERE id=$1', [productInstanceId]))).rows[0];
  const scope: TenantContext = { userId, requestId: randomUUID(), core: false, organizationId: scopeRow.organization_id, brandId: scopeRow.brand_id, environmentId: scopeRow.environment_id, productInstanceId: scopeRow.product_instance_id, productSlug: 'brokerage-crm', permissions: ['brokerage.accounts.read'] };
  const instrumentId = randomUUID();
  const sourceId = randomUUID();
  await db.transaction({ core: true }, tx => tx.query('INSERT INTO market_data_instruments(id,symbol,display_name,price_scale,tick_size) VALUES($1,$2,$3,$4,$5)', [instrumentId, `EUR${instrumentId.slice(0, 4).toUpperCase()}`, 'Timestamp instrument', 5, '0.00001']));
  await db.transaction({ core: true }, async tx => {
    await tx.query('INSERT INTO market_data_sources(id,slug,source_kind,provenance) VALUES($1,$2,$3,$4)', [sourceId, `simulated-${sourceId.slice(0, 8)}`, 'simulated', 'simulated']);
    await tx.query('INSERT INTO market_data_instrument_access(organization_id,brand_id,environment_id,product_instance_id,instrument_id) VALUES($1,$2,$3,$4,$5)', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentId]);
  });
  return { db, service: new MarketDataService(db), scope, instrumentId, sourceId };
}

const normalizationInstrument = instrumentFor('normalization-instrument');
const normalizationSource = sourceFor('normalization-source');
const normalizationInput = (sourceEventAt: string, eventId: string = randomUUID(), overrides: Record<string, unknown> = {}) => ({
  instrumentId: normalizationInstrument.id, sourceId: normalizationSource.id, bid: '1.10000', ask: '1.10002', sourceEventAt,
  receivedAt: sourceEventAt, eventId, ...overrides,
});

describe('market-data timestamp normalization', () => {

  it.each([
    ['2026-10-10T00:00:00Z', '2026-10-10T00:00:00.000000Z'],
    ['2026-10-10T00:00:00.1Z', '2026-10-10T00:00:00.100000Z'],
    ['2026-10-10T00:00:00.12Z', '2026-10-10T00:00:00.120000Z'],
    ['2026-10-10T00:00:00.123456Z', '2026-10-10T00:00:00.123456Z'],
  ])('normalizes %s to six fractional digits', (value, expected) => {
    const normalized = normalizeQuote(normalizationInput(value), normalizationInstrument, normalizationSource);
    expect(normalized.sourceEventAt).toBe(expected);
    expect(normalized.receivedAt).toBe(expected);
  });

  it.each([
    '2026-10-10T00:00:00.1234567Z',
    '2026-10-10T00:00:00.123456789Z',
    '2026-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '0000-01-01T00:00:00Z',
    '2016-12-31T23:59:60Z',
    '2026-10-10T24:00:00Z',
    '2026-10-10T00:00:00+00:00',
  ])('rejects invalid or unsupported timestamp %s', value => {
    expect(() => normalizeQuote(normalizationInput(value), normalizationInstrument, normalizationSource)).toThrow(AppError);
  });

  it('rejects a source event after receipt and future source or receipt events beyond tolerance', () => {
    expect(() => normalizeQuote(normalizationInput('2026-10-10T00:00:00.123457Z', 'ordering', { receivedAt: '2026-10-10T00:00:00.123456Z' }), normalizationInstrument, normalizationSource)).toThrow('sourceEventAt');
    const within = new Date(Date.now() + 4 * 60_000).toISOString().replace(/(\.\d{3})Z$/, '$1000Z');
    expect(normalizeQuote(normalizationInput(within, 'future-within'), normalizationInstrument, normalizationSource)).toMatchObject({ sourceEventAt: within });
    const future = new Date(Date.now() + 6 * 60_000).toISOString().replace(/(\.\d{3})Z$/, '$1000Z');
    expect(() => normalizeQuote(normalizationInput(future, 'future-source'), normalizationInstrument, normalizationSource)).toThrow('future');
    const current = new Date().toISOString().replace(/(\.\d{3})Z$/, '$1000Z');
    const receiptFuture = new Date(Date.now() + 6 * 60_000).toISOString().replace(/(\.\d{3})Z$/, '$1000Z');
    expect(() => normalizeQuote(normalizationInput(current, 'future-receipt', { receivedAt: receiptFuture }), normalizationInstrument, normalizationSource)).toThrow('future');
  });
});

describe('market-data timestamp ordering and persistence', () => {
  let fixture: Fixture;

  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await fixture?.db.close(); });

  const input = (sourceEventAt: string, eventId: string = randomUUID(), overrides: Record<string, unknown> = {}) => ({
    instrumentId: fixture.instrumentId, sourceId: fixture.sourceId, bid: '1.10000', ask: '1.10002', sourceEventAt,
    receivedAt: sourceEventAt, eventId, ...overrides,
  });

  it('orders microsecond events precisely and preserves stale reverse ordering', async () => {
    const first = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123100Z', 'a-older'), 'internal-market-data');
    expect(first.status).toBe('accepted');
    const newer = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123900Z', 'z-newer', { bid: '1.10010', ask: '1.10012' }), 'internal-market-data');
    expect(newer).toMatchObject({ status: 'accepted', snapshot: { eventId: 'z-newer', bid: '1.1001', sourceEventAt: '2026-10-10T00:00:00.123900Z' } });
    const stale = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123100Z', '0-stale', { bid: '1.10020', ask: '1.10022' }), 'internal-market-data');
    expect(stale.status).toBe('stale');
    expect((await fixture.service.getLatest(fixture.scope, fixture.instrumentId))?.eventId).toBe('z-newer');
  });

  it('keeps duplicate payload identity idempotent when timestamps match', async () => {
    const first = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123456Z', 'same-event'), 'internal-market-data');
    const duplicate = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123456Z', 'same-event', { bid: '1.10010', ask: '1.10012' }), 'internal-market-data');
    expect(first.status).toBe('accepted');
    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.snapshot.bid).toBe('1.1');
  });

  it('prioritizes trusted source sequence over event time', async () => {
    await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.900000Z', 'seq-one', { sourceSequence: '1' }), 'internal-market-data');
    const newerSequence = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.100000Z', 'seq-two', { sourceSequence: '2', bid: '1.10010', ask: '1.10012' }), 'internal-market-data');
    expect(newerSequence).toMatchObject({ status: 'accepted', snapshot: { sourceSequence: '2', eventId: 'seq-two' } });
    const oldSequence = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.999999Z', 'seq-one-late', { sourceSequence: '1', bid: '1.10020', ask: '1.10022' }), 'internal-market-data');
    expect(oldSequence.status).toBe('stale');
  });

  it('uses event identity as the deterministic exact-timestamp tie-break', async () => {
    await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123456Z', 'z-tie'), 'internal-market-data');
    const lower = await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123456Z', 'a-tie', { bid: '1.10010', ask: '1.10012' }), 'internal-market-data');
    expect(lower).toMatchObject({ status: 'accepted', snapshot: { eventId: 'a-tie', bid: '1.1001' } });
    expect((await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123456Z', 'z-again', { bid: '1.10020', ask: '1.10022' }), 'internal-market-data')).status).toBe('stale');
  });

  it('keeps single, batch, reinitialized-service reads and UTC SQL formatting at full precision', async () => {
    await fixture.service.ingest(fixture.scope, input('2026-10-10T00:00:00.123456Z', 'full-precision'), 'internal-market-data');
    const service = new MarketDataService(fixture.db);
    const single = await service.getLatest(fixture.scope, fixture.instrumentId);
    const batch = await service.listLatest(fixture.scope, [fixture.instrumentId]);
    expect(single).toMatchObject({ sourceEventAt: '2026-10-10T00:00:00.123456Z', receivedAt: '2026-10-10T00:00:00.123456Z' });
    expect(batch[0]).toMatchObject({ sourceEventAt: '2026-10-10T00:00:00.123456Z', receivedAt: '2026-10-10T00:00:00.123456Z' });
    const sql = `SELECT to_char(source_event_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS source_event_at, to_char(received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received_at FROM market_data_latest_quotes WHERE instrument_id=$1`;
    const utc = (await fixture.db.transaction({ ...fixture.scope }, async tx => { await tx.query("SET LOCAL TIME ZONE 'UTC'"); return tx.query<{ source_event_at: string; received_at: string }>(sql, [fixture.instrumentId]); })).rows[0];
    const pacific = (await fixture.db.transaction({ ...fixture.scope }, async tx => { await tx.query("SET LOCAL TIME ZONE 'America/Los_Angeles'"); return tx.query<{ source_event_at: string; received_at: string }>(sql, [fixture.instrumentId]); })).rows[0];
    expect(utc).toEqual(pacific);
    expect(utc).toEqual({ source_event_at: '2026-10-10T00:00:00.123456Z', received_at: '2026-10-10T00:00:00.123456Z' });
  });
});
