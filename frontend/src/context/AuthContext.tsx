// ============================================================
// Контекст авторизации: хранит токен и профиль пользователя.
// Токен синхронизируется с localStorage (см. api/client.ts).
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setToken } from '../api/client';
import type { TokenOut, User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<TokenOut>;
  register: (data: { phone: string; name: string; password: string; email?: string }) => Promise<TokenOut>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Пока загружается профиль по сохранённому токену — показываем спиннер
  const [loading, setLoading] = useState(true);

  // Загрузка профиля по токену (при старте приложения)
  const refresh = useCallback(async () => {
    try {
      const me = await api.profile();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const data = await api.login({ phone, password });
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(
    async (data: { phone: string; name: string; password: string; email?: string }) => {
      const res = await api.register(data);
      setToken(res.token);
      setUser(res.user);
      return res;
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // При монтировании пробуем восстановить сессию
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Хук для доступа к контексту из любой страницы
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth должен использоваться внутри <AuthProvider>');
  }
  return ctx;
}
