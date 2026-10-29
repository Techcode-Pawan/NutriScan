import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, configureApi } from '@/services/api';
import type { User } from '@/types/api';
import { storage } from './storage';

const TOKEN_KEY = 'nutriscan.token';
const ONBOARDED_KEY = 'nutriscan.onboarded';

interface AuthState {
  ready: boolean;
  token: string | null;
  user: User | null;
  onboarded: boolean;
  isGuest: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName?: string): Promise<void>;
  logout(): Promise<void>;
  continueAsGuest(): Promise<void>;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const clearSession = useCallback(async () => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    await storage.remove(TOKEN_KEY);
    queryClient.removeQueries({ queryKey: ['me'] });
    queryClient.removeQueries({ queryKey: ['history'] });
    queryClient.removeQueries({ queryKey: ['favorites'] });
    queryClient.removeQueries({ queryKey: ['preferences'] });
  }, [queryClient]);

  useEffect(() => {
    configureApi({ getToken: () => tokenRef.current, onUnauthorized: () => void clearSession() });
  }, [clearSession]);

  useEffect(() => {
    (async () => {
      const [t, o] = await Promise.all([storage.get(TOKEN_KEY), storage.get(ONBOARDED_KEY)]);
      setOnboarded(o === '1');
      if (t) {
        tokenRef.current = t;
        setToken(t);
        try {
          setUser(await api.get<User>('/api/me'));
        } catch {
          // invalid/expired token or server offline: keep the token only if the server was unreachable
          const still = tokenRef.current;
          if (!still) setToken(null);
        }
      }
      setReady(true);
    })();
  }, []);

  const startSession = useCallback(
    async (data: { token: string; user: User }) => {
      tokenRef.current = data.token;
      setToken(data.token);
      setUser(data.user);
      setOnboarded(true);
      await Promise.all([storage.set(TOKEN_KEY, data.token), storage.set(ONBOARDED_KEY, '1')]);
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const value = useMemo<AuthState>(
    () => ({
      ready,
      token,
      user,
      onboarded,
      isGuest: !token,
      async login(email, password) {
        await startSession(await api.post('/api/auth/login', { email, password }));
      },
      async register(email, password, displayName) {
        await startSession(await api.post('/api/auth/register', { email, password, displayName: displayName || undefined }));
      },
      async logout() {
        try {
          if (tokenRef.current) await api.post('/api/auth/logout');
        } catch {
          // logging out locally is enough if the server is unreachable
        }
        await clearSession();
      },
      async continueAsGuest() {
        setOnboarded(true);
        await storage.set(ONBOARDED_KEY, '1');
      },
      async refreshUser() {
        if (tokenRef.current) setUser(await api.get<User>('/api/me'));
      },
    }),
    [ready, token, user, onboarded, startSession, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
