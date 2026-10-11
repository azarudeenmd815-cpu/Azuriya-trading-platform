/**
 * Pure mark-to-market accounting over caller-supplied, already-authorized
 * snapshots. Database ownership, quote selection, freshness policy, and
 * currency conversion remain explicit integration responsibilities.
 */

export type ValuationKind = 'linear' | 'unsupported';
export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed';
export type QuoteFreshness = 'verified' | 'unverified' | 'stale';

export interface PositionSnapshot {
  positionId: string;
  accountId: string;
  instrumentId: string;
  side: PositionSide;
  remainingQuantity: string;
  entryPrice: string;
  status: PositionStatus;
  profitCurrency: string;
}

export interface InstrumentSnapshot {
  instrumentId: string;
  valuationKind: ValuationKind;
  contractMultiplier: string;
  profitCurrency: string;
}

export interface QuoteSnapshot {
  instrumentId: string;
  bid: string;
  ask: string;
  sourceEventAt: string;
  receivedAt: string;
  freshness: QuoteFreshness;
  sourceId: string;
}

export type PositionValuationReason =
  | 'QUOTE_MISSING' | 'QUOTE_FRESHNESS_UNVERIFIED' | 'QUOTE_STALE'
  | 'INSTRUMENT_VALUATION_UNSUPPORTED' | 'INSTRUMENT_MISMATCH'
  | 'POSITION_CURRENCY_MISMATCH' | 'POSITION_INVALID' | 'QUOTE_INVALID'
  | 'INSTRUMENT_MISSING' | 'INSTRUMENT_INVALID';

export interface ValuedPosition {
  positionId: string;
  accountId: string;
  instrumentId: string;
  status: 'VALUED';
  unrealizedPnl: string;
  currency: string;
  quoteSourceId: string;
  sourceEventAt: string;
  receivedAt: string;
}

export interface ExcludedPosition {
  positionId: string;
  accountId: string;
  instrumentId: string;
  status: 'EXCLUDED';
  unrealizedPnl: null;
  reason: 'POSITION_CLOSED' | 'NO_OPEN_EXPOSURE';
}

export interface UnavailablePosition {
  positionId: string;
  accountId: string;
  instrumentId: string;
  status: 'INCOMPLETE' | 'UNSUPPORTED' | 'INVALID';
  unrealizedPnl: null;
  reason: PositionValuationReason;
}

export type PositionValuation = ValuedPosition | ExcludedPosition | UnavailablePosition;

export interface AccountValuationInput {
  accountId: string;
  accountCurrency: string;
  positions: readonly PositionSnapshot[];
  instruments: readonly InstrumentSnapshot[];
  quotes: readonly QuoteSnapshot[];
}

export type AccountValuationReason =
  | PositionValuationReason | 'ACCOUNT_INVALID' | 'ACCOUNT_MISMATCH'
  | 'INSTRUMENT_MISSING' | 'QUOTE_MISSING' | 'CURRENCY_CONVERSION_REQUIRED'
  | 'DUPLICATE_INSTRUMENT' | 'DUPLICATE_QUOTE' | 'DUPLICATE_POSITION';

export interface ValuedAccount {
  accountId: string;
  accountCurrency: string;
  status: 'VALUED';
  unrealizedPnl: string;
  positionCount: number;
  positionValuations: readonly PositionValuation[];
  quoteSourceEventAt: readonly string[];
  quoteReceivedAt: readonly string[];
}

export interface IncompleteAccount {
  accountId: string;
  accountCurrency: string;
  status: 'INCOMPLETE' | 'UNSUPPORTED' | 'INVALID';
  unrealizedPnl: null;
  positionCount: number;
  positionValuations: readonly PositionValuation[];
  reason: AccountValuationReason;
}

export type AccountValuation = ValuedAccount | IncompleteAccount;

export interface EquityInput {
  accountId: string;
  accountCurrency: string;
  cashBalance: string;
  valuation: AccountValuation;
}

