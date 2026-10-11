import { describe, expect, it } from 'vitest';
import { adaptCanonicalQuote, type CanonicalQuoteScope } from '../src/server/connectors/pretrade-risk-quote.js';
import type { QuoteSnapshot } from '../src/server/market-data/quotes.js';

const scope: CanonicalQuoteScope = {
  organizationId: 'org-1', brandId: 'brand-1', environmentId: 'env-1', productInstanceId: 'product-1',
};
const quote: QuoteSnapshot = {
  id: 'quote-1', organizationId: 'org-1', brandId: 'brand-1', environmentId: 'env-1', productInstanceId: 'product-1',
  instrumentId: 'instrument-1', sourceId: 'source-1', bid: '1.10000', ask: '1.10002',
  sourceEventAt: '2026-01-01T00:00:00.000Z', receivedAt: '2026-01-01T00:00:00.100Z',
  sourceSequence: '1', eventId: 'event-1', updatedAt: '2026-01-01T00:00:00.100Z', provenance: 'simulated', sourceKind: 'simulated',
};

describe('canonical quote binding for pretrade risk', () => {
  it('maps a tenant-scoped simulated quote without changing decimal strings', () => {
    expect(adaptCanonicalQuote({ scope, quote, instrumentId: 'instrument-1', symbol: 'EURUSD' })).toEqual({
      symbol: 'EURUSD', trusted: true, available: true, bid: '1.10000', ask: '1.10002', observed_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('rejects a quote from another tenant without exposing quote details', () => {
    expect(adaptCanonicalQuote({ scope, quote: { ...quote, organizationId: 'org-2' }, instrumentId: 'instrument-1', symbol: 'EURUSD' })).toMatchObject({ allowed: false, code: 'TRADING_SCOPE_MISMATCH' });
  });

  const malformedCases: Array<{ name: string; quote?: Partial<QuoteSnapshot>; instrumentId?: string }> = [
    { name: 'instrument mismatch', quote: { instrumentId: 'instrument-2' }, instrumentId: 'instrument-1' },
    { name: 'unsupported provenance', quote: { provenance: 'unknown' as never } },
    { name: 'provider provenance mismatch', quote: { provenance: 'verified_provider', sourceKind: 'simulated' } },
    { name: 'event after receipt', quote: { sourceEventAt: '2026-01-01T00:00:01.000Z' } },
  ];
  it.each(malformedCases)('rejects $name before producing an executable quote', override => {
    expect(adaptCanonicalQuote({ scope, quote: { ...quote, ...(override.quote ?? {}) }, instrumentId: override.instrumentId ?? 'instrument-1', symbol: 'EURUSD' })).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
  });

  it('does not mutate the canonical snapshot', () => {
    const input = structuredClone(quote);
    const before = structuredClone(input);
    adaptCanonicalQuote({ scope, quote: input, instrumentId: 'instrument-1', symbol: 'EURUSD' });
    expect(input).toEqual(before);
  });
});
