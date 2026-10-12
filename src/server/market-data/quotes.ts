import { randomUUID } from 'node:crypto';
import type { Database, Executor } from '../db/database.js';
import { AppError } from '../domain/errors.js';
import type { TenantContext } from '../../shared/types.js';

export const INTERNAL_MARKET_DATA_AUTHORITY = 'internal-market-data' as const;
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

export interface QuoteInput {
  instrumentId: string;
  sourceId: string;
  bid: string;
  ask: string;
  sourceEventAt: string;
  receivedAt?: string;
  sourceSequence?: string | bigint;
  eventId: string;
}

export interface NormalizedQuote {
  instrumentId: string;
  sourceId: string;
  bid: string;
  ask: string;
  sourceEventAt: string;
  receivedAt: string;
  sourceSequence: string | null;
  eventId: string;
  provenance: 'simulated' | 'verified_provider';
  sourceKind: 'simulated' | 'provider';
}

export interface QuoteSnapshot extends NormalizedQuote {
  id: string;
  organizationId: string;
  brandId: string;
  environmentId: string;
  productInstanceId: string;
  updatedAt: string;
}

export type QuoteIngestionResult =
  | { status: 'accepted'; snapshot: QuoteSnapshot }
  | { status: 'duplicate'; snapshot: QuoteSnapshot }
  | { status: 'stale'; snapshot: QuoteSnapshot };

interface Instrument {
  id: string;
  symbol: string;
  price_scale: number;
  tick_size: string;
  zero_spread_allowed: boolean;
  active: boolean;
}
interface Source { id: string; source_kind: 'simulated' | 'provider'; provenance: 'simulated' | 'verified_provider'; active: boolean }
interface SnapshotRow {
  id: string; organization_id: string; brand_id: string; environment_id: string; product_instance_id: string;
  instrument_id: string; source_id: string; bid: string; ask: string; source_event_at: string;
  received_at: string; source_sequence: string | null; event_id: string; updated_at: string;
  provenance: 'simulated' | 'verified_provider'; source_kind: 'simulated' | 'provider';
}

const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/;
const SNAPSHOT_COLUMNS = `q.id,q.organization_id,q.brand_id,q.environment_id,q.product_instance_id,q.instrument_id,q.source_id,q.bid,q.ask,
  to_char(q.source_event_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS source_event_at,
  to_char(q.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received_at,
  q.source_sequence,q.event_id,
  to_char(q.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  q.provenance,q.source_kind`;

function reject(message: string, details: Record<string, unknown> = {}): never {
  throw new AppError(422, 'QUOTE_REJECTED', message, [details]);
}

