import { useCallback, useMemo } from 'react';
import type { JsonValue, Row } from '../../shared/types';
import { EmptyState, PageHeading } from '../components/ui';
import { useAuth } from '../auth';
import { object, str } from '../values';
import { MarketTerminal } from './MarketTerminal';
import type { Instrument } from './marketData';
import './trading-terminal.css';

function instrumentList(context: Row): Instrument[] {
  const instance = object(context.instance);
  const config = object(instance.config);
  const candidates: JsonValue[] = [context.instruments, context.symbols, config.instruments, config.symbols].find(value => Array.isArray(value)) as JsonValue[] | undefined ?? [];
  return candidates.flatMap(value => {
    if (typeof value === 'string') return [{ id: value, symbol: value }];
    const row = object(value);
    const id = str(row.id, str(row.instrument_id, str(row.symbol, '')));
    const symbol = str(row.symbol, id);
    if (!id || !symbol) return [];
    const precision = typeof row.price_precision === 'number' && Number.isInteger(row.price_precision) && row.price_precision >= 0 ? row.price_precision : undefined;
    return [{ id, symbol, name: typeof row.name === 'string' ? row.name : typeof row.description === 'string' ? row.description : undefined, pricePrecision: precision, tradable: row.tradable === undefined ? undefined : row.tradable === true }];
  });
}

export function TradingTerminalPage({ context, scopeKey }: { context: Row; scopeKey: string }) {
  const { refresh } = useAuth();
  const instruments = useMemo(() => instrumentList(context), [context]);
  const handleAuthFailure = useCallback(() => { void refresh(); }, [refresh]);
  return <><PageHeading eyebrow="Trading terminal" title="Realtime markets" description="Select an authorized instrument to keep the chart and order ticket aligned." />{instruments.length ? <MarketTerminal instruments={instruments} scopeKey={scopeKey} onAuthFailure={handleAuthFailure} /> : <section className="panel"><EmptyState title="Market data is not configured" description="This workspace has no authorized instrument source yet. No prices are shown until the market-data contract is connected." /></section>}</>;
}
