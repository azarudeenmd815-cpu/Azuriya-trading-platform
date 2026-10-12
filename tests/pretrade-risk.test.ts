import { describe, expect, it } from 'vitest';
import { assertPretradeAllowed, evaluatePretradeRisk, type PretradeInstrument, type PretradeRiskInput } from '../src/server/connectors/pretrade-risk.js';

const instrument: PretradeInstrument = {
  symbol: 'EURUSD', description: 'Euro / US Dollar', base_currency: 'EUR', quote_currency: 'USD',
  digits: 5, tick_size: '0.00001', contract_size: '100000', minimum_volume: '0.01', maximum_volume: '100', volume_step: '0.01', enabled: true,
};
const base: PretradeRiskInput = {
  account: {
    scopeMatches: true, accountOwned: true,
    account: { provider_account_id: 'acct-1', display_name: 'Demo', currency: 'USD', group_id: 'demo', leverage: 100, status: 'enabled' },
    snapshot: { provider_account_id: 'acct-1', currency: 'USD', balance: '1000.00', equity: '1000.00', margin: '0.00', free_margin: '110.00', observed_at: '2026-01-01T00:00:00.000Z' },
  },
  instrument,
  order: { symbol: 'EURUSD', side: 'buy', type: 'market', volume: '0.10', exposure: 'increase', stage: 'execute' },
  quote: { symbol: 'EURUSD', trusted: true, available: true, bid: '1.09999', ask: '1.10000' },
};

function input(overrides: Partial<PretradeRiskInput> = {}): PretradeRiskInput { return { ...base, ...overrides, account: { ...base.account, ...(overrides.account ?? {}) }, order: { ...base.order, ...(overrides.order ?? {}) } } }