/** Exact decimal parser. Numeric JavaScript values are intentionally rejected. */
export function canonicalDecimal(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) reject(`${field} must be a decimal string.`, { field });
  const [whole, fraction = ''] = value.split('.');
  if (whole.length > 12 || fraction.length > 18) reject(`${field} exceeds the supported decimal precision.`, { field });
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function decimalParts(value: string): { units: bigint; scale: number } {
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function multipleOf(value: string, step: string): boolean {
  const left = decimalParts(value); const right = decimalParts(step);
  const scale = Math.max(left.scale, right.scale);
  const a = left.units * 10n ** BigInt(scale - left.scale);
  const b = right.units * 10n ** BigInt(scale - right.scale);
  return b > 0n && a % b === 0n;
}

function timestamp(value: unknown, field: string, allowFuture = false): string {
  const match = typeof value === 'string' ? TIMESTAMP_PATTERN.exec(value) : null;
  if (!match) reject(`${field} must be a UTC ISO timestamp with at most six fractional digits.`, { field });
  if (match[1].slice(0, 4) === '0000') reject(`${field} must be a valid ISO timestamp.`, { field });
  const fraction = (match[2] ?? '').padEnd(6, '0');
  const canonical = `${match[1]}.${fraction}Z`;
  const parsed = Date.parse(`${match[1]}.${fraction.slice(0, 3)}Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== match[1]) reject(`${field} must be a valid ISO timestamp.`, { field });
  if (!allowFuture && parsed > Date.now() + FUTURE_TOLERANCE_MS) reject(`${field} is too far in the future.`, { field });
  return canonical;
}

function timestampMicros(value: string): bigint {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) throw new Error('Internal timestamp is not canonical.');
  const fraction = (match[2] ?? '').padEnd(6, '0');
  const milliseconds = Date.parse(`${match[1]}.${fraction.slice(0, 3)}Z`);
  return BigInt(milliseconds) * 1000n + BigInt(Number(fraction) - Number(fraction.slice(0, 3)) * 1000);
}

function sequence(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') {
    if (value < 0n) reject('sourceSequence must be non-negative.');
    if (value > MAX_POSTGRES_BIGINT) reject('sourceSequence exceeds the supported integer range.');
    return value.toString();
  }
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) reject('sourceSequence must be an unsigned integer string.');
  const normalized = BigInt(value);
  if (normalized > MAX_POSTGRES_BIGINT) reject('sourceSequence exceeds the supported integer range.');
  return normalized.toString();
}

function normalized(row: SnapshotRow): QuoteSnapshot {
  return {
    id: row.id, organizationId: row.organization_id, brandId: row.brand_id, environmentId: row.environment_id,
    productInstanceId: row.product_instance_id, instrumentId: row.instrument_id, sourceId: row.source_id,
    bid: canonicalDecimal(row.bid, 'bid'), ask: canonicalDecimal(row.ask, 'ask'), sourceEventAt: timestamp(row.source_event_at, 'sourceEventAt', true),
    receivedAt: timestamp(row.received_at, 'receivedAt', true), sourceSequence: row.source_sequence === null ? null : String(row.source_sequence),
    eventId: row.event_id, updatedAt: timestamp(row.updated_at, 'updatedAt', true), provenance: row.provenance, sourceKind: row.source_kind,
  };
}

function compareQuote(incoming: NormalizedQuote, current: QuoteSnapshot): number {
  if (incoming.eventId === current.eventId) return 0;
  if (incoming.sourceSequence === null && current.sourceSequence !== null) return -1;
  if (incoming.sourceSequence !== null && current.sourceSequence === null) return 1;
  if (incoming.sourceSequence !== null && current.sourceSequence !== null) {
    const a = BigInt(incoming.sourceSequence); const b = BigInt(current.sourceSequence);
    if (a !== b) return a > b ? 1 : -1;
  }
  const event = timestampMicros(incoming.sourceEventAt);
  const currentEvent = timestampMicros(current.sourceEventAt);
  if (event !== currentEvent) return event > currentEvent ? 1 : -1;
  // Equal trusted ordering metadata has no provider tie-breaker. The lower
  // event identity wins, so arrival order can never change the result.
  return incoming.eventId < current.eventId ? 1 : -1;
}

export function normalizeQuote(input: QuoteInput, instrument: Instrument, source: Source): NormalizedQuote {
  if (!instrument.active) reject('The instrument is unavailable.', { instrument_id: instrument.id });
  if (!source.active) reject('The market-data source is unavailable.', { source_id: source.id });
  const bid = canonicalDecimal(input.bid, 'bid'); const ask = canonicalDecimal(input.ask, 'ask');
  const bidParts = decimalParts(bid); const askParts = decimalParts(ask);
  if (bid === '0' || ask === '0') reject('Bid and ask must be positive.');
  if (bidParts.scale > instrument.price_scale || askParts.scale > instrument.price_scale) reject('Price precision exceeds the instrument scale.', { scale: instrument.price_scale });
  if (BigInt(`${bid.split('.')[0]}${bid.split('.')[1] ?? ''}`) > BigInt(`${ask.split('.')[0]}${ask.split('.')[1] ?? ''}`) && bidParts.scale === askParts.scale) reject('Bid cannot exceed ask.');
  const scale = Math.max(bidParts.scale, askParts.scale);
  const bidUnits = bidParts.units * 10n ** BigInt(scale - bidParts.scale); const askUnits = askParts.units * 10n ** BigInt(scale - askParts.scale);
  if (bidUnits > askUnits) reject('Bid cannot exceed ask.');
  if (bidUnits === askUnits && !instrument.zero_spread_allowed) reject('Zero-spread quotes are not allowed for this instrument.');
  if (!multipleOf(bid, instrument.tick_size) || !multipleOf(ask, instrument.tick_size)) reject('Price does not align to the instrument tick size.', { tick_size: instrument.tick_size });
  if (typeof input.eventId !== 'string' || input.eventId.length < 1 || input.eventId.length > 200) reject('eventId must be a non-empty bounded string.');
  const sourceEventAt = timestamp(input.sourceEventAt, 'sourceEventAt');
  const receivedAt = timestamp(input.receivedAt ?? new Date().toISOString(), 'receivedAt');
  if (timestampMicros(sourceEventAt) > timestampMicros(receivedAt)) reject('sourceEventAt cannot be later than receivedAt.');
  return { instrumentId: instrument.id, sourceId: source.id, bid, ask, sourceEventAt, receivedAt, sourceSequence: sequence(input.sourceSequence), eventId: input.eventId, provenance: source.provenance, sourceKind: source.source_kind };
}

export class MarketDataService {
  constructor(private readonly db: Database) {}

  async ingest(scope: TenantContext, input: QuoteInput, authority: string): Promise<QuoteIngestionResult> {
    if (authority !== INTERNAL_MARKET_DATA_AUTHORITY) throw new AppError(403, 'MARKET_DATA_AUTHORITY_REQUIRED', 'Only the internal market-data authority may ingest quotes.');
    return this.db.transaction({ core: true }, async tx => {
      const owned = (await tx.query<{ id: string }>('SELECT id FROM product_instances WHERE id=$1 AND organization_id=$2 AND brand_id=$3 AND environment_id=$4 AND status=\'active\'', [scope.productInstanceId, scope.organizationId, scope.brandId, scope.environmentId])).rows[0];
      if (!owned) throw new AppError(403, 'TENANT_SCOPE_INVALID', 'The quote tenant scope is unavailable.');
      return this.ingestInTransaction(tx, scope, input);
    });
  }

  private async ingestInTransaction(tx: Executor, scope: TenantContext, input: QuoteInput): Promise<QuoteIngestionResult> {
    const instrument = (await tx.query<Instrument>('SELECT id,symbol,price_scale,tick_size::text,zero_spread_allowed,active FROM market_data_instruments WHERE id=$1', [input.instrumentId])).rows[0];
    if (!instrument) throw new AppError(404, 'INSTRUMENT_NOT_FOUND', 'The requested instrument is unavailable.');
    const entitlement = (await tx.query<{ enabled: boolean }>('SELECT enabled FROM market_data_instrument_access WHERE organization_id=$1 AND brand_id=$2 AND environment_id=$3 AND product_instance_id=$4 AND instrument_id=$5', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, input.instrumentId])).rows[0];
    if (!entitlement?.enabled) throw new AppError(403, 'INSTRUMENT_NOT_AUTHORIZED', 'The instrument is not enabled for this product instance.');
    const source = (await tx.query<Source>('SELECT id,source_kind,provenance,active FROM market_data_sources WHERE id=$1', [input.sourceId])).rows[0];
    if (!source) throw new AppError(403, 'MARKET_DATA_SOURCE_UNAUTHORIZED', 'The market-data source is not approved.');
    const quote = normalizeQuote(input, instrument, source);
    const current = (await tx.query<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM market_data_latest_quotes q WHERE q.organization_id=$1 AND q.brand_id=$2 AND q.environment_id=$3 AND q.product_instance_id=$4 AND q.instrument_id=$5 AND q.source_id=$6 FOR UPDATE`, [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, quote.instrumentId, quote.sourceId])).rows[0];
    if (current) {
      const existing = normalized(current);
      const order = compareQuote(quote, existing);
      if (order <= 0) return { status: order === 0 ? 'duplicate' : 'stale', snapshot: existing };
      await tx.query(`UPDATE market_data_latest_quotes SET bid=$2,ask=$3,source_event_at=$4,received_at=$5,source_sequence=$6,event_id=$7,provenance=$8,source_kind=$9,updated_at=now() WHERE id=$1`, [current.id, quote.bid, quote.ask, quote.sourceEventAt, quote.receivedAt, quote.sourceSequence, quote.eventId, quote.provenance, quote.sourceKind]);
      const updated = (await tx.query<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM market_data_latest_quotes q WHERE q.id=$1`, [current.id])).rows[0];
      return { status: 'accepted', snapshot: normalized(updated) };
    }
    const inserted = (await tx.query<{ id: string }>(`INSERT INTO market_data_latest_quotes(id,organization_id,brand_id,environment_id,product_instance_id,instrument_id,source_id,bid,ask,source_event_at,received_at,source_sequence,event_id,provenance,source_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (organization_id,brand_id,environment_id,product_instance_id,instrument_id,source_id) DO NOTHING RETURNING id`, [randomUUID(), scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, quote.instrumentId, quote.sourceId, quote.bid, quote.ask, quote.sourceEventAt, quote.receivedAt, quote.sourceSequence, quote.eventId, quote.provenance, quote.sourceKind])).rows[0];
    if (inserted) {
      const snapshot = (await tx.query<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM market_data_latest_quotes q WHERE q.id=$1`, [inserted.id])).rows[0];
      return { status: 'accepted', snapshot: normalized(snapshot) };
    }
    const winner = (await tx.query<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM market_data_latest_quotes q WHERE q.organization_id=$1 AND q.brand_id=$2 AND q.environment_id=$3 AND q.product_instance_id=$4 AND q.instrument_id=$5 AND q.source_id=$6 FOR UPDATE`, [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, quote.instrumentId, quote.sourceId])).rows[0];
    if (!winner) throw new AppError(409, 'QUOTE_WRITE_CONFLICT', 'The quote snapshot changed concurrently; retry the quote.');
    const existing = normalized(winner); const order = compareQuote(quote, existing);
    if (order <= 0) return { status: order === 0 ? 'duplicate' : 'stale', snapshot: existing };
    await tx.query(`UPDATE market_data_latest_quotes SET bid=$2,ask=$3,source_event_at=$4,received_at=$5,source_sequence=$6,event_id=$7,provenance=$8,source_kind=$9,updated_at=now() WHERE id=$1`, [winner.id, quote.bid, quote.ask, quote.sourceEventAt, quote.receivedAt, quote.sourceSequence, quote.eventId, quote.provenance, quote.sourceKind]);
    const updated = (await tx.query<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM market_data_latest_quotes q WHERE q.id=$1`, [winner.id])).rows[0];
    return { status: 'accepted', snapshot: normalized(updated) };
  }

  async listInstruments(scope: TenantContext, limit = 100): Promise<Array<{ id: string; symbol: string; displayName: string; priceScale: number; tickSize: string; zeroSpreadAllowed: boolean }>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError(400, 'INSTRUMENT_QUERY_LIMIT', 'At most 100 instruments may be requested.');
    return this.db.transaction(scope, async tx => {
      const rows = (await tx.query<Instrument & { display_name: string }>('SELECT i.id,i.symbol,i.display_name,i.price_scale,i.tick_size::text,i.zero_spread_allowed FROM market_data_instruments i JOIN market_data_instrument_access a ON a.instrument_id=i.id AND a.organization_id=$1 AND a.brand_id=$2 AND a.environment_id=$3 AND a.product_instance_id=$4 AND a.enabled=true WHERE i.active=true ORDER BY i.symbol,i.id LIMIT $5', [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, limit])).rows;
      return rows.map(row => ({ id: row.id, symbol: row.symbol, displayName: row.display_name, priceScale: row.price_scale, tickSize: canonicalDecimal(row.tick_size, 'tickSize'), zeroSpreadAllowed: row.zero_spread_allowed }));
    });
  }

  async getLatest(scope: TenantContext, instrumentId: string, sourceId?: string): Promise<QuoteSnapshot | null> {
    return this.db.transaction(scope, async tx => {
      const params: unknown[] = [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentId];
      const source = sourceId ? ' AND q.source_id=$6' : '';
      if (sourceId) params.push(sourceId);
      const row = (await tx.query<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM market_data_latest_quotes q JOIN market_data_instrument_access a ON a.organization_id=q.organization_id AND a.brand_id=q.brand_id AND a.environment_id=q.environment_id AND a.product_instance_id=q.product_instance_id AND a.instrument_id=q.instrument_id AND a.enabled=true WHERE q.organization_id=$1 AND q.brand_id=$2 AND q.environment_id=$3 AND q.product_instance_id=$4 AND q.instrument_id=$5${source} ORDER BY q.source_event_at DESC,q.source_id ASC LIMIT 1`, params)).rows[0];
      return row ? normalized(row) : null;
    });
  }

  async listLatest(scope: TenantContext, instrumentIds: string[], sourceId?: string): Promise<QuoteSnapshot[]> {
    if (instrumentIds.length > 100) throw new AppError(400, 'QUOTE_QUERY_LIMIT', 'At most 100 instruments may be requested.');
    if (!instrumentIds.length) return [];
    return this.db.transaction(scope, async tx => {
      const params: unknown[] = [scope.organizationId, scope.brandId, scope.environmentId, scope.productInstanceId, instrumentIds];
      const source = sourceId ? ' AND q.source_id=$6' : '';
      if (sourceId) params.push(sourceId);
      const rows = (await tx.query<SnapshotRow>(`SELECT ${SNAPSHOT_COLUMNS} FROM market_data_latest_quotes q JOIN market_data_instrument_access a ON a.organization_id=q.organization_id AND a.brand_id=q.brand_id AND a.environment_id=q.environment_id AND a.product_instance_id=q.product_instance_id AND a.instrument_id=q.instrument_id AND a.enabled=true WHERE q.organization_id=$1 AND q.brand_id=$2 AND q.environment_id=$3 AND q.product_instance_id=$4 AND q.instrument_id=ANY($5::uuid[])${source} ORDER BY q.instrument_id,q.source_id`, params)).rows;
      return rows.map(normalized);
    });
  }
}
