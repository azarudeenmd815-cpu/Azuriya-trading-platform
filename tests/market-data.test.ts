import { describe, expect, it } from 'vitest';
import { AppError } from '../src/server/domain/errors.js';
import { canonicalDecimal, normalizeQuote as normalizeServerQuote } from '../src/server/market-data/quotes.js';
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
