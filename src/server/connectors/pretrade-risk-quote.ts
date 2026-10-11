import type { QuoteSnapshot } from '../market-data/quotes.js';
import type { PretradeQuote, PretradeRejectedDecision } from './pretrade-risk.js';

/** The four identifiers that bind a market-data snapshot to an authorized tenant. */
export interface CanonicalQuoteScope {
  organizationId: string;
  brandId: string;
  environmentId: string;
  productInstanceId: string;
}

export interface CanonicalQuoteBinding {
  scope: CanonicalQuoteScope;
  quote: QuoteSnapshot | null;
  instrumentId: string;
  symbol: string;
}

function reject(code: 'TRADING_SCOPE_MISMATCH' | 'TRADING_QUOTE_INVALID', message: string): PretradeRejectedDecision {
  return { allowed: false, code, message };
}

function canonicalTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString().slice(0, 10) === value.slice(0, 10);
}

function scopeMatches(scope: CanonicalQuoteScope, quote: QuoteSnapshot): boolean {
  return !!scope && typeof scope === 'object'
    && typeof scope.organizationId === 'string' && scope.organizationId.length > 0
    && typeof scope.brandId === 'string' && scope.brandId.length > 0
    && typeof scope.environmentId === 'string' && scope.environmentId.length > 0
    && typeof scope.productInstanceId === 'string' && scope.productInstanceId.length > 0
    && quote.organizationId === scope.organizationId
    && quote.brandId === scope.brandId
    && quote.environmentId === scope.environmentId
    && quote.productInstanceId === scope.productInstanceId;
}

/**
 * Binds the already-normalized W06 quote snapshot to the smaller W07 risk DTO.
 * Callers must obtain the snapshot through the scoped market-data service in the
 * same consistency boundary as the eventual execution. No quote is trusted from
 * an unbound object or from an unapproved provenance/source-kind combination.
 */
export function adaptCanonicalQuote(input: CanonicalQuoteBinding): PretradeQuote | PretradeRejectedDecision {
  if (!input || !input.quote) return reject('TRADING_QUOTE_INVALID', 'A canonical executable quote is unavailable.');
  const { quote } = input;
  if (!scopeMatches(input.scope, quote)) return reject('TRADING_SCOPE_MISMATCH', 'This market-data quote is unavailable in the authorized workspace.');
  if (typeof input.instrumentId !== 'string' || input.instrumentId.length === 0 || quote.instrumentId !== input.instrumentId) return reject('TRADING_QUOTE_INVALID', 'The market-data quote does not belong to the requested instrument.');
  if (typeof input.symbol !== 'string' || input.symbol.length === 0) return reject('TRADING_QUOTE_INVALID', 'The executable instrument identity is unavailable.');
  if (!['simulated', 'verified_provider'].includes(quote.provenance) || (quote.provenance === 'simulated' && quote.sourceKind !== 'simulated') || (quote.provenance === 'verified_provider' && quote.sourceKind !== 'provider')) return reject('TRADING_QUOTE_INVALID', 'The market-data quote provenance cannot be verified.');
  if (!canonicalTimestamp(quote.sourceEventAt) || !canonicalTimestamp(quote.receivedAt) || Date.parse(quote.sourceEventAt) > Date.parse(quote.receivedAt)) return reject('TRADING_QUOTE_INVALID', 'The market-data quote timestamps are invalid.');
  if (typeof quote.bid !== 'string' || typeof quote.ask !== 'string') return reject('TRADING_QUOTE_INVALID', 'The market-data quote prices are unavailable.');
  return { symbol: input.symbol, trusted: true, available: true, bid: quote.bid, ask: quote.ask, observed_at: quote.sourceEventAt };
}
