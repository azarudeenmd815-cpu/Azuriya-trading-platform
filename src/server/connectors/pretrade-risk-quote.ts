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

function canonicalTimestampKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]); const month = Number(parts[2]); const day = Number(parts[3]);
  const hour = Number(parts[4]); const minute = Number(parts[5]); const second = Number(parts[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (year <= 0 || month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) return null;
  const fraction = parts[7] ?? '';
  return `${parts[1]}${parts[2]}${parts[3]}${parts[4]}${parts[5]}${parts[6]}${fraction.padEnd(9, '0')}`;
}

interface QuoteDecimal {
  units: bigint;
  scale: number;
}

const quoteDecimalPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Parse quote prices without converting them through JavaScript Number. */
function parseQuoteDecimal(value: unknown): QuoteDecimal | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !quoteDecimalPattern.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function compareQuoteDecimals(left: QuoteDecimal, right: QuoteDecimal): number {
  const scale = Math.max(left.scale, right.scale);
  const leftUnits = left.units * 10n ** BigInt(scale - left.scale);
  const rightUnits = right.units * 10n ** BigInt(scale - right.scale);
  return leftUnits < rightUnits ? -1 : leftUnits > rightUnits ? 1 : 0;
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
  if (typeof input.symbol !== 'string' || input.symbol.trim().length === 0) return reject('TRADING_QUOTE_INVALID', 'The executable instrument identity is unavailable.');
  if (!['simulated', 'verified_provider'].includes(quote.provenance) || (quote.provenance === 'simulated' && quote.sourceKind !== 'simulated') || (quote.provenance === 'verified_provider' && quote.sourceKind !== 'provider')) return reject('TRADING_QUOTE_INVALID', 'The market-data quote provenance cannot be verified.');
  const sourceEventKey = canonicalTimestampKey(quote.sourceEventAt);
  const receivedKey = canonicalTimestampKey(quote.receivedAt);
  if (!sourceEventKey || !receivedKey || sourceEventKey > receivedKey) return reject('TRADING_QUOTE_INVALID', 'The market-data quote timestamps are invalid.');
  const bid = parseQuoteDecimal(quote.bid);
  const ask = parseQuoteDecimal(quote.ask);
  if (!bid || !ask || bid.units <= 0n || ask.units <= 0n || compareQuoteDecimals(bid, ask) > 0) return reject('TRADING_QUOTE_INVALID', 'The market-data quote prices are invalid.');
  return { symbol: input.symbol, trusted: true, available: true, bid: quote.bid, ask: quote.ask, observed_at: quote.sourceEventAt };
}
