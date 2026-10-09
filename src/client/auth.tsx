import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Row } from '../shared/types';
import { ApiError, mutate, read, setCsrfToken, setSupportWorkspace } from './api';

export interface Session {
  user: { id: string; email: string; display_name: string; core_role: string | null };
  csrf_token: string;
  memberships?: Row[];
  client_memberships?: Row[];
}
interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  async function refresh() {
    try {
      const current = await read<Session>('/auth/me');
      setCsrfToken(current.csrf_token);
      setSession(current);
      setError(null);
    } catch (reason) {
      setSession(null);
      if (!(reason instanceof ApiError && reason.status === 401)) setError(reason instanceof Error ? reason : new Error('The session service is unavailable.'));
    } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function login(email: string, password: string) {
    const result = await mutate<Session>('/auth/login', 'POST', { email, password });
    setCsrfToken(result.csrf_token);
    const current = await read<Session>('/auth/me');
    setCsrfToken(current.csrf_token);
    setSession(current);
    setError(null);
  }
  async function logout() {
    await mutate('/auth/logout', 'POST');
    setCsrfToken(''); setSupportWorkspace(null);
    setSession(null);
  }
  return <AuthContext.Provider value={{ session, loading, error, login, logout, refresh }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Authentication provider is missing.');
  return context;
}
