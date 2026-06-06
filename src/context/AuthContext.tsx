import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from '../api/client';
import { getProfile } from '../api/users';
import type { UserProfile } from '../api/types';
import { clearToken, getToken, setToken, hasValidToken } from '../utils/storage';

interface AuthContextValue {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<UserProfile | null>;
  setUser: (user: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  const loginWithToken = useCallback(
    async (token: string) => {
      setToken(token);
      const profile = await refreshProfile();
      if (!profile) throw new Error('Failed to load profile');
      setUser(profile);
    },
    [refreshProfile]
  );

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    const init = async () => {
      if (!hasValidToken()) {
        setIsLoading(false);
        return;
      }
      try {
        await refreshProfile();
      } catch {
        clearToken();
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [refreshProfile]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!getToken() && !!user,
      isLoading,
      loginWithToken,
      logout,
      refreshProfile,
      setUser,
    }),
    [user, isLoading, loginWithToken, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
