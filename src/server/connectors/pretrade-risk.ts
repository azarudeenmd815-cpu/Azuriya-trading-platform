import { AppError } from '../domain/errors.js';
import type { AccountSnapshot, Decimal, TradingAccount, TradingOrder, TradingPosition, TradingSymbol } from '../domain/trading-provider.js';

export type PretradeRiskCode =
  | 'ACCOUNT_NOT_FOUND' | 'TRADING_SCOPE_MISMATCH' | 'TRADING_ACCOUNT_INELIGIBLE'
  | 'TRADING_INSTRUMENT_UNAVAILABLE' | 'TRADING_ORDER_INVALID' | 'TRADING_QUOTE_INVALID'
  | 'TRADING_INSUFFICIENT_MARGIN' | 'TRADING_RISK_INFORMATION_MISSING';
export type PretradeOrderType = Extract<TradingOrder['type'], 'market' | 'limit' | 'stop' | 'stop_limit'>;
export type ExposureClassification = 'increase' | 'reduce' | 'close';

export interface PretradeAccountState {
  scopeMatches: boolean;
  accountOwned: boolean;
  account: TradingAccount | null;
  snapshot: AccountSnapshot | null;
  tradingEnabled?: boolean;
  restricted?: boolean;
  positions?: readonly TradingPosition[];
}
export interface PretradeInstrument extends TradingSymbol { enabled: boolean; restricted?: boolean }
export interface PretradeQuote { symbol: string; trusted: boolean; available: boolean; bid: Decimal; ask: Decimal; observed_at?: string }
export interface PretradeOrder {
  symbol: string; side: 'buy' | 'sell'; type: PretradeOrderType; volume: Decimal; price?: Decimal;
  execution_price?: Decimal; exposure: ExposureClassification; stage: 'submit' | 'execute';
}
export interface PretradeFreshnessPolicy { maxAgeMs: number; nowMs: number }
export interface PretradeRiskInput {
  account: PretradeAccountState; instrument: PretradeInstrument | null; order: PretradeOrder;
  quote?: PretradeQuote; freshness?: PretradeFreshnessPolicy;
}
export interface PretradeAllowedDecision { allowed: true; deferred: boolean; required_margin?: Decimal }
export interface PretradeRejectedDecision { allowed: false; code: PretradeRiskCode; message: string }
export type PretradeDecision = PretradeAllowedDecision | PretradeRejectedDecision;

