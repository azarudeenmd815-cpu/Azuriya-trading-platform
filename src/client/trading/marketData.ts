import { useEffect, useMemo, useState } from 'react';

export interface Instrument {
  id: string;
  symbol: string;
  name?: string;
  pricePrecision?: number;
  tradable?: boolean;
}

export interface Quote {
  instrumentId: string;
  bid?: string | null;
  ask?: string | null;
  timestamp?: string | number | null;
  sequence?: number | null;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'unauthorized' | 'error';
export type QuoteState = 'live' | 'stale' | 'missing' | 'offline';

export interface MarketDataHandlers {
  onQuote: (quote: Quote) => void;
  onStatus: (status: ConnectionState) => void;
  onAuthFailure?: () => void;
}

/** The shared authenticated transport owns sockets, backoff and tab policy. */
export interface MarketDataTransport {
  subscribe: (instrumentIds: string[], handlers: MarketDataHandlers) => void | (() => void);
}

export interface MarketDataOptions {
  staleAfterMs?: number;
  now?: () => number;
  onAuthFailure?: () => void;
}

export const DEFAULT_STALE_AFTER_MS = 15_000;

export function uniqueInstruments(instruments: readonly Instrument[]): Instrument[] {
  const seen = new Set<string>();
  return instruments.filter(instrument => {
    if (!instrument.id || seen.has(instrument.id)) return false;
    seen.add(instrument.id);
    return true;
  });
}

export function filterInstruments(instruments: readonly Instrument[], query: string): Instrument[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...instruments];
  return instruments.filter(instrument => `${instrument.symbol} ${instrument.name ?? ''}`.toLocaleLowerCase().includes(normalized));
}

export function formatPrice(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? '-' : value;
}

export function parseQuote(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() !== '') return value;
  return undefined;
}

export function normalizeQuote(value: unknown): Quote | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const instrumentId = typeof candidate.instrumentId === 'string' ? candidate.instrumentId : typeof candidate.instrument_id === 'string' ? candidate.instrument_id : '';
  if (!instrumentId) return null;
  const bid = parseQuote(candidate.bid);
  const ask = parseQuote(candidate.ask);
  if (bid === undefined && ask === undefined) return null;
  const sequence = typeof candidate.sequence === 'number' && Number.isFinite(candidate.sequence) ? candidate.sequence : null;
  const timestamp = typeof candidate.timestamp === 'string' || typeof candidate.timestamp === 'number' ? candidate.timestamp : null;
  return { instrumentId, bid, ask, sequence, timestamp };
}

function comparableTimestamp(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Only compares ordering metadata when both events provide the same metadata type. */
export function isNewerQuote(next: Quote, current: Quote | undefined): boolean {
  if (!current) return true;
  if (typeof next.sequence === 'number' && typeof current.sequence === 'number') return next.sequence > current.sequence;
  const nextTime = comparableTimestamp(next.timestamp);
  const currentTime = comparableTimestamp(current.timestamp);
  if (nextTime !== null && currentTime !== null) return nextTime > currentTime;
  return true;
}

export function quoteState(quote: Quote | undefined, connection: ConnectionState, now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS): QuoteState {
  if (!quote) return 'missing';
  if (connection !== 'connected') return 'offline';
  const timestamp = comparableTimestamp(quote.timestamp);
  return timestamp !== null && now - timestamp > staleAfterMs ? 'stale' : 'live';
}

export function applyQuote(quotes: ReadonlyMap<string, Quote>, next: Quote): Map<string, Quote> {
  const current = quotes.get(next.instrumentId);
  if (!isNewerQuote(next, current)) return new Map(quotes);
  const result = new Map(quotes);
  result.set(next.instrumentId, next);
  return result;
}

export interface MarketDataSnapshot {
  quotes: ReadonlyMap<string, Quote>;
  status: ConnectionState;
}

export function useMarketData(instruments: readonly Instrument[], scopeKey: string, transport?: MarketDataTransport | null, options: MarketDataOptions = {}): MarketDataSnapshot {
  const onAuthFailure = options.onAuthFailure;
  const canonical = useMemo(() => uniqueInstruments(instruments), [instruments]);
  const instrumentIds = useMemo(() => canonical.map(instrument => instrument.id), [canonical]);
  const subscriptionKey = instrumentIds.join('\u001f');
  const [quotes, setQuotes] = useState<ReadonlyMap<string, Quote>>(() => new Map());
  const [status, setStatus] = useState<ConnectionState>(transport ? 'connecting' : 'disconnected');

  useEffect(() => {
    let active = true;
    setQuotes(new Map());
    if (!transport || instrumentIds.length === 0) {
      setStatus(transport ? 'connected' : 'disconnected');
      return () => { active = false; };
    }
    setStatus('connecting');
    const cleanup = transport.subscribe(instrumentIds, {
      onQuote: quote => {
        const normalized = normalizeQuote(quote);
        if (active && normalized && instrumentIds.includes(normalized.instrumentId)) setQuotes(previous => applyQuote(previous, normalized));
      },
      onStatus: nextStatus => {
        if (active) setStatus(nextStatus);
      },
      onAuthFailure: () => {
        if (active) {
          setStatus('unauthorized');
          onAuthFailure?.();
        }
      },
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, [onAuthFailure, scopeKey, subscriptionKey, transport, instrumentIds]);

  return { quotes, status };
}

export function quoteLabel(state: QuoteState): string {
  return state === 'live' ? 'Live' : state === 'stale' ? 'Stale' : state === 'offline' ? 'Offline' : 'No quote';
}
