import { describe, expect, it } from 'vitest';
import {
  composeEquity,
  valueAccount,
  valuePosition,
  type InstrumentSnapshot,
  type PositionSnapshot,
  type QuoteSnapshot,
} from '../src/server/brokerage/valuation.js';

const instrument: InstrumentSnapshot = {
  instrumentId: 'eurusd',
  valuationKind: 'linear',
  contractMultiplier: '100000',
  profitCurrency: 'USD',
};

const quote: QuoteSnapshot = {
  instrumentId: 'eurusd',
  bid: '1.10500',
  ask: '1.10520',
  sourceEventAt: '2026-10-11T10:00:00.000Z',
  receivedAt: '2026-10-11T10:00:00.100Z',
  freshness: 'verified',
  sourceId: 'source-a',
};

const long: PositionSnapshot = {
  positionId: 'position-long',
  accountId: 'account-1',
  instrumentId: 'eurusd',
  side: 'long',
  remainingQuantity: '0.10',
  entryPrice: '1.10000',
  status: 'open',
  profitCurrency: 'USD',
};

const short: PositionSnapshot = {
  ...long,
  positionId: 'position-short',
  side: 'short',
  remainingQuantity: '0.10',
  entryPrice: '1.11000',
};

function position(overrides: Partial<PositionSnapshot>): PositionSnapshot { return { ...long, ...overrides }; }
function instrumentFor(overrides: Partial<InstrumentSnapshot>): InstrumentSnapshot { return { ...instrument, ...overrides }; }
function quoteFor(overrides: Partial<QuoteSnapshot>): QuoteSnapshot { return { ...quote, ...overrides }; }