export interface ValuedEquity {
  accountId: string;
  accountCurrency: string;
  status: 'VALUED';
  cashBalance: string;
  unrealizedPnl: string;
  equity: string;
  positionCount: number;
  quoteSourceEventAt: readonly string[];
  quoteReceivedAt: readonly string[];
}

export interface IncompleteEquity {
  accountId: string;
  accountCurrency: string;
  status: 'INCOMPLETE' | 'INVALID';
  cashBalance: string | null;
  unrealizedPnl: null;
  equity: null;
  positionCount: number;
  reason: 'UNREALIZED_PNL_UNAVAILABLE' | 'ACCOUNT_MISMATCH' | 'CASH_INVALID' | 'CURRENCY_MISMATCH' | 'VALUATION_INVALID';
}

export type EquityValuation = ValuedEquity | IncompleteEquity;

interface Decimal {
  coefficient: bigint;
  scale: number;
}

const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const currencyPattern = /^[A-Z]{3}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const MONEY_SCALE = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function factor(scale: number): bigint { return 10n ** BigInt(scale); }

function parseDecimal(value: unknown, allowNegative = true): Decimal | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !decimalPattern.test(value)) return null;
  if (!allowNegative && value.startsWith('-')) return null;
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  let coefficient = BigInt(`${whole}${fraction}`);
  if (negative) coefficient = -coefficient;
  let scale = fraction.length;
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale--; }
  return { coefficient, scale };
}

function parseMoney(value: unknown): Decimal | null {
  const parsed = parseDecimal(value);
  return parsed && parsed.scale <= MONEY_SCALE ? parsed : null;
}

function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return { coefficient: left.coefficient * factor(scale - left.scale) + right.coefficient * factor(scale - right.scale), scale };
}

function subtract(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return { coefficient: left.coefficient * factor(scale - left.scale) - right.coefficient * factor(scale - right.scale), scale };
}

function multiply(left: Decimal, right: Decimal): Decimal {
  return { coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale };
}

