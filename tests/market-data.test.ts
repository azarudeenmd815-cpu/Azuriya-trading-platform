import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AppError } from '../src/server/domain/errors.js';
import { canonicalDecimal, MarketDataService, normalizeQuote as normalizeServerQuote } from '../src/server/market-data/quotes.js';
import { createDatabase, type Database } from '../src/server/db/database.js';
import { migrate } from '../src/server/db/migrate.js';
import { seedCatalog } from '../src/server/db/seed.js';
import { FoundationService } from '../src/server/domain/service.js';
import type { TenantContext } from '../src/shared/types.js';
import { applyQuote, filterInstruments, formatPrice, isNewerQuote, normalizeQuote as normalizeClientQuote, quoteState, uniqueInstruments, type Instrument, type Quote } from '../src/client/trading/marketData';

const instrument = { id: '00000000-0000-0000-0000-000000000001', symbol: 'EURUSD', price_scale: 5, tick_size: '0.00001', zero_spread_allowed: true, active: true };
const source = { id: '00000000-0000-0000-0000-000000000002', source_kind: 'simulated' as const, provenance: 'simulated' as const, active: true };
const eventTime = new Date(Date.now() - 60_000).toISOString();
const receiveTime = new Date(Date.now() - 30_000).toISOString();
const base = { instrumentId: instrument.id, sourceId: source.id, bid: '1.10000', ask: '1.10002', sourceEventAt: eventTime, receivedAt: receiveTime, eventId: 'evt-1' };

describe('market-data quote normalization', () => {
  it('canonicalizes exact decimal strings without binary arithmetic', () => {
    expect(canonicalDecimal('1.23000', 'bid')).toBe('1.23');
    expect(normalizeServerQuote(base, instrument, source)).toMatchObject({ bid: '1.1', ask: '1.10002', provenance: 'simulated' });
  });

  it.each([
    ['malformed decimal', { bid: '1.1e0' }],
    ['numeric value', { bid: 1.1 }],
    ['zero bid', { bid: '0' }],
    ['negative ask', { ask: '-1' }],
    ['crossed quote', { bid: '1.10003' }],
    ['precision violation', { bid: '1.100001' }],
    ['tick violation', { bid: '1.100011' }],
    ['source sequence overflow', { sourceSequence: '9223372036854775808' }],
    ['invalid timestamp', { sourceEventAt: 'invalid' }],
  ])('%s is rejected', (_label, change) => {
    expect(() => normalizeServerQuote({ ...base, ...change } as never, instrument, source)).toThrow(AppError);
  });

  it('rejects zero spread when the instrument policy disallows it', () => {
    expect(() => normalizeServerQuote({ ...base, ask: base.bid }, { ...instrument, zero_spread_allowed: false }, source)).toThrow('Zero-spread');
  });

  it('rejects inactive instruments and sources', () => {
    expect(() => normalizeServerQuote(base, { ...instrument, active: false }, source)).toThrow('instrument');
    expect(() => normalizeServerQuote(base, instrument, { ...source, active: false })).toThrow('source');
  });
});