describe('deterministic pretrade risk admission', () => {
  it('admits a valid order and exposes exact required margin', () => {
    expect(evaluatePretradeRisk(base)).toEqual({ allowed: true, deferred: false, required_margin: '110.0000' });
  });

  it.each([
    ['insufficient margin', { free_margin: '109.99999' }, 'TRADING_INSUFFICIENT_MARGIN'],
    ['zero margin', { free_margin: '0' }, 'TRADING_INSUFFICIENT_MARGIN'],
    ['negative margin', { free_margin: '-1' }, 'TRADING_INSUFFICIENT_MARGIN'],
  ])('%s rejects without permissive fallback', (_name, snapshot, code) => {
    expect(evaluatePretradeRisk(input({ account: { ...base.account, snapshot: { ...base.account.snapshot!, ...snapshot } } }))).toMatchObject({ allowed: false, code });
  });

  it('accepts the exact available-margin boundary with decimal arithmetic', () => {
    expect(evaluatePretradeRisk(input({ account: { ...base.account, snapshot: { ...base.account.snapshot!, free_margin: '110.000000000' } } }))).toMatchObject({ allowed: true, required_margin: '110.0000' });
  });

  it.each([
    ['zero quantity', { volume: '0' }], ['step mismatch', { volume: '0.101' }], ['too precise price', { price: '1.100001' }],
  ])('rejects %s', (_name, order) => expect(evaluatePretradeRisk(input({ order: { ...base.order, ...order } }))).toMatchObject({ allowed: false, code: 'TRADING_ORDER_INVALID' }));

  it('rejects a server execution price beyond instrument precision', () => {
    expect(evaluatePretradeRisk(input({ order: { ...base.order, execution_price: '1.100001' } }))).toMatchObject({ allowed: false, code: 'TRADING_ORDER_INVALID' });
  });

  it('rejects disabled accounts and instruments', () => {
    expect(evaluatePretradeRisk(input({ account: { ...base.account, account: { ...base.account.account!, status: 'disabled' } } }))).toMatchObject({ allowed: false, code: 'TRADING_ACCOUNT_INELIGIBLE' });
    expect(evaluatePretradeRisk(input({ instrument: { ...instrument, enabled: false } }))).toMatchObject({ allowed: false, code: 'TRADING_INSTRUMENT_UNAVAILABLE' });
  });

  it('rejects an instrument with a whitespace-only symbol', () => {
    const malformedInstrument = { ...instrument, symbol: ' ' };
    expect(evaluatePretradeRisk(input({ instrument: malformedInstrument, order: { ...base.order, symbol: ' ' }, quote: { ...base.quote!, symbol: ' ' } }))).toMatchObject({ allowed: false, code: 'TRADING_INSTRUMENT_UNAVAILABLE' });
  });

  it('rejects cross-tenant state before inspecting balances', () => {
    expect(evaluatePretradeRisk(input({ account: { ...base.account, scopeMatches: false, accountOwned: false, snapshot: null } }))).toMatchObject({ allowed: false, code: 'TRADING_SCOPE_MISMATCH' });
  });

  it('fails closed when runtime trust flags are not literal booleans', () => {
    const malformed = input({ account: { ...base.account, scopeMatches: 'false' as unknown as boolean, accountOwned: true } });
    expect(evaluatePretradeRisk(malformed)).toMatchObject({ allowed: false, code: 'TRADING_SCOPE_MISMATCH' });
    expect(evaluatePretradeRisk(input({ quote: { ...base.quote!, trusted: 'false' as unknown as boolean } }))).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
  });

  it('fails closed when account identity or snapshot money is malformed', () => {
    const missingIdentity = input({
      account: {
        ...base.account,
        account: { ...base.account.account!, provider_account_id: '' },
        snapshot: { ...base.account.snapshot!, provider_account_id: '' },
      },
    });
    expect(evaluatePretradeRisk(missingIdentity)).toMatchObject({ allowed: false, code: 'TRADING_RISK_INFORMATION_MISSING' });
    const malformedMoney = input({ account: { ...base.account, snapshot: { ...base.account.snapshot!, equity: 'not-a-decimal' } } });
    expect(evaluatePretradeRisk(malformedMoney)).toMatchObject({ allowed: false, code: 'TRADING_RISK_INFORMATION_MISSING' });
  });

  it('rejects executable quotes that violate instrument precision or tick size', () => {
    expect(evaluatePretradeRisk(input({ quote: { ...base.quote!, ask: '1.100001' } }))).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
    expect(evaluatePretradeRisk(input({
      instrument: { ...instrument, tick_size: '0.00010' },
      quote: { ...base.quote!, bid: '1.10000', ask: '1.10005' },
    }))).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
  });

  it('rejects non-canonical account snapshot timestamps', () => {
    expect(evaluatePretradeRisk(input({ account: { ...base.account, snapshot: { ...base.account.snapshot!, observed_at: '0' } } }))).toMatchObject({ allowed: false, code: 'TRADING_RISK_INFORMATION_MISSING' });
  });

  it('rejects semantically invalid account and quote timestamps', () => {
    expect(evaluatePretradeRisk(input({ account: { ...base.account, snapshot: { ...base.account.snapshot!, observed_at: '2026-02-30T00:00:00.000Z' } } }))).toMatchObject({ allowed: false, code: 'TRADING_RISK_INFORMATION_MISSING' });
    expect(evaluatePretradeRisk(input({ quote: { ...base.quote!, observed_at: '2026-02-30T00:00:00.000Z' }, freshness: { maxAgeMs: 60_000, nowMs: Date.parse('2026-03-02T00:00:00.000Z') } }))).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
  });

  it('rejects opening margin checks when no canonical currency conversion exists', () => {
    expect(evaluatePretradeRisk(input({
      account: { ...base.account, account: { ...base.account.account!, currency: 'EUR' }, snapshot: { ...base.account.snapshot!, currency: 'EUR' } },
    }))).toMatchObject({ allowed: false, code: 'TRADING_RISK_INFORMATION_MISSING' });
  });

  it('rejects invalid quotes and preserves deterministic decisions', () => {
    const invalid = input({ quote: { ...base.quote!, trusted: false } });
    expect(evaluatePretradeRisk(invalid)).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
    expect(evaluatePretradeRisk(base)).toEqual(evaluatePretradeRisk(structuredClone(base)));
  });

  it('fails closed when freshness validation has no quote timestamp', () => {
    expect(evaluatePretradeRisk({ ...base, freshness: { maxAgeMs: 60_000, nowMs: Date.now() } })).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
  });

  it('defers pending margin and quote checks until execution, then checks them', () => {
    const pending = input({ order: { ...base.order, type: 'limit', price: '1.09000', stage: 'submit' }, quote: undefined });
    expect(evaluatePretradeRisk(pending)).toEqual({ allowed: true, deferred: true });
    expect(evaluatePretradeRisk({ ...pending, order: { ...pending.order, stage: 'execute' } })).toMatchObject({ allowed: false, code: 'TRADING_QUOTE_INVALID' });
  });

  it('preserves valid reduction and close operations even with no free margin', () => {
    const reduction = input({ account: { ...base.account, snapshot: { ...base.account.snapshot!, free_margin: '0' } }, order: { ...base.order, exposure: 'reduce' } });
    expect(evaluatePretradeRisk(reduction)).toEqual({ allowed: true, deferred: false });
    expect(evaluatePretradeRisk({ ...reduction, account: { ...reduction.account, account: { ...reduction.account.account!, status: 'disabled' } } })).toEqual({ allowed: true, deferred: false });
  });

  it('does not mutate the authoritative input snapshot', () => {
    const frozen = structuredClone(base);
    const before = structuredClone(frozen);
    evaluatePretradeRisk(frozen);
    expect(frozen).toEqual(before);
  });

  it('maps denials to the structured AppError convention', () => {
    expect(() => assertPretradeAllowed(input({ instrument: { ...instrument, enabled: false } }))).toThrowError(expect.objectContaining({ code: 'TRADING_INSTRUMENT_UNAVAILABLE', statusCode: 422 }));
  });
});