function compare(left: Decimal, right: Decimal): number {
  const scale = Math.max(left.scale, right.scale);
  const a = left.coefficient * factor(scale - left.scale);
  const b = right.coefficient * factor(scale - right.scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

function formatDecimal(value: Decimal, scale = MONEY_SCALE): string {
  const negative = value.coefficient < 0n;
  let absolute = negative ? -value.coefficient : value.coefficient;
  if (value.scale > scale) {
    const divisor = factor(value.scale - scale);
    const remainder = absolute % divisor;
    absolute /= divisor;
    if (remainder * 2n >= divisor) absolute++;
  } else if (value.scale < scale) {
    absolute *= factor(scale - value.scale);
  }
  const digits = absolute.toString().padStart(scale + 1, '0');
  const result = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative && absolute !== 0n ? `-${result}` : result;
}

function validCurrency(value: unknown): value is string { return typeof value === 'string' && currencyPattern.test(value); }
function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !timestampPattern.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function timestampKey(value: string): string {
  const [whole, fraction = ''] = value.slice(0, -1).split('.');
  return `${whole}.${fraction.padEnd(9, '0')}`;
}

function validInstrumentSnapshot(value: unknown): value is InstrumentSnapshot {
  if (!isRecord(value) || typeof value.instrumentId !== 'string' || value.instrumentId.length === 0) return false;
  if (value.valuationKind !== 'linear' && value.valuationKind !== 'unsupported') return false;
  if (!validCurrency(value.profitCurrency)) return false;
  const multiplier = parseDecimal(value.contractMultiplier, false);
  return multiplier !== null && multiplier.coefficient > 0n;
}

function validQuoteSnapshot(value: unknown): value is QuoteSnapshot {
  if (!isRecord(value) || typeof value.instrumentId !== 'string' || value.instrumentId.length === 0 || typeof value.sourceId !== 'string' || value.sourceId.length === 0) return false;
  if (value.freshness !== 'verified' && value.freshness !== 'unverified' && value.freshness !== 'stale') return false;
  if (!validTimestamp(value.sourceEventAt) || !validTimestamp(value.receivedAt) || timestampKey(value.sourceEventAt) > timestampKey(value.receivedAt)) return false;
  const bid = parseDecimal(value.bid, false); const ask = parseDecimal(value.ask, false);
  return bid !== null && ask !== null && bid.coefficient > 0n && ask.coefficient > 0n && compare(bid, ask) <= 0;
}

function validPositionSnapshot(value: unknown): value is PositionSnapshot {
  if (!isRecord(value) || typeof value.positionId !== 'string' || value.positionId.length === 0 || typeof value.accountId !== 'string' || value.accountId.length === 0 || typeof value.instrumentId !== 'string' || value.instrumentId.length === 0) return false;
  if (value.side !== 'long' && value.side !== 'short') return false;
  if (value.status !== 'open' && value.status !== 'closed') return false;
  if (!validCurrency(value.profitCurrency)) return false;
  const quantity = parseDecimal(value.remainingQuantity, false); const entry = parseDecimal(value.entryPrice, false);
  return quantity !== null && entry !== null && entry.coefficient > 0n;
}

function validCompletePositionValuation(value: unknown, accountId: string, accountCurrency: string): value is ValuedPosition | ExcludedPosition {
  if (!isRecord(value) || typeof value.positionId !== 'string' || value.positionId.length === 0 || value.accountId !== accountId || typeof value.instrumentId !== 'string' || value.instrumentId.length === 0) return false;
  if (value.status === 'EXCLUDED') return value.unrealizedPnl === null && (value.reason === 'POSITION_CLOSED' || value.reason === 'NO_OPEN_EXPOSURE');
  if (value.status !== 'VALUED' || !validCurrency(value.currency) || value.currency !== accountCurrency || typeof value.quoteSourceId !== 'string' || value.quoteSourceId.length === 0 || !validTimestamp(value.sourceEventAt) || !validTimestamp(value.receivedAt)) return false;
  return timestampKey(value.sourceEventAt) <= timestampKey(value.receivedAt) && parseMoney(value.unrealizedPnl) !== null;
}

/** Validate metadata consistency, not provenance. The caller still authorizes snapshots.
 * Rounded position outputs cannot be summed to validate an aggregate rounded once.
 */
function validCompleteAccountValuation(valuation: ValuedAccount, pnl: Decimal): boolean {
  const { positionValuations, positionCount, quoteSourceEventAt, quoteReceivedAt } = valuation;
  if (!Array.isArray(quoteSourceEventAt) || !Array.isArray(quoteReceivedAt) || quoteSourceEventAt.length !== positionCount || quoteReceivedAt.length !== positionCount) return false;
  const ids = new Set<string>();
  let valuedCount = 0;
  for (const item of positionValuations) {
    if (!validCompletePositionValuation(item, valuation.accountId, valuation.accountCurrency) || ids.has(item.positionId)) return false;
    ids.add(item.positionId);
    if (item.status === 'EXCLUDED') continue;
    if (quoteSourceEventAt[valuedCount] !== item.sourceEventAt || quoteReceivedAt[valuedCount] !== item.receivedAt) return false;
    valuedCount++;
  }
  return valuedCount === positionCount && (positionCount !== 0 || pnl.coefficient === 0n);
}

function basePositionResult(position: PositionSnapshot): Pick<UnavailablePosition, 'positionId' | 'accountId' | 'instrumentId'> {
  return { positionId: position.positionId, accountId: position.accountId, instrumentId: position.instrumentId };
}

export function valuePosition(position: PositionSnapshot, instrument?: InstrumentSnapshot, quote?: QuoteSnapshot): PositionValuation {
  const base = position && typeof position === 'object'
    ? basePositionResult(position)
    : { positionId: '', accountId: '', instrumentId: '' };
  if (!validPositionSnapshot(position)) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  if (position.status === 'closed') return { ...base, status: 'EXCLUDED', unrealizedPnl: null, reason: 'POSITION_CLOSED' };
  const quantity = parseDecimal(position.remainingQuantity, false)!;
  if (quantity.coefficient === 0n) return { ...base, status: 'EXCLUDED', unrealizedPnl: null, reason: 'NO_OPEN_EXPOSURE' };
  if (!instrument) return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'INSTRUMENT_MISSING' };
  if (!validInstrumentSnapshot(instrument)) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'INSTRUMENT_INVALID' };
  if (position.profitCurrency !== instrument.profitCurrency) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_CURRENCY_MISMATCH' };
  if (instrument.instrumentId !== position.instrumentId) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'INSTRUMENT_MISMATCH' };
  if (instrument.valuationKind !== 'linear') return { ...base, status: 'UNSUPPORTED', unrealizedPnl: null, reason: 'INSTRUMENT_VALUATION_UNSUPPORTED' };
  if (!quote) return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'QUOTE_MISSING' };
  if (!validQuoteSnapshot(quote)) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'QUOTE_INVALID' };
  if (quote.instrumentId !== position.instrumentId) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'QUOTE_INVALID' };
  if (quote.freshness !== 'verified' && quote.freshness !== 'stale') return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'QUOTE_FRESHNESS_UNVERIFIED' };
  if (quote.freshness === 'stale') return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'QUOTE_STALE' };
  const pnl = unroundedPositionPnl(position, instrument, quote);
  return { ...base, status: 'VALUED', unrealizedPnl: formatDecimal(pnl), currency: instrument.profitCurrency, quoteSourceId: quote.sourceId, sourceEventAt: quote.sourceEventAt, receivedAt: quote.receivedAt };
}

