import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';

interface AuthState {
  ready: boolean;
  authenticated: boolean;
  authDisabled: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authDisabled, setAuthDisabled] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.set(null);
      setAuthenticated(false);
    });
    api
      .authStatus()
      .then((s) => {
        setAuthDisabled(s.auth_disabled);
        setAuthenticated(s.auth_disabled || s.authenticated);
        if (!s.authenticated) tokenStore.set(null);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setReady(true));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (password: string) => {
    const { token } = await api.login(password);
    tokenStore.set(token);
    setAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      tokenStore.set(null);
      setAuthenticated(false);
    }
  }, []);

  const value = useMemo(
    () => ({ ready, authenticated, authDisabled, login, logout }),
    [ready, authenticated, authDisabled, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