interface ExactDecimal { coefficient: bigint; scale: number }
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const currencyPattern = /^[A-Z]{3}$/;
function reject(code: PretradeRiskCode, message: string): PretradeRejectedDecision { return { allowed: false, code, message } }
function factor(scale: number): bigint { return 10n ** BigInt(scale) }
function parseDecimal(value: unknown, allowNegative = false): ExactDecimal | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !decimalPattern.test(value)) return null;
  if (!allowNegative && value.startsWith('-')) return null;
  const negative = value.startsWith('-'); const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.'); let coefficient = BigInt(`${whole}${fraction}`);
  if (negative) coefficient = -coefficient;
  let scale = fraction.length;
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale-- }
  return { coefficient, scale };
}
function compare(a: ExactDecimal, b: ExactDecimal): number {
  const scale = Math.max(a.scale, b.scale); const left = a.coefficient * factor(scale - a.scale); const right = b.coefficient * factor(scale - b.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
function subtract(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const scale = Math.max(a.scale, b.scale); return { coefficient: a.coefficient * factor(scale - a.scale) - b.coefficient * factor(scale - b.scale), scale };
}
function multiply(a: ExactDecimal, b: ExactDecimal): ExactDecimal { return { coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale } }
function multiple(value: ExactDecimal, step: ExactDecimal): boolean {
  if (step.coefficient <= 0n) return false; const scale = Math.max(value.scale, step.scale);
  return (value.coefficient * factor(scale - value.scale)) % (step.coefficient * factor(scale - step.scale)) === 0n;
}
function decimalString(value: ExactDecimal): Decimal {
  const negative = value.coefficient < 0n; const absolute = negative ? -value.coefficient : value.coefficient;
  if (value.scale === 0) return `${negative ? '-' : ''}${absolute}`;
  const digits = absolute.toString().padStart(value.scale + 1, '0'); return `${negative ? '-' : ''}${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`;
}
function exactQuotient(numerator: bigint, denominator: bigint): Decimal | undefined {
  if (denominator <= 0n) return undefined; const negative = numerator < 0n; let n = negative ? -numerator : numerator; let d = denominator; let twos = 0; let fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++ } while (d % 5n === 0n) { d /= 5n; fives++ } if (d !== 1n) return undefined;
  const scale = Math.max(twos, fives); n *= 2n ** BigInt(scale - twos); n *= 5n ** BigInt(scale - fives); return decimalString({ coefficient: negative ? -n : n, scale });
}

function validCurrency(value: unknown): value is string { return typeof value === 'string' && currencyPattern.test(value); }
const timestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = timestampPattern.exec(value); if (!parts) return false;
  const year = Number(parts[1]); const month = Number(parts[2]); const day = Number(parts[3]);
  const hour = Number(parts[4]); const minute = Number(parts[5]); const second = Number(parts[6]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  const zone = parts[7]; const zoneHour = zone === 'Z' ? 0 : Number(zone.slice(1, 3)); const zoneMinute = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth && hour <= 23 && minute <= 59 && second <= 59 && zoneHour <= 23 && zoneMinute <= 59 && Number.isFinite(Date.parse(value));
}
function validBoolean(value: unknown): value is boolean { return typeof value === 'boolean'; }

function accountFailure(input: PretradeRiskInput): PretradeRejectedDecision | null {
  const { account } = input.account;
  if (input.account.scopeMatches !== true || input.account.accountOwned !== true) return reject('TRADING_SCOPE_MISMATCH', 'This trading account is unavailable in the authorized workspace.');
  if (!account) return reject('ACCOUNT_NOT_FOUND', 'The trading account does not exist in this scope.');
  if (typeof account.provider_account_id !== 'string' || account.provider_account_id.length === 0 || !validCurrency(account.currency) || !['enabled', 'disabled'].includes(account.status)) return reject('TRADING_RISK_INFORMATION_MISSING', 'Authoritative trading account identity is unavailable.');
  if (input.account.tradingEnabled !== undefined && !validBoolean(input.account.tradingEnabled)) return reject('TRADING_RISK_INFORMATION_MISSING', 'Authoritative account trading status is unavailable.');
  if (input.account.restricted !== undefined && !validBoolean(input.account.restricted)) return reject('TRADING_RISK_INFORMATION_MISSING', 'Authoritative account restriction status is unavailable.');
  if (input.order.exposure === 'increase' && (account.status !== 'enabled' || input.account.tradingEnabled === false || input.account.restricted === true)) return reject('TRADING_ACCOUNT_INELIGIBLE', 'This trading account is not eligible for new exposure.');
  const snapshot = input.account.snapshot;
  if (!snapshot || typeof snapshot.provider_account_id !== 'string' || snapshot.provider_account_id.length === 0 || snapshot.provider_account_id !== account.provider_account_id || !validCurrency(snapshot.currency) || snapshot.currency !== account.currency || !validTimestamp(snapshot.observed_at) || ![snapshot.balance, snapshot.equity, snapshot.margin, snapshot.free_margin].every(value => parseDecimal(value, true))) return reject('TRADING_RISK_INFORMATION_MISSING', 'Authoritative account and margin information is unavailable.');
  if (input.order.exposure === 'increase' && (account.leverage === undefined || !Number.isSafeInteger(account.leverage) || account.leverage <= 0)) return reject('TRADING_RISK_INFORMATION_MISSING', 'Authoritative account leverage and margin information is unavailable.');
  return null;
}
function quoteFailure(input: PretradeRiskInput): PretradeRejectedDecision | null {
  const { quote, order, freshness, instrument } = input;
  if (!quote || quote.trusted !== true || quote.available !== true || quote.symbol !== order.symbol) return reject('TRADING_QUOTE_INVALID', 'A trusted executable quote is unavailable for this instrument.');
  const bid = parseDecimal(quote.bid); const ask = parseDecimal(quote.ask);
  if (!bid || !ask || bid.coefficient <= 0n || ask.coefficient <= 0n || compare(bid, ask) > 0) return reject('TRADING_QUOTE_INVALID', 'The executable quote is invalid.');
  const tick = parseDecimal(instrument?.tick_size);
  if (!instrument || !Number.isSafeInteger(instrument.digits) || instrument.digits < 0 || !tick || tick.coefficient <= 0n || bid.scale > instrument.digits || ask.scale > instrument.digits || !multiple(bid, tick) || !multiple(ask, tick)) return reject('TRADING_QUOTE_INVALID', 'The executable quote does not satisfy the instrument precision or tick policy.');
  if (freshness && quote.observed_at === undefined) return reject('TRADING_QUOTE_INVALID', 'The executable quote timestamp is required for freshness validation.');
  if (quote.observed_at !== undefined) {
    if (!validTimestamp(quote.observed_at)) return reject('TRADING_QUOTE_INVALID', 'The executable quote timestamp is invalid.');
    const observed = Date.parse(quote.observed_at);
    if (freshness && (!Number.isFinite(freshness.maxAgeMs) || freshness.maxAgeMs < 0 || !Number.isFinite(freshness.nowMs) || observed > freshness.nowMs || freshness.nowMs - observed > freshness.maxAgeMs)) return reject('TRADING_QUOTE_INVALID', 'The executable quote is stale or its freshness information is invalid.');
  }
  return null;
}
function orderFailure(order: PretradeOrder, instrument: PretradeInstrument): PretradeRejectedDecision | null {
  if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type) || !['buy', 'sell'].includes(order.side) || !['submit', 'execute'].includes(order.stage) || !['increase', 'reduce', 'close'].includes(order.exposure) || order.symbol !== instrument.symbol) return reject('TRADING_ORDER_INVALID', 'The order parameters are unsupported or do not match the instrument.');
  const volume = parseDecimal(order.volume); const minimum = parseDecimal(instrument.minimum_volume); const maximum = parseDecimal(instrument.maximum_volume); const step = parseDecimal(instrument.volume_step);
  if (!volume || volume.coefficient <= 0n || !minimum || !maximum || !step || minimum.coefficient < 0n || maximum.coefficient <= 0n || compare(minimum, maximum) > 0 || compare(volume, minimum) < 0 || compare(volume, maximum) > 0 || !multiple(subtract(volume, minimum), step)) return reject('TRADING_ORDER_INVALID', 'The order volume is outside the instrument limits or is not step-aligned.');
  const pending = order.type !== 'market';
  if (pending && !order.price) return reject('TRADING_ORDER_INVALID', 'A pending order requires an exact trigger or limit price.');
  if (!pending && order.price !== undefined) return reject('TRADING_ORDER_INVALID', 'A market order cannot provide a client-selected execution price.');
  for (const value of [order.price, order.execution_price]) if (value !== undefined) { const parsed = parseDecimal(value); const tick = parseDecimal(instrument.tick_size); if (!parsed || parsed.coefficient <= 0n || !tick || tick.coefficient <= 0n || !Number.isSafeInteger(instrument.digits) || instrument.digits < 0 || parsed.scale > instrument.digits || !multiple(parsed, tick)) return reject('TRADING_ORDER_INVALID', 'The order price has unsupported precision or tick alignment.') }
  return null;
}

