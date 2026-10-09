import { createContext, useContext, type ReactNode } from 'react';
import type { Row } from '../shared/types';
import { useApi } from './api';
type Host = { kind: 'core' | 'tenant'; product_instance_id?: string; application_type?: string; brand?: Row };
const HostContext = createContext<{ host: Host | null; loading: boolean; error: Error | null }>({ host: null, loading: true, error: null });
export function HostProvider({ children }: { children: ReactNode }) {
  const result = useApi<{ data: Host }>('/host-context');
  return <HostContext.Provider value={{ host: result.data?.data ?? null, loading: result.loading, error: result.error }}>{children}</HostContext.Provider>;
}
export const useHost = () => useContext(HostContext);