describe('exact-decimal unrealized P&L valuation', () => {
  it('values a profitable long using bid and a losing long exactly', () => {
    expect(valuePosition(long, instrument, quote)).toMatchObject({ status: 'VALUED', unrealizedPnl: '50.00000000' });
    expect(valuePosition(position({ entryPrice: '1.11000' }), instrument, quote)).toMatchObject({ status: 'VALUED', unrealizedPnl: '-50.00000000' });
  });

  it('values profitable and losing shorts using ask', () => {
    expect(valuePosition(short, instrument, quote)).toMatchObject({ status: 'VALUED', unrealizedPnl: '48.00000000' });
    expect(valuePosition({ ...short, entryPrice: '1.10000' }, instrument, quote)).toMatchObject({ status: 'VALUED', unrealizedPnl: '-52.00000000' });
  });

  it('uses remaining quantity for partial closes and excludes closed exposure', () => {
    expect(valuePosition(position({ remainingQuantity: '0.025' }), instrument, quote)).toMatchObject({ status: 'VALUED', unrealizedPnl: '12.50000000' });
    expect(valuePosition(position({ status: 'closed', remainingQuantity: '0.10' }), instrument, quote)).toMatchObject({ status: 'EXCLUDED', unrealizedPnl: null });
    expect(valuePosition(position({ remainingQuantity: '0' }), instrument, quote)).toMatchObject({ status: 'EXCLUDED', unrealizedPnl: null });
  });

  it('preserves exact fractional arithmetic and rounds only the final monetary value', () => {
    const fractionalInstrument = instrumentFor({ contractMultiplier: '1.25' });
    const fractionalPosition = position({ remainingQuantity: '0.33333333', entryPrice: '1.00000000' });
    const fractionalQuote = quoteFor({ bid: '1.00000001', ask: '1.00000002' });
    expect(valuePosition(fractionalPosition, fractionalInstrument, fractionalQuote)).toMatchObject({ status: 'VALUED', unrealizedPnl: '0.00000000' });
    expect(valuePosition(position({ remainingQuantity: '3', entryPrice: '1.000000000' }), instrumentFor({ contractMultiplier: '1' }), quoteFor({ bid: '1.123456789', ask: '1.123456790' }))).toMatchObject({ status: 'VALUED', unrealizedPnl: '0.37037037' });
  });

  it('rejects invalid quotes and requires an explicit verified freshness outcome', () => {
    expect(valuePosition(long, instrument, quoteFor({ bid: '1.2', ask: '1.1' }))).toMatchObject({ status: 'INVALID' });
    expect(valuePosition(long, instrument, quoteFor({ freshness: 'unverified' }))).toMatchObject({ status: 'INCOMPLETE', reason: 'QUOTE_FRESHNESS_UNVERIFIED' });
    expect(valuePosition(long, instrument, quoteFor({ freshness: 'stale' }))).toMatchObject({ status: 'INCOMPLETE', reason: 'QUOTE_STALE' });
    expect(valuePosition(long, instrument, undefined)).toMatchObject({ status: 'INCOMPLETE', reason: 'QUOTE_MISSING' });
  });

  it('rejects malformed quote metadata even when no open position references it', () => {
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [], instruments: [{ instrumentId: 'eurusd' } as never], quotes: [] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_INVALID' });
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [], instruments: [instrument], quotes: [{ instrumentId: 'eurusd' } as never] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_INVALID' });
  });

  it.each([
    { contractMultiplier: '0' }, { contractMultiplier: '-1' }, { contractMultiplier: 100000 },
    { profitCurrency: 'usd' }, { valuationKind: 'guessed-linear' },
  ])('rejects malformed instrument specification %j', overrides => {
    const invalid = { ...instrument, ...overrides } as never;
    expect(valuePosition(long, invalid, quote)).toMatchObject({ status: 'INVALID', reason: 'INSTRUMENT_INVALID', unrealizedPnl: null });
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [], instruments: [invalid], quotes: [] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_INVALID' });
  });

  it.each([{ bid: 1 }, { ask: '0' }, { sourceId: 123 }, { sourceId: '' }, { freshness: 'guessed-fresh' }])('rejects malformed quote specification %j', overrides => {
    expect(valuePosition(long, instrument, { ...quote, ...overrides } as never)).toMatchObject({ status: 'INVALID', reason: 'QUOTE_INVALID', unrealizedPnl: null });
  });

  it('rejects invalid side metadata before treating zero exposure as excluded', () => {
    expect(valuePosition(position({ side: 'diagonal' as never, remainingQuantity: '0' }), instrument, quote)).toMatchObject({ status: 'INVALID', reason: 'POSITION_INVALID' });
  });

  it('compares quote timestamps beyond JavaScript millisecond precision', () => {
    expect(valuePosition(long, instrument, quoteFor({ sourceEventAt: '2026-10-11T10:00:00.0009Z', receivedAt: '2026-10-11T10:00:00.0001Z' }))).toMatchObject({ status: 'INVALID', reason: 'QUOTE_INVALID' });
    expect(valuePosition(long, instrument, quoteFor({ sourceEventAt: '2026-10-11T10:00:00.1Z', receivedAt: '2026-10-11T10:00:00.100000000Z' }))).toMatchObject({ status: 'VALUED', unrealizedPnl: '50.00000000' });
    expect(valuePosition(long, instrument, quoteFor({ sourceEventAt: '2026-10-11T10:00:00.000000001Z', receivedAt: '2026-10-11T10:00:00.000000002Z' }))).toMatchObject({ status: 'VALUED', unrealizedPnl: '50.00000000' });
  });

  it.each(['-1', '1e3', '', 'NaN', 'Infinity', '0.1.2', '1'.repeat(257), 1, null])('rejects invalid open quantity %j instead of coercing it', quantity => {
    expect(valuePosition(position({ remainingQuantity: quantity as never }), instrument, quote)).toMatchObject({ status: 'INVALID', reason: 'POSITION_INVALID', unrealizedPnl: null });
  });

  it.each(['2026-02-31T10:00:00Z', '2026-10-11T25:00:00Z', '2026-10-11T10:00:00.1234567890Z', '2026-10-11T10:00:00+01:00'])('rejects invalid UTC timestamp %s', sourceEventAt => {
    expect(valuePosition(long, instrument, quoteFor({ sourceEventAt }))).toMatchObject({ status: 'INVALID', reason: 'QUOTE_INVALID' });
  });

  it('returns explicit unsupported outcomes for nonlinear or incompatible instruments', () => {
    expect(valuePosition(long, instrumentFor({ valuationKind: 'unsupported' }), quote)).toMatchObject({ status: 'UNSUPPORTED', reason: 'INSTRUMENT_VALUATION_UNSUPPORTED' });
    expect(valuePosition(long, instrumentFor({ instrumentId: 'other' }), quote)).toMatchObject({ status: 'INVALID', reason: 'INSTRUMENT_MISMATCH' });
    expect(valuePosition(long, instrumentFor({ profitCurrency: 'EUR' }), quote)).toMatchObject({ status: 'INVALID', reason: 'POSITION_CURRENCY_MISMATCH' });
  });
});