/** Pure fail-closed decision. Load and lock all inputs in the caller's scoped execution transaction. */
export function evaluatePretradeRisk(input: PretradeRiskInput): PretradeDecision {
  if (!input || !input.account || !input.order) return reject('TRADING_RISK_INFORMATION_MISSING', 'Required account and order risk information is unavailable.');
  const failure = accountFailure(input); if (failure) return failure;
  if (!input.instrument || input.instrument.enabled !== true || input.instrument.restricted === true) return reject('TRADING_INSTRUMENT_UNAVAILABLE', 'This instrument is unavailable for execution.');
  if (input.instrument.restricted !== undefined && !validBoolean(input.instrument.restricted)) return reject('TRADING_RISK_INFORMATION_MISSING', 'Authoritative instrument restriction status is unavailable.');
  const invalidOrder = orderFailure(input.order, input.instrument); if (invalidOrder) return invalidOrder;
  if (input.order.stage === 'submit' && input.order.type !== 'market') return { allowed: true, deferred: true };
  const invalidQuote = quoteFailure(input); if (invalidQuote) return invalidQuote;
  const quote = input.quote!; const quotePrice = parseDecimal(input.order.side === 'buy' ? quote.ask : quote.bid)!;
  // Client trigger/limit prices are order intent. Margin uses the server quote,
  // or an explicit server-selected execution price supplied by the fill stage.
  const executionPrice = input.order.execution_price ? parseDecimal(input.order.execution_price)! : quotePrice;
  if (input.order.exposure !== 'increase') return { allowed: true, deferred: false };
  if (!validCurrency(input.instrument.quote_currency) || input.account.account!.currency !== input.instrument.quote_currency) return reject('TRADING_RISK_INFORMATION_MISSING', 'A canonical currency conversion is required before opening this exposure.');
  const snapshot = input.account.snapshot!; const available = parseDecimal(snapshot.free_margin, true); const contractSize = parseDecimal(input.instrument.contract_size); const volume = parseDecimal(input.order.volume);
  if (!available || !contractSize || !volume || contractSize.coefficient <= 0n) return reject('TRADING_RISK_INFORMATION_MISSING', 'Authoritative available margin or contract size is unavailable.');
  if (available.coefficient < 0n) return reject('TRADING_INSUFFICIENT_MARGIN', 'Available margin does not permit additional exposure.');
  const notional = multiply(multiply(volume, contractSize), executionPrice); const leverage = BigInt(input.account.account!.leverage!);
  if (notional.coefficient * factor(available.scale) > available.coefficient * factor(notional.scale) * leverage) return reject('TRADING_INSUFFICIENT_MARGIN', 'The order exceeds the account available margin.');
  const requiredMargin = exactQuotient(notional.coefficient, factor(notional.scale) * leverage);
  return { allowed: true, deferred: false, ...(requiredMargin ? { required_margin: requiredMargin } : {}) };
}
export function assertPretradeAllowed(input: PretradeRiskInput): PretradeAllowedDecision {
  const decision = evaluatePretradeRisk(input);
  if (decision.allowed === false) {
    const status = decision.code === 'TRADING_SCOPE_MISMATCH' ? 403 : decision.code === 'ACCOUNT_NOT_FOUND' ? 404 : 422;
    throw new AppError(status, decision.code, decision.message);
  }
  return decision;
}