describe('market-data latest snapshots and tenant entitlements', () => {
  let db: Database;
  let service: MarketDataService;
  let scope: TenantContext;
  let foreignScope: TenantContext;
  let instrumentId: string;
  let sourceId: string;
  const core = { userId: randomUUID(), requestId: randomUUID(), core: true as const };
  const eventClock = Date.now();
  const event = (secondsAgo: number) => new Date(eventClock - secondsAgo * 1000).toISOString();

  beforeAll(async () => {
    db = await createDatabase();
    await migrate(db);
    await seedCatalog(db);
    await db.transaction({ core: true }, tx => tx.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [core.userId, `market-core-${core.userId}@test.local`, 'unused', 'Market core']));
    const foundation = new FoundationService(db);
    const first = await foundation.createOrganization(core, { name: 'Market ABC', slug: `market-abc-${core.userId.slice(0, 8)}`, business_type: 'brokerage', brand_name: 'Market ABC', environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'foundation' });
    const second = await foundation.createOrganization(core, { name: 'Market XYZ', slug: `market-xyz-${core.userId.slice(0, 8)}`, business_type: 'brokerage', brand_name: 'Market XYZ', environment_name: 'Production', environment_kind: 'production', products: ['brokerage-crm'], plan: 'foundation' });
    const firstInstance = String((first.product_instances as unknown[])[0] && (first.product_instances as Array<Record<string, unknown>>)[0].id);
    const secondInstance = String((second.product_instances as unknown[])[0] && (second.product_instances as Array<Record<string, unknown>>)[0].id);
    const firstScope = (await db.transaction({ core: true }, tx => tx.query<{ organization_id: string; brand_id: string; environment_id: string; product_instance_id: string }>('SELECT organization_id,brand_id,environment_id,id AS product_instance_id FROM product_instances WHERE id=$1', [firstInstance]))).rows[0];
    const secondScope = (await db.transaction({ core: true }, tx => tx.query<{ organization_id: string; brand_id: string; environment_id: string; product_instance_id: string }>('SELECT organization_id,brand_id,environment_id,id AS product_instance_id FROM product_instances WHERE id=$1', [secondInstance]))).rows[0];
    scope = { userId: core.userId, requestId: randomUUID(), core: false, organizationId: firstScope.organization_id, brandId: firstScope.brand_id, environmentId: firstScope.environment_id, productInstanceId: firstScope.product_instance_id, productSlug: 'brokerage-crm', permissions: ['brokerage.accounts.read'] };
    foreignScope = { userId: core.userId, requestId: randomUUID(), core: false, organizationId: secondScope.organization_id, brandId: secondScope.brand_id, environmentId: secondScope.environment_id, productInstanceId: secondScope.product_instance_id, productSlug: 'brokerage-crm', permissions: ['brokerage.accounts.read'] };
    instrumentId = randomUUID(); sourceId = randomUUID();
    await db.transaction({ core: true }, async tx => {
      await tx.query('INSERT INTO market_data_instruments(id,symbol,display_name,price_scale,tick_size) VALUES($1,$2,$3,$4,$5)', [instrumentId, 'EURUSD', 'Euro / US Dollar', 5, '0.00001']);
      await tx.query('INSERT INTO market_data_sources(id,slug,source_kind,provenance) VALUES($1,$2,$3,$4)', [sourceId, `simulated-${sourceId.slice(0, 8)}`, 'simulated', 'simulated']);
      await tx.query('INSERT INTO market_data_instrument_access(organization_id,brand_id,environment_id,product_instance_id,instrument_id) VALUES($1,$2,$3,$4,$5)', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentId]);
    });
    service = new MarketDataService(db);
  });
  afterAll(async () => { await db?.close(); });

  it('accepts, advances, replays, and rejects stale snapshots deterministically', async () => {
    const first = await service.ingest(scope, { instrumentId, sourceId, bid: '1.10000', ask: '1.10002', sourceEventAt: event(40), eventId: 'evt-1' }, 'internal-market-data');
    expect(first.status).toBe('accepted');
    const newer = await service.ingest(scope, { instrumentId, sourceId, bid: '1.10010', ask: '1.10012', sourceEventAt: event(20), sourceSequence: '2', eventId: 'evt-2' }, 'internal-market-data');
    expect(newer).toMatchObject({ status: 'accepted', snapshot: { bid: '1.1001', sourceSequence: '2' } });
    expect((await service.ingest(scope, { instrumentId, sourceId, bid: '1.10005', ask: '1.10007', sourceEventAt: event(10), sourceSequence: '1', eventId: 'evt-old' }, 'internal-market-data')).status).toBe('stale');
    expect((await service.ingest(scope, { instrumentId, sourceId, bid: '1.10010', ask: '1.10012', sourceEventAt: event(20), sourceSequence: '2', eventId: 'evt-2' }, 'internal-market-data')).status).toBe('duplicate');
    await expect(service.ingest(scope, { instrumentId, sourceId, bid: '1.10020', ask: '1.10010', sourceEventAt: event(1), eventId: 'evt-invalid' }, 'internal-market-data')).rejects.toMatchObject({ code: 'QUOTE_REJECTED' });
    expect((await service.getLatest(scope, instrumentId))?.bid).toBe('1.1001');
  });

  it('enforces explicit entitlements and tenant isolation', async () => {
    await service.ingest(scope, { instrumentId, sourceId, bid: '1.20000', ask: '1.20002', sourceEventAt: event(1), sourceSequence: '3', eventId: 'entitlement-quote' }, 'internal-market-data');
    expect(await service.getLatest(scope, instrumentId)).toMatchObject({ bid: '1.2' });
    expect((await service.listInstruments(scope)).map(item => item.id)).toEqual([instrumentId]);
    expect(await service.listInstruments(foreignScope)).toEqual([]);
    await expect(service.ingest(foreignScope, { instrumentId, sourceId, bid: '1.20000', ask: '1.20002', sourceEventAt: event(1), eventId: 'foreign' }, 'internal-market-data')).rejects.toMatchObject({ code: 'INSTRUMENT_NOT_AUTHORIZED' });
    expect(await service.getLatest(foreignScope, instrumentId)).toBeNull();
    await db.transaction({ core: true }, tx => tx.query('UPDATE market_data_instrument_access SET enabled=false WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND instrument_id=$5', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentId]));
    try {
      expect(await service.getLatest(scope, instrumentId)).toBeNull();
      expect(await service.listLatest(scope, [instrumentId])).toEqual([]);
      await expect(service.ingest(scope, { instrumentId, sourceId, bid: '1.20000', ask: '1.20002', sourceEventAt: event(1), eventId: 'forged' }, 'untrusted-client')).rejects.toMatchObject({ code: 'MARKET_DATA_AUTHORITY_REQUIRED' });
    } finally {
      await db.transaction({ core: true }, tx => tx.query('UPDATE market_data_instrument_access SET enabled=true WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND instrument_id=$5', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentId]));
    }
  });
});