function unroundedPositionPnl(position: PositionSnapshot, instrument: InstrumentSnapshot, quote: QuoteSnapshot): Decimal {
  const quantity = parseDecimal(position.remainingQuantity, false)!;
  const entry = parseDecimal(position.entryPrice, false)!;
  const multiplier = parseDecimal(instrument.contractMultiplier, false)!;
  const bid = parseDecimal(quote.bid, false)!;
  const ask = parseDecimal(quote.ask, false)!;
  const difference = position.side === 'long' ? subtract(bid, entry) : subtract(entry, ask);
  return multiply(multiply(difference, quantity), multiplier);
}

export function valueAccount(input: AccountValuationInput): AccountValuation {
  if (!input || typeof input.accountId !== 'string' || input.accountId.length === 0 || !validCurrency(input.accountCurrency) || !Array.isArray(input.positions) || !Array.isArray(input.instruments) || !Array.isArray(input.quotes)) return { accountId: input?.accountId ?? '', accountCurrency: input?.accountCurrency ?? '', status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'ACCOUNT_INVALID' };
  const instruments = new Map<string, InstrumentSnapshot>();
  for (const instrument of input.instruments) {
    if (!validInstrumentSnapshot(instrument)) {
      return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'ACCOUNT_INVALID' };
    }
    if (instruments.has(instrument.instrumentId)) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'DUPLICATE_INSTRUMENT' };
    instruments.set(instrument.instrumentId, instrument);
  }
  const quotes = new Map<string, QuoteSnapshot>();
  for (const quote of input.quotes) {
    if (!validQuoteSnapshot(quote)) {
      return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'ACCOUNT_INVALID' };
    }
    if (quotes.has(quote.instrumentId)) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'DUPLICATE_QUOTE' };
    quotes.set(quote.instrumentId, quote);
  }
  const preflightPositionIds = new Set<string>();
  for (const position of input.positions) {
    if (!validPositionSnapshot(position)) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'ACCOUNT_INVALID' };
    if (preflightPositionIds.has(position.positionId)) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'DUPLICATE_POSITION' };
    preflightPositionIds.add(position.positionId);
    if (position.accountId !== input.accountId) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'ACCOUNT_MISMATCH' };
  }
  const valuations: PositionValuation[] = [];
  let total: Decimal = { coefficient: 0n, scale: 0 };
  const ordered = [...input.positions].sort((a, b) => {
    return a.positionId < b.positionId ? -1 : a.positionId > b.positionId ? 1 : 0;
  });
  for (const position of ordered) {
    const instrument = instruments.get(position.instrumentId);
    const valuation = valuePosition(position, instrument, quotes.get(position.instrumentId));
    valuations.push(valuation);
    if (valuation.status === 'EXCLUDED') continue;
    if (valuation.status !== 'VALUED') {
      const status = valuation.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : valuation.status;
      return { accountId: input.accountId, accountCurrency: input.accountCurrency, status, unrealizedPnl: null, positionCount: valuations.length, positionValuations: valuations, reason: valuation.reason };
    }
    if (valuation.currency !== input.accountCurrency) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INCOMPLETE', unrealizedPnl: null, positionCount: valuations.length, positionValuations: valuations, reason: 'CURRENCY_CONVERSION_REQUIRED' };
    total = add(total, unroundedPositionPnl(position, instrument!, quotes.get(position.instrumentId)!));
  }
  const valued = valuations.filter((item): item is ValuedPosition => item.status === 'VALUED');
  return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'VALUED', unrealizedPnl: formatDecimal(total), positionCount: valued.length, positionValuations: valuations, quoteSourceEventAt: valued.map(item => item.sourceEventAt), quoteReceivedAt: valued.map(item => item.receivedAt) };
}

