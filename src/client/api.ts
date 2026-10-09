import { useCallback, useEffect, useRef, useState } from 'react';
export interface SupportWorkspace { id: string; instanceId: string; reason: string; expiresAt: string }
let supportWorkspace: SupportWorkspace | null = null;
export function setSupportWorkspace(value: SupportWorkspace | null) { supportWorkspace = value; }
export function getSupportWorkspace() { return supportWorkspace && new Date(supportWorkspace.expiresAt).getTime() > Date.now() ? supportWorkspace : null; }

export class ApiError extends Error {
  constructor(message: string, public code: string, public requestId?: string, public status?: number, public details?: Record<string, unknown>[]) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken = '';
export function setCsrfToken(token: string) { csrfToken = token; }

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET') headers.set('X-CSRF-Token', csrfToken);
  const support = getSupportWorkspace();
  if (support && path.startsWith(`/instances/${support.instanceId}/`)) headers.set('X-Support-Grant-ID', support.id);
  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'same-origin' });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const result = body as { error?: { message?: string; code?: string; request_id?: string; details?: Record<string, unknown>[] } } | null;
    throw new ApiError(result?.error?.message ?? `The server returned ${response.status}.`, result?.error?.code ?? 'REQUEST_FAILED', result?.error?.request_id, response.status, result?.error?.details);
  }
  return body as T;
}

export async function read<T>(path: string): Promise<T> {
  return (await request<{ data: T }>(path)).data;
}

export async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  return (await request<{ data: T }>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).data;
}

/** Failed unchanged retries keep the same key; a confirmed new intent gets a fresh key. */
export function useIdempotentRequest() {
  const pending = useRef(new Map<string,string>());
  return useCallback(async <T,>(path: string, method: string, body: unknown, extraHeaders: Record<string,string> = {}): Promise<T> => {
    const payload = JSON.stringify(body); const fingerprint = `${method}:${path}:${payload}`;
    const key = pending.current.get(fingerprint) ?? crypto.randomUUID(); pending.current.set(fingerprint,key);
    const result = await request<T>(path,{method,body:payload,headers:{...extraHeaders,'Idempotency-Key':key}});
    pending.current.delete(fingerprint); return result;
  },[]);
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [revision, setRevision] = useState(0);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let current = true;
    setLoadedPath(path);
    if (!path) { setLoading(false); setData(null); return; }
    setLoading(true);
    setError(null);
    request<T>(path).then(value => { if (current) setData(value); }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason : new Error('Unable to load this resource.'));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [path, revision]);
  const changed = loadedPath !== path;
  return { data: changed ? null : data, error: changed ? null : error, loading: changed ? Boolean(path) : loading, reload };
}
