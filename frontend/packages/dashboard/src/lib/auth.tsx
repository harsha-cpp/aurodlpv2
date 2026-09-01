import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
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
} from "../api/auth";
import { setAccessToken, setOnAuthLost, refreshSession } from "./api";
import { can, type Capability } from "./roles";
import { clearShellRole, readShellRole, writeShellRole } from "./shell-cache";

interface AuthState {
  status: "loading" | "restoring" | "unauthenticated" | "authenticated";
  member: Member | null;
  organization: Organization | null;
}

interface AuthCtx extends AuthState {
  login: (body: LoginBody) => Promise<MfaChallenge | null>;
  completeMfa: (challengeToken: string, code: string) => Promise<void>;
  signup: (body: SignupBody) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  can: (capability: Capability) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

function applyAuth(res: AuthResponse): {
  member: Member;
  organization: Organization;
} {
  if (res.access_token) setAccessToken(res.access_token);
  return { member: res.member, organization: res.organization };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(() => {
    const role = readShellRole();
    return {
      status: role ? "restoring" : "loading",
      member: role ? ({ role } as Member) : null,
      organization: null,
    };
  });
  const bootstrappedRef = useRef(false);

  const bootstrap = useCallback(async () => {
    const result = await refreshSession();
    if (result.accessToken && result.data) {
      const data = result.data as AuthResponse;
      writeShellRole(data.member.role);
      setState({
        status: "authenticated",
        member: data.member,
        organization: data.organization,
      });
    } else {
      clearShellRole();
      setState({ status: "unauthenticated", member: null, organization: null });
    }
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    setOnAuthLost(() => {
      setAccessToken(null);
      queryClient.clear();
      clearShellRole();
      setState({ status: "unauthenticated", member: null, organization: null });
    });
    void bootstrap();
  }, [bootstrap, queryClient]);

  const login = useCallback(
    async (body: LoginBody): Promise<MfaChallenge | null> => {
      const res: LoginResult = await authApi.login(body);
      if (isMfaChallenge(res)) return res;
      queryClient.clear();
      const next = applyAuth(res);
      writeShellRole(next.member.role);
      setState({ status: "authenticated", ...next });
      return null;
    },
    [queryClient],
  );

  const completeMfa = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await authApi.mfaVerify(challengeToken, code);
      queryClient.clear();
      const next = applyAuth(res);
      writeShellRole(next.member.role);
      setState({ status: "authenticated", ...next });
    },
    [queryClient],
  );

  const signup = useCallback(
    async (body: SignupBody) => {
      const res = await authApi.signup(body);
      queryClient.clear();
      const next = applyAuth(res);
      writeShellRole(next.member.role);
      setState({ status: "authenticated", ...next });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setAccessToken(null);
    queryClient.clear();
    clearShellRole();
    setState({ status: "unauthenticated", member: null, organization: null });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    const res = await authApi.me().catch(() => null);
    if (!res) return;
    setState({
      status: "authenticated",
      member: res.member,
      organization: res.organization,
    });
  }, []);

  const switchOrg = useCallback(
    async (orgId: string) => {
      const res = await authApi.switchOrg(orgId);
      queryClient.clear();
      const next = applyAuth(res);
      writeShellRole(next.member.role);
      setState({ status: "authenticated", ...next });
    },
    [queryClient],
  );

  const capable = useCallback(
    (capability: Capability) => can(state.member?.role, capability),
    [state.member?.role],
  );

  return (
    <Ctx.Provider
      value={{
        ...state,
        login,
        completeMfa,
        signup,
        logout,
        refresh,
        switchOrg,
        can: capable,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return null;
  if (status === "unauthenticated") {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading" || status === "restoring") return null;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: ReactNode;
}) {
  const { status, member, can: capable } = useAuth();
  if (status === "loading") return null;
  if (capable(capability)) return <>{children}</>;
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 className="h2" style={{ marginBottom: 8 }}>
        Not available for your role
      </h1>
      <p className="muted">
        This page needs a higher role than{" "}
        <strong>{member?.role ?? "your account"}</strong>. Ask an owner or admin
        of your organization if you need access.
      </p>
    </div>
  );
}
