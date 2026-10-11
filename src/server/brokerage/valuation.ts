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
  | 'INSTRUMENT_MISSING';

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
  reason: 'UNREALIZED_PNL_UNAVAILABLE' | 'ACCOUNT_MISMATCH' | 'CASH_INVALID' | 'CURRENCY_MISMATCH';
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

function basePositionResult(position: PositionSnapshot): Pick<UnavailablePosition, 'positionId' | 'accountId' | 'instrumentId'> {
  return { positionId: position.positionId, accountId: position.accountId, instrumentId: position.instrumentId };
}

export function valuePosition(position: PositionSnapshot, instrument?: InstrumentSnapshot, quote?: QuoteSnapshot): PositionValuation {
  const base = position && typeof position === 'object'
    ? basePositionResult(position)
    : { positionId: '', accountId: '', instrumentId: '' };
  if (!position || typeof position !== 'object') return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  if (!position || ![position.positionId, position.accountId, position.instrumentId].every(value => typeof value === 'string' && value.length > 0)) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  if (position.status !== 'open' && position.status !== 'closed') return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  if (position.status === 'closed') return { ...base, status: 'EXCLUDED', unrealizedPnl: null, reason: 'POSITION_CLOSED' };
  const quantity = parseDecimal(position.remainingQuantity, false);
  if (!quantity) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  if (quantity.coefficient < 0n) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  if (quantity.coefficient === 0n) return { ...base, status: 'EXCLUDED', unrealizedPnl: null, reason: 'NO_OPEN_EXPOSURE' };
  if (position.status !== 'open') return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  if (!instrument) return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'INSTRUMENT_MISSING' };
  if (instrument.valuationKind === 'unsupported') return { ...base, status: 'UNSUPPORTED', unrealizedPnl: null, reason: 'INSTRUMENT_VALUATION_UNSUPPORTED' };
  const entry = parseDecimal(position.entryPrice, false);
  const multiplier = parseDecimal(instrument.contractMultiplier, false);
  if (!entry || entry.coefficient <= 0n || !multiplier || multiplier.coefficient <= 0n || !validCurrency(position.profitCurrency) || !validCurrency(instrument.profitCurrency) || !['long', 'short'].includes(position.side)) {
    return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_INVALID' };
  }
  if (position.profitCurrency !== instrument.profitCurrency) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'POSITION_CURRENCY_MISMATCH' };
  if (instrument.instrumentId !== position.instrumentId) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'INSTRUMENT_MISMATCH' };
  if (instrument.valuationKind !== 'linear') return { ...base, status: 'UNSUPPORTED', unrealizedPnl: null, reason: 'INSTRUMENT_VALUATION_UNSUPPORTED' };
  if (!quote) return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'QUOTE_MISSING' };
  if (quote.instrumentId !== position.instrumentId) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'QUOTE_INVALID' };
  if (quote.freshness !== 'verified' && quote.freshness !== 'stale') return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'QUOTE_FRESHNESS_UNVERIFIED' };
  if (quote.freshness === 'stale') return { ...base, status: 'INCOMPLETE', unrealizedPnl: null, reason: 'QUOTE_STALE' };
  if (!quote.sourceId || !validTimestamp(quote.sourceEventAt) || !validTimestamp(quote.receivedAt) || Date.parse(quote.sourceEventAt) > Date.parse(quote.receivedAt)) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'QUOTE_INVALID' };
  const bid = parseDecimal(quote.bid, false); const ask = parseDecimal(quote.ask, false);
  if (!bid || !ask || bid.coefficient <= 0n || ask.coefficient <= 0n || compare(bid, ask) > 0) return { ...base, status: 'INVALID', unrealizedPnl: null, reason: 'QUOTE_INVALID' };
  const difference = position.side === 'long' ? subtract(bid, entry) : subtract(entry, ask);
  const pnl = multiply(multiply(difference, quantity), multiplier);
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
    if (!instrument || typeof instrument !== 'object' || typeof instrument.instrumentId !== 'string' || instrument.instrumentId.length === 0) {
      return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'ACCOUNT_INVALID' };
    }
    if (instruments.has(instrument.instrumentId)) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'DUPLICATE_INSTRUMENT' };
    instruments.set(instrument.instrumentId, instrument);
  }
  const quotes = new Map<string, QuoteSnapshot>();
  for (const quote of input.quotes) {
    if (!quote || typeof quote !== 'object' || typeof quote.instrumentId !== 'string' || quote.instrumentId.length === 0) {
      return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'ACCOUNT_INVALID' };
    }
    if (quotes.has(quote.instrumentId)) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: [], reason: 'DUPLICATE_QUOTE' };
    quotes.set(quote.instrumentId, quote);
  }
  const valuations: PositionValuation[] = [];
  const positionIds = new Set<string>();
  let total: Decimal = { coefficient: 0n, scale: 0 };
  const ordered = [...input.positions].sort((a, b) => String((a as Partial<PositionSnapshot> | null)?.positionId ?? '').localeCompare(String((b as Partial<PositionSnapshot> | null)?.positionId ?? '')));
  for (const position of ordered) {
    const candidate = position as Partial<PositionSnapshot> | null;
    if (!candidate || typeof candidate !== 'object' || typeof candidate.positionId !== 'string' || candidate.positionId.length === 0) {
      return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: valuations.length, positionValuations: valuations, reason: 'ACCOUNT_INVALID' };
    }
    if (positionIds.has(candidate.positionId)) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: valuations.length, positionValuations: valuations, reason: 'DUPLICATE_POSITION' };
    positionIds.add(candidate.positionId);
    if (candidate.accountId !== input.accountId) return { accountId: input.accountId, accountCurrency: input.accountCurrency, status: 'INVALID', unrealizedPnl: null, positionCount: 0, positionValuations: valuations, reason: 'ACCOUNT_MISMATCH' };
    const instrument = instruments.get(candidate.instrumentId as string);
    const valuation = valuePosition(candidate as PositionSnapshot, instrument, quotes.get(candidate.instrumentId as string));
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
  if (typeof input?.accountId !== 'string' || !validCurrency(input?.accountCurrency)) return { ...base, status: 'INVALID', cashBalance: null, unrealizedPnl: null, equity: null, positionCount: 0, reason: 'CURRENCY_MISMATCH' };
  if (!cash) return { ...base, status: 'INCOMPLETE', cashBalance: null, unrealizedPnl: null, equity: null, positionCount: 0, reason: 'CASH_INVALID' };
  if (!valuation || valuation.accountId !== input.accountId || valuation.accountCurrency !== input.accountCurrency) return { ...base, status: 'INVALID', cashBalance: formatDecimal(cash), unrealizedPnl: null, equity: null, positionCount: 0, reason: 'ACCOUNT_MISMATCH' };
  if (valuation.status !== 'VALUED') return { ...base, status: 'INCOMPLETE', cashBalance: formatDecimal(cash), unrealizedPnl: null, equity: null, positionCount: valuation.positionCount, reason: 'UNREALIZED_PNL_UNAVAILABLE' };
  const pnl = parseDecimal(valuation.unrealizedPnl);
  if (!pnl || valuation.accountCurrency !== input.accountCurrency) return { ...base, status: 'INCOMPLETE', cashBalance: formatDecimal(cash), unrealizedPnl: null, equity: null, positionCount: valuation.positionCount, reason: 'CURRENCY_MISMATCH' };
  return { ...base, status: 'VALUED', cashBalance: formatDecimal(cash), unrealizedPnl: formatDecimal(pnl), equity: formatDecimal(add(cash, pnl)), positionCount: valuation.positionCount, quoteSourceEventAt: valuation.quoteSourceEventAt, quoteReceivedAt: valuation.quoteReceivedAt };
}