describe('account unrealized P&L and equity composition', () => {
  it('aggregates hedged positions independently and composes equity from Cycle 1 cash', () => {
    const result = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long, short], instruments: [instrument], quotes: [quote] });
    expect(result).toMatchObject({ status: 'VALUED', unrealizedPnl: '98.00000000', positionCount: 2 });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000.00000000', valuation: result })).toMatchObject({ status: 'VALUED', equity: '1098.00000000' });
  });

  it('rounds the account total once after summing unrounded position values', () => {
    const tinyInstrument = instrumentFor({ contractMultiplier: '1' });
    const tinyQuote = quoteFor({ bid: '1.000000005', ask: '1.000000006' });
    const first = position({ positionId: 'tiny-a', remainingQuantity: '1', entryPrice: '1.000000000' });
    const second = position({ positionId: 'tiny-b', remainingQuantity: '1', entryPrice: '1.000000000' });
    expect(valuePosition(first, tinyInstrument, tinyQuote)).toMatchObject({ status: 'VALUED', unrealizedPnl: '0.00000001' });
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [first, second], instruments: [tinyInstrument], quotes: [tinyQuote] });
    expect(valuation).toMatchObject({ status: 'VALUED', unrealizedPnl: '0.00000001' });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1', valuation })).toMatchObject({ status: 'VALUED', equity: '1.00000001' });
  });

  it('retains exact wide mixed-sign totals and eight-place negative rounding through equity', () => {
    const unit = instrumentFor({ contractMultiplier: '1' });
    const nearOne = quoteFor({ bid: '2', ask: '2' });
    const positions = [
      position({ positionId: 'large-long', remainingQuantity: '9007199254740993', entryPrice: '1' }),
      position({ positionId: 'large-short', side: 'short', remainingQuantity: '9007199254740992', entryPrice: '1' }),
      position({ positionId: 'tiny-short', side: 'short', remainingQuantity: '1', entryPrice: '1.999999995' }),
    ];
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions, instruments: [unit], quotes: [nearOne] });
    expect(valuation).toMatchObject({ status: 'VALUED', unrealizedPnl: '1.00000000' });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '-9007199254740993.00000001', valuation })).toMatchObject({ status: 'VALUED', equity: '-9007199254740992.00000001' });
    expect(valuePosition(positions[2], unit, nearOne)).toMatchObject({ status: 'VALUED', unrealizedPnl: '-0.00000001' });
  });

  it('returns zero unrealized P&L and cash equity when no positions are open', () => {
    const result = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [], instruments: [], quotes: [] });
    expect(result).toMatchObject({ status: 'VALUED', unrealizedPnl: '0.00000000', positionCount: 0 });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '-12.50000000', valuation: result })).toMatchObject({ status: 'VALUED', equity: '-12.50000000' });
  });

  it('does not publish a partial account total when a quote or instrument is unavailable', () => {
    const missingQuote = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [] });
    expect(missingQuote).toMatchObject({ status: 'INCOMPLETE', unrealizedPnl: null, reason: 'QUOTE_MISSING' });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000', valuation: missingQuote })).toMatchObject({ status: 'INCOMPLETE', equity: null, reason: 'UNREALIZED_PNL_UNAVAILABLE' });
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [], quotes: [] })).toMatchObject({ status: 'INCOMPLETE', unrealizedPnl: null, reason: 'INSTRUMENT_MISSING' });
  });

  it('fails closed for malformed snapshot collection members', () => {
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [null as never], instruments: [instrument], quotes: [quote] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_INVALID', unrealizedPnl: null });
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [null as never], quotes: [quote] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_INVALID', unrealizedPnl: null });
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [null as never] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_INVALID', unrealizedPnl: null });
  });

  it('rejects account, tenant-equivalent, and currency boundary violations without summing currencies', () => {
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [position({ accountId: 'account-2' })], instruments: [instrument], quotes: [quote] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_MISMATCH' });
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [position({ profitCurrency: 'EUR' })], instruments: [instrumentFor({ profitCurrency: 'EUR' })], quotes: [quote] })).toMatchObject({ status: 'INCOMPLETE', unrealizedPnl: null, reason: 'CURRENCY_CONVERSION_REQUIRED' });
  });

  it('is deterministic and does not mutate supplied snapshots', () => {
    const input = { accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [quote] } as const;
    const before = structuredClone(input);
    const first = valueAccount(input); const second = valueAccount(structuredClone(input));
    expect(first).toEqual(second);
    expect(input).toEqual(before);
  });

  it('uses locale-independent position ordering for deterministic replay', () => {
    const first = position({ positionId: 'a' });
    const second = position({ positionId: 'A' });
    const result = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [first, second], instruments: [instrument], quotes: [quote] });
    expect(result.status === 'VALUED' && result.positionValuations.map(item => item.positionId)).toEqual(['A', 'a']);
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [second, first], instruments: [instrument], quotes: [quote] })).toEqual(result);
  });

  it('preflights the full position set before reading market inputs or returning financial details', () => {
    const unavailable = position({ positionId: 'a', instrumentId: 'missing-instrument' });
    const foreign = position({ positionId: 'z', accountId: 'account-2' });
    for (const positions of [[unavailable, foreign], [foreign, unavailable], [long, foreign]]) {
      expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions, instruments: [instrument], quotes: [quote] })).toMatchObject({ status: 'INVALID', reason: 'ACCOUNT_MISMATCH', unrealizedPnl: null, positionCount: 0, positionValuations: [] });
    }
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [unavailable, unavailable], instruments: [], quotes: [] })).toMatchObject({ status: 'INVALID', reason: 'DUPLICATE_POSITION', positionValuations: [] });
  });

  it('keeps closed and zero-exposure results when composing complete equity', () => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long, position({ positionId: 'closed', status: 'closed', instrumentId: 'unavailable' }), position({ positionId: 'zero', remainingQuantity: '0', instrumentId: 'unavailable' })], instruments: [instrument], quotes: [quote] });
    expect(valuation).toMatchObject({ status: 'VALUED', positionCount: 1, unrealizedPnl: '50.00000000' });
    expect(valuation.positionValuations).toHaveLength(3);
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '-100', valuation })).toMatchObject({ status: 'VALUED', equity: '-50.00000000' });
  });

  it.each([
    ['missing position result', { positionValuations: [] }],
    ['null position result', { positionValuations: [null] }],
    ['fractional count', { positionCount: 0.5 }],
    ['negative count', { positionCount: -1 }],
    ['nonfinite count', { positionCount: Infinity }],
    ['overprecision total', { unrealizedPnl: '50.000000001' }],
    ['numeric total', { unrealizedPnl: 50 }],
    ['missing timestamp', { quoteReceivedAt: [] }],
    ['contradictory timestamp', { quoteSourceEventAt: ['2026-10-11T10:00:01Z'] }],
  ])('rejects complete equity with %s', (_name, overrides) => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [quote] });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000', valuation: { ...valuation, ...overrides } as never })).toMatchObject({ equity: null, unrealizedPnl: null, reason: 'VALUATION_INVALID' });
  });

  it.each([
    { accountId: 'account-2' }, { currency: 'EUR' }, { status: 'INCOMPLETE' },
    { unrealizedPnl: '1e2' }, { unrealizedPnl: 50 }, { quoteSourceId: '' },
    { sourceEventAt: '2026-10-11T10:00:01Z' },
  ])('rejects malformed or foreign position result %j during equity composition', overrides => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [quote] });
    const malformed = { ...valuation, positionValuations: [{ ...valuation.positionValuations[0], ...overrides }] };
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000', valuation: malformed as never })).toMatchObject({ equity: null, reason: 'VALUATION_INVALID' });
  });

  it('rejects duplicate valued positions and nonzero empty-account totals at equity composition', () => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [quote] });
    const duplicate = { ...valuation, positionCount: 2, positionValuations: [...valuation.positionValuations, ...valuation.positionValuations], quoteSourceEventAt: [quote.sourceEventAt, quote.sourceEventAt], quoteReceivedAt: [quote.receivedAt, quote.receivedAt] };
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000', valuation: duplicate })).toMatchObject({ equity: null, reason: 'VALUATION_INVALID' });
    const empty = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [], instruments: [], quotes: [] });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000', valuation: { ...empty, unrealizedPnl: '1.00000000' } as never })).toMatchObject({ equity: null, reason: 'VALUATION_INVALID' });
  });

  it('does not double count realized P&L, fees, or cash and leaves accounting inputs read-only', () => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [quote] });
    const input = { accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1050.00000000', valuation };
    const before = structuredClone(input);
    expect(composeEquity(input)).toMatchObject({ status: 'VALUED', equity: '1100.00000000' });
    expect(input).toEqual(before);
  });

  it('does not share mutable quote metadata arrays with equity output', () => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [quote] });
    const before = structuredClone(valuation);
    const equity = composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1', valuation });
    expect(equity.status).toBe('VALUED');
    if (equity.status === 'VALUED') {
      (equity.quoteSourceEventAt as string[]).push('changed');
      (equity.quoteReceivedAt as string[]).push('changed');
    }
    expect(valuation).toEqual(before);
  });

  it.each(['1.000000001', '1e3', '', 'NaN', 1, null])('rejects invalid cash %j', cashBalance => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [], instruments: [], quotes: [] });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: cashBalance as never, valuation })).toMatchObject({ equity: null, reason: 'CASH_INVALID' });
  });

  it('requires canonical conversion for a profit currency different from account currency', () => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [position({ profitCurrency: 'EUR' })], instruments: [instrumentFor({ profitCurrency: 'EUR' })], quotes: [quote] });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000', valuation })).toMatchObject({ status: 'INCOMPLETE', equity: null, reason: 'UNREALIZED_PNL_UNAVAILABLE' });
  });

  it('fails closed for a malformed equity input instead of throwing', () => {
    expect(composeEquity(null as never)).toMatchObject({ status: 'INVALID', equity: null });
    expect(composeEquity({ accountId: '', accountCurrency: 'USD', cashBalance: '1', valuation: { accountId: '', accountCurrency: 'USD', status: 'VALUED', unrealizedPnl: '1.00000000', positionCount: -1, positionValuations: [], quoteSourceEventAt: [], quoteReceivedAt: [] } as never })).toMatchObject({ status: 'INVALID', equity: null });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1', valuation: { accountId: 'account-1', accountCurrency: 'USD', status: 'VALUED', unrealizedPnl: '1.000000001', positionCount: 1, positionValuations: [], quoteSourceEventAt: [], quoteReceivedAt: [] } as never })).toMatchObject({ status: 'INCOMPLETE', equity: null, reason: 'VALUATION_INVALID' });
  });
});
