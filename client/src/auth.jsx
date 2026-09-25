import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const FALLBACK_PREFERENCES = {
  theme: 'light',
  accent: '#FFEB3B',
  fontScale: 1,
  density: 'comfortable',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [preferences, setPreferences] = useState(FALLBACK_PREFERENCES);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let active = true;

    api
      .get('/auth/me')
      .then((data) => {
        if (!active) return;
        setUser(data.user);
        setPreferences({ ...FALLBACK_PREFERENCES, ...data.preferences });
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setStatus('ready');
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme;
    root.dataset.density = preferences.density;
    root.style.setProperty('--accent', preferences.accent);
    root.style.fontSize = `${Math.round(16 * preferences.fontScale)}px`;
  }, [preferences]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    setUser(data.user);
    setPreferences({ ...FALLBACK_PREFERENCES, ...data.preferences });
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setPreferences(FALLBACK_PREFERENCES);
    }
  }, []);

  const applyPreferences = useCallback((next) => {
    setPreferences((previous) => ({ ...previous, ...next }));
  }, []);

  const value = useMemo(
    () => ({ user, preferences, status, login, logout, setUser, applyPreferences }),
    [user, preferences, status, login, logout, applyPreferences]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
