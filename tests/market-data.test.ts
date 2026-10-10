import { describe, expect, it } from 'vitest';
import { AppError } from '../src/server/domain/errors.js';
import { canonicalDecimal, normalizeQuote } from '../src/server/market-data/quotes.js';

const instrument = { id: '00000000-0000-0000-0000-000000000001', symbol: 'EURUSD', price_scale: 5, tick_size: '0.00001', zero_spread_allowed: true, active: true };
const source = { id: '00000000-0000-0000-0000-000000000002', source_kind: 'simulated' as const, provenance: 'simulated' as const, active: true };
const eventTime = new Date(Date.now() - 60_000).toISOString();
const receiveTime = new Date(Date.now() - 30_000).toISOString();
const base = { instrumentId: instrument.id, sourceId: source.id, bid: '1.10000', ask: '1.10002', sourceEventAt: eventTime, receivedAt: receiveTime, eventId: 'evt-1' };

describe('market-data quote normalization', () => {
  it('canonicalizes exact decimal strings without binary arithmetic', () => {
    expect(canonicalDecimal('1.23000', 'bid')).toBe('1.23');
    expect(normalizeQuote(base, instrument, source)).toMatchObject({ bid: '1.1', ask: '1.10002', provenance: 'simulated' });
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
    expect(() => normalizeQuote({ ...base, ...change } as never, instrument, source)).toThrow(AppError);
  });

  it('rejects zero spread when the instrument policy disallows it', () => {
    expect(() => normalizeQuote({ ...base, ask: base.bid }, { ...instrument, zero_spread_allowed: false }, source)).toThrow('Zero-spread');
  });

  it('rejects inactive instruments and sources', () => {
    expect(() => normalizeQuote(base, { ...instrument, active: false }, source)).toThrow('instrument');
    expect(() => normalizeQuote(base, instrument, { ...source, active: false })).toThrow('source');
  });
});
