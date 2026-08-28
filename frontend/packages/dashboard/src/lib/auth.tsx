import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import {
  authApi,
  isMfaChallenge,
  type AuthResponse,
  type LoginResult,
  type Member,
  type MfaChallenge,
  type Organization,
  type LoginBody,
  type SignupBody,
} from '../api/auth';
import { setAccessToken, setOnAuthLost, refreshSession } from './api';
import { can, type Capability } from './roles';

interface AuthState {
  status: 'loading' | 'unauthenticated' | 'authenticated';
  member: Member | null;
  organization: Organization | null;
}

interface AuthCtx extends AuthState {
  /** Resolves to a challenge when the account has MFA; no session exists yet. */
  login: (body: LoginBody) => Promise<MfaChallenge | null>;
  completeMfa: (challengeToken: string, code: string) => Promise<void>;
  signup: (body: SignupBody) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  /** Client-side mirror of the server's role gates; the server still decides. */
  can: (capability: Capability) => boolean;
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

  const login = useCallback(
    async (body: LoginBody): Promise<MfaChallenge | null> => {
      const res: LoginResult = await authApi.login(body);
      if (isMfaChallenge(res)) return res;
      queryClient.clear();
      setState({ status: 'authenticated', ...applyAuth(res) });
      return null;
    },
    [queryClient],
  );

  const completeMfa = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await authApi.mfaVerify(challengeToken, code);
      queryClient.clear();
      setState({ status: 'authenticated', ...applyAuth(res) });
    },
    [queryClient],
  );

  const signup = useCallback(async (body: SignupBody) => {
    const res = await authApi.signup(body);
    queryClient.clear();
    setState({ status: 'authenticated', ...applyAuth(res) });
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

  const switchOrg = useCallback(
    async (orgId: string) => {
      const res = await authApi.switchOrg(orgId);
      // Every cached query is scoped to the previous org's data.
      queryClient.clear();
      setState({ status: 'authenticated', ...applyAuth(res) });
    },
    [queryClient],
  );

  const capable = useCallback((capability: Capability) => can(state.member?.role, capability), [state.member?.role]);

  return (
    <Ctx.Provider
      value={{ ...state, login, completeMfa, signup, logout, refresh, switchOrg, can: capable }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

function FullPageSpinner() {
  return (
    <div className="center" style={{ height: '100vh' }}>
      <div className="spinner" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Route-level gate matching the nav gate. Renders an explanation rather than
 * redirecting: silently bouncing someone off a bookmarked URL looks like a bug,
 * and the honest answer is "your role can't see this".
 */
export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { status, member, can: capable } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (capable(capability)) return <>{children}</>;
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 className="h2" style={{ marginBottom: 8 }}>Not available for your role</h1>
      <p className="muted">
        This page needs a higher role than <strong>{member?.role ?? 'your account'}</strong>. Ask an
        owner or admin of your organization if you need access.
      </p>
    </div>
  );
}
