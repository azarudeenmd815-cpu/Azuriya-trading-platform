import { Search, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ConnectionState, Instrument, MarketDataTransport } from './marketData';
import { filterInstruments, formatPrice, quoteLabel, quoteState, useMarketData } from './marketData';

export interface MarketTerminalProps {
  instruments: readonly Instrument[];
  scopeKey: string;
  transport?: MarketDataTransport | null;
  initialInstrumentId?: string;
  staleAfterMs?: number;
  now?: () => number;
  onAuthFailure?: () => void;
  onInstrumentChange?: (instrument: Instrument | null) => void;
  chart?: (instrument: Instrument | null) => ReactNode;
  orderTicket?: (instrument: Instrument | null) => ReactNode;
}

const statusCopy: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  connected: 'Live feed',
  disconnected: 'Feed disconnected',
  reconnecting: 'Reconnecting',
  unauthorized: 'Session expired',
  error: 'Feed unavailable',
};

function handleRowKey(event: KeyboardEvent<HTMLTableRowElement>, select: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    select();
  }
}

function statusTone(state: string): string {
  return state === 'live' ? 'positive' : state === 'stale' ? 'pending' : 'negative';
}

export function MarketTerminal({ instruments, scopeKey, transport, initialInstrumentId, staleAfterMs, now, onAuthFailure, onInstrumentChange, chart, orderTicket }: MarketTerminalProps) {
  const canonical = useMemo(() => {
    const seen = new Set<string>();
    return instruments.filter(instrument => instrument.id && !seen.has(instrument.id) && seen.add(instrument.id));
  }, [instruments]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(() => initialInstrumentId && canonical.some(instrument => instrument.id === initialInstrumentId) ? initialInstrumentId : canonical[0]?.id ?? '');
  const { quotes, status } = useMarketData(canonical, scopeKey, transport, { staleAfterMs, now, onAuthFailure });
  const selected = canonical.find(instrument => instrument.id === selectedId) ?? null;
  const visible = useMemo(() => filterInstruments(canonical, query), [canonical, query]);

  useEffect(() => {
    if (selectedId && canonical.some(instrument => instrument.id === selectedId)) return;
    const next = canonical[0] ?? null;
    setSelectedId(next?.id ?? '');
    onInstrumentChange?.(next);
  }, [canonical, onInstrumentChange, selectedId]);

  function select(instrument: Instrument) {
    if (instrument.id === selectedId) return;
    setSelectedId(instrument.id);
    onInstrumentChange?.(instrument);
  }

  const feedLabel = statusCopy[status];
  return <div className="trading-terminal" data-scope-key={scopeKey}>
    <section className="terminal-watchlist panel" aria-labelledby="watchlist-heading">
      <div className="panel-heading terminal-heading">
        <div><h2 id="watchlist-heading">Market watchlist</h2><p>{canonical.length ? `${canonical.length} authorized instrument${canonical.length === 1 ? '' : 's'}` : 'No authorized instruments'}</p></div>
        <div className={`terminal-feed-status ${statusTone(status === 'connected' ? 'live' : 'offline')}`} role="status" aria-live="polite"><span className="terminal-status-dot" aria-hidden="true" />{status === 'connected' ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}<span>{feedLabel}</span></div>
      </div>
      <div className="table-toolbar terminal-toolbar">
        <label className="search-field terminal-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search instruments</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search symbol or name" aria-label="Search instruments" /></label>
        <span className="record-count" aria-live="polite">{visible.length} shown</span>
      </div>
      {status === 'unauthorized' && <div className="terminal-inline-state" role="alert">Your session has expired. Sign in again to resume market data.</div>}
      {status !== 'connected' && status !== 'unauthorized' && <div className="terminal-inline-state" role="status">Prices remain marked non-live until the feed recovers.</div>}
      {!canonical.length ? <div className="state-block"><WifiOff size={28} aria-hidden="true" /><h2>No authorized instruments</h2><p>Your account has no instruments available for this terminal.</p></div> : !visible.length ? <div className="state-block"><Search size={28} aria-hidden="true" /><h2>No matching instruments</h2><p>Try a different symbol or instrument name.</p></div> : <div className="table-scroll terminal-table-scroll"><table className="terminal-table"><caption className="sr-only">Authorized market instruments and latest quotes</caption><thead><tr><th scope="col">Instrument</th><th scope="col">Bid</th><th scope="col">Ask</th><th scope="col">Quote status</th></tr></thead><tbody>{visible.map(instrument => {
        const quote = quotes.get(instrument.id);
        const state = quoteState(quote, status, now?.() ?? Date.now(), staleAfterMs);
        const isSelected = instrument.id === selectedId;
        return <tr key={instrument.id} tabIndex={0} role="button" aria-selected={isSelected} className={isSelected ? 'selected' : ''} onClick={() => select(instrument)} onKeyDown={event => handleRowKey(event, () => select(instrument))} aria-label={`Select ${instrument.symbol}${instrument.name ? `, ${instrument.name}` : ''}`}>
          <th scope="row"><span className="terminal-symbol">{instrument.symbol}</span>{instrument.name && <span className="terminal-name">{instrument.name}</span>}{isSelected && <span className="terminal-selected-label">Selected</span>}</th>
          <td className="mono terminal-price">{formatPrice(quote?.bid)}</td><td className="mono terminal-price">{formatPrice(quote?.ask)}</td>
          <td><span className={`badge ${statusTone(state)}`}><span aria-hidden="true" />{quoteLabel(state)}</span></td>
        </tr>;
      })}</tbody></table></div>}
    </section>
    <div className="terminal-workspace-grid">
      <section className="panel terminal-chart-panel" aria-labelledby="terminal-chart-heading"><div className="panel-heading"><div><h2 id="terminal-chart-heading">Chart</h2><p>{selected ? `${selected.symbol}${selected.name ? ` · ${selected.name}` : ''}` : 'Select an instrument'}</p></div></div>{chart ? chart(selected) : <div className="terminal-placeholder" role="status">{selected ? 'Chart data will appear when the authorized chart feed is connected.' : 'Select an instrument from the watchlist.'}</div>}</section>
      <section className="panel terminal-order-panel" aria-labelledby="terminal-order-heading"><div className="panel-heading"><div><h2 id="terminal-order-heading">Order ticket</h2><p>{selected ? `Instrument · ${selected.symbol}` : 'No instrument selected'}</p></div></div>{orderTicket ? orderTicket(selected) : <div className="terminal-placeholder" role="status">{selected ? 'Order entry is unavailable until this workspace exposes its authorized trading contract.' : 'Select an instrument from the watchlist.'}</div>}</section>
    </div>
  </div>;
}