export function composeEquity(input: EquityInput): EquityValuation {
  const base = { accountId: input?.accountId ?? '', accountCurrency: input?.accountCurrency ?? '' };
  const valuation = input && typeof input === 'object' ? input.valuation : undefined;
  const cash = parseMoney(input?.cashBalance ?? null);
  if (typeof input?.accountId !== 'string' || input.accountId.length === 0 || !validCurrency(input?.accountCurrency)) return { ...base, status: 'INVALID', cashBalance: null, unrealizedPnl: null, equity: null, positionCount: 0, reason: 'CURRENCY_MISMATCH' };
  if (!cash) return { ...base, status: 'INCOMPLETE', cashBalance: null, unrealizedPnl: null, equity: null, positionCount: 0, reason: 'CASH_INVALID' };
  if (!isRecord(valuation) || valuation.accountId !== input.accountId || valuation.accountCurrency !== input.accountCurrency) return { ...base, status: 'INVALID', cashBalance: formatDecimal(cash), unrealizedPnl: null, equity: null, positionCount: 0, reason: 'ACCOUNT_MISMATCH' };
  const positionCount = valuation.positionCount;
  const positionValuations = valuation.positionValuations;
  if (typeof positionCount !== 'number' || !Number.isSafeInteger(positionCount) || positionCount < 0 || !Array.isArray(positionValuations)) return { ...base, status: 'INCOMPLETE', cashBalance: formatDecimal(cash), unrealizedPnl: null, equity: null, positionCount: 0, reason: 'VALUATION_INVALID' };
  if (valuation.status !== 'VALUED') return { ...base, status: 'INCOMPLETE', cashBalance: formatDecimal(cash), unrealizedPnl: null, equity: null, positionCount, reason: 'UNREALIZED_PNL_UNAVAILABLE' };
  const pnl = parseMoney(valuation.unrealizedPnl);
  if (!pnl || !validCompleteAccountValuation(valuation, pnl)) return { ...base, status: 'INCOMPLETE', cashBalance: formatDecimal(cash), unrealizedPnl: null, equity: null, positionCount, reason: 'VALUATION_INVALID' };
  return { ...base, status: 'VALUED', cashBalance: formatDecimal(cash), unrealizedPnl: formatDecimal(pnl), equity: formatDecimal(add(cash, pnl)), positionCount, quoteSourceEventAt: [...valuation.quoteSourceEventAt], quoteReceivedAt: [...valuation.quoteReceivedAt] };
}
