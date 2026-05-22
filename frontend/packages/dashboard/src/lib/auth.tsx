import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi, type AuthResponse, type Member, type Organization, type LoginBody, type SignupBody } from '../api/auth';
import { setAccessToken, setOnAuthLost, refreshSession } from './api';

interface AuthState {
  status: 'loading' | 'unauthenticated' | 'authenticated';
  member: Member | null;
  organization: Organization | null;
}

interface AuthCtx extends AuthState {
  login: (body: LoginBody) => Promise<void>;
  signup: (body: SignupBody) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function applyAuth(res: AuthResponse): { member: Member; organization: Organization } {
  if (res.access_token) setAccessToken(res.access_token);
  return { member: res.member, organization: res.organization };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', member: null, organization: null });
  // StrictMode mounts effects twice in dev; this ref guards against double-bootstrap.
  const bootstrappedRef = useRef(false);

  const bootstrap = useCallback(async () => {
    const result = await refreshSession();
    if (result.accessToken && result.data) {
      const data = result.data as AuthResponse;
      setState({ status: 'authenticated', member: data.member, organization: data.organization });
    } else {
      setState({ status: 'unauthenticated', member: null, organization: null });
    }
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    // onAuthLost is only meaningful AFTER bootstrap completes — during loading,
    // a failed refresh is the expected unauthenticated state, not a logout.
    setOnAuthLost(() => {
      setAccessToken(null);
      queryClient.clear();
      setState({ status: 'unauthenticated', member: null, organization: null });
    });
    void bootstrap();
  }, [bootstrap, queryClient]);

  const login = useCallback(async (body: LoginBody) => {
    const res = await authApi.login(body);
    queryClient.clear();
    const data = applyAuth(res);
    setState({ status: 'authenticated', ...data });
  }, [queryClient]);

  const signup = useCallback(async (body: SignupBody) => {
    const res = await authApi.signup(body);
    queryClient.clear();
    const data = applyAuth(res);
    setState({ status: 'authenticated', ...data });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    queryClient.clear();
    setState({ status: 'unauthenticated', member: null, organization: null });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    try {
      const res = await authApi.me();
      setState({ status: 'authenticated', member: res.member, organization: res.organization });
    } catch {
      /* ignore */
    }
  }, []);

  return <Ctx.Provider value={{ ...state, login, signup, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="center" style={{ height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div className="center" style={{ height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}
