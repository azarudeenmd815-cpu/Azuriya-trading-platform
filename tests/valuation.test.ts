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
    expect(valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [first, second], instruments: [tinyInstrument], quotes: [tinyQuote] })).toMatchObject({ status: 'VALUED', unrealizedPnl: '0.00000001' });
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

  it('does not double count realized P&L, fees, or cash and leaves accounting inputs read-only', () => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [long], instruments: [instrument], quotes: [quote] });
    const input = { accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1050.00000000', valuation };
    const before = structuredClone(input);
    expect(composeEquity(input)).toMatchObject({ status: 'VALUED', equity: '1100.00000000' });
    expect(input).toEqual(before);
  });

  it('requires canonical conversion for a profit currency different from account currency', () => {
    const valuation = valueAccount({ accountId: 'account-1', accountCurrency: 'USD', positions: [position({ profitCurrency: 'EUR' })], instruments: [instrumentFor({ profitCurrency: 'EUR' })], quotes: [quote] });
    expect(composeEquity({ accountId: 'account-1', accountCurrency: 'USD', cashBalance: '1000', valuation })).toMatchObject({ status: 'INCOMPLETE', equity: null, reason: 'UNREALIZED_PNL_UNAVAILABLE' });
  });

  it('fails closed for a malformed equity input instead of throwing', () => {
    expect(composeEquity(null as never)).toMatchObject({ status: 'INVALID', equity: null });
  });
});
