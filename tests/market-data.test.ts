import { describe, expect, it } from 'vitest';
import { applyQuote, filterInstruments, formatPrice, isNewerQuote, normalizeQuote, quoteState, uniqueInstruments, type Instrument, type Quote } from '../src/client/trading/marketData';

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
    expect(normalizeQuote({ instrument_id: 'eur-usd', bid: '0.00000000', ask: '1.230000' })).toEqual({ instrumentId: 'eur-usd', bid: '0.00000000', ask: '1.230000', sequence: null, timestamp: null });
    expect(normalizeQuote({ instrument_id: 'eur-usd', bid: 0 })).toBeNull();
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