const instruments: Instrument[] = [
  { id: 'eur-usd', symbol: 'EURUSD', name: 'Euro / US Dollar' },
  { id: 'xau-usd', symbol: 'XAUUSD', name: 'Gold / US Dollar' },
];

describe('market terminal data model', () => {
  it('keeps authorized instruments unique and filters without mutating the source', () => {
    const source = [...instruments, instruments[0]];
    expect(uniqueInstruments(source).map(item => item.id)).toEqual(['eur-usd', 'xau-usd']);
    expect(filterInstruments(source, 'gold').map(item => item.id)).toEqual(['xau-usd']);
    expect(source).toHaveLength(3);
  });

  it('preserves server decimal strings and distinguishes zero from missing prices', () => {
    expect(formatPrice('0.00000000')).toBe('0.00000000');
    expect(formatPrice(undefined)).toBe('-');
    expect(normalizeClientQuote({ instrument_id: 'eur-usd', bid: '0.00000000', ask: '1.230000' })).toEqual({ instrumentId: 'eur-usd', bid: '0.00000000', ask: '1.230000', sequence: null, timestamp: null });
    expect(normalizeClientQuote({ instrument_id: 'eur-usd', bid: 0 })).toBeNull();
  });

  it('accepts canonical ordering metadata and ignores older or duplicate quotes', () => {
    const first: Quote = { instrumentId: 'eur-usd', bid: '1.1000', sequence: 8 };
    const older: Quote = { instrumentId: 'eur-usd', bid: '1.0990', sequence: 7 };
    const newer: Quote = { instrumentId: 'eur-usd', bid: '1.1010', sequence: 9 };
    expect(isNewerQuote(older, first)).toBe(false);
    expect(isNewerQuote(first, first)).toBe(false);
    expect(isNewerQuote(newer, first)).toBe(true);
    const quotes = applyQuote(applyQuote(new Map(), first), older);
    expect(quotes.get('eur-usd')?.bid).toBe('1.1000');
    expect(applyQuote(quotes, newer).get('eur-usd')?.bid).toBe('1.1010');
  });

  it('uses timestamps for staleness only when the feed is connected', () => {
    const quote: Quote = { instrumentId: 'eur-usd', bid: '1.1000', timestamp: '2026-10-10T00:00:00.000Z' };
    const now = Date.parse('2026-10-10T00:00:20.000Z');
    expect(quoteState(undefined, 'connected', now)).toBe('missing');
    expect(quoteState(quote, 'disconnected', now)).toBe('offline');
    expect(quoteState(quote, 'connected', now)).toBe('stale');
    expect(quoteState(quote, 'connected', Date.parse('2026-10-10T00:00:05.000Z'))).toBe('live');
  });
});
