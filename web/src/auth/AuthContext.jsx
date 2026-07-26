import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { auth as authApi, tokens } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On boot, if we have a token, resolve the current user.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tokens.access && !tokens.refresh) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await authApi.me();
        if (alive) setUser(user);
      } catch {
        tokens.clear();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email, password, mfaToken) => {
    const session = await authApi.login({ email, password, mfaToken });
    tokens.set(session);
    setUser(session.user);
    return session;
  }, []);

  const register = useCallback(async (payload) => {
    const session = await authApi.register(payload);
    tokens.set(session);
    setUser(session.user);
    return session;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    tokens.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
