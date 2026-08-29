import { request } from "../lib/api";
import type { Role } from "../lib/roles";

export interface Member {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  email_verified: boolean;
  mfa_enabled: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  org_code: string | null;
  plan: string;
}

export interface AuthResponse {
  access_token: string;
  expires_in: number;
  member: Member;
  organization: Organization;
  mfa_required?: boolean;
}

export interface MfaChallenge {
  mfa_required: true;
  challenge_token: string;
  expires_in: number;
}

export type LoginResult = AuthResponse | MfaChallenge;

export function isMfaChallenge(result: LoginResult): result is MfaChallenge {
  return (result as MfaChallenge).mfa_required === true;
}

export interface SignupBody {
  org_name: string;
  email: string;
  password: string;
  name?: string | undefined;
}

export interface LoginBody {
  email: string;
  password: string;
  org_slug?: string | undefined;
}

export interface OrgListItem {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface SessionOut {
  id: string;
  created_at: string;
  last_used_at: string | null;
  user_agent: string | null;
  ip_address: string | null;
  current: boolean;
}

export interface MfaStatus {
  enrolled: boolean;
  confirmed: boolean;
  backup_codes_remaining: number;
}

export interface MfaEnrollResponse {
  otpauth_uri: string;
  secret: string;
}

export interface MfaConfirmResponse {
  backup_codes: string[];
}

export const authApi = {
  signup: (body: SignupBody) =>
    request<AuthResponse>("/api/v1/auth/signup", {
      method: "POST",
      body,
      skipAuth: true,
    }),
  login: (body: LoginBody) =>
    request<LoginResult>("/api/v1/auth/login", {
      method: "POST",
      body,
      skipAuth: true,
    }),
  refresh: () =>
    request<AuthResponse>("/api/v1/auth/refresh", {
      method: "POST",
      skipAuth: true,
    }),
  logout: () => request<void>("/api/v1/auth/logout", { method: "POST" }),
  me: () => request<AuthResponse>("/api/v1/auth/me"),
  myOrgs: () => request<OrgListItem[]>("/api/v1/auth/my-orgs"),
  switchOrg: (orgId: string) =>
    request<AuthResponse>("/api/v1/auth/switch-org", {
      method: "POST",
      body: { org_id: orgId },
    }),

  sessions: () => request<SessionOut[]>("/api/v1/auth/sessions"),
  revokeAllSessions: () =>
    request<void>("/api/v1/auth/sessions/revoke-all", { method: "POST" }),

  forgotPassword: (email: string) =>
    request<void>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: { email },
      skipAuth: true,
    }),
  resetPassword: (token: string, password: string) =>
    request<void>("/api/v1/auth/reset-password", {
      method: "POST",
      body: { token, password },
      skipAuth: true,
    }),
  verifyEmail: (token: string) =>
    request<void>("/api/v1/auth/verify-email", {
      method: "POST",
      body: { token },
      skipAuth: true,
    }),
  resendVerification: () =>
    request<void>("/api/v1/auth/resend-verification", { method: "POST" }),

  mfaStatus: () => request<MfaStatus>("/api/v1/auth/mfa"),
  mfaEnroll: () =>
    request<MfaEnrollResponse>("/api/v1/auth/mfa/enroll", { method: "POST" }),
  mfaConfirm: (code: string) =>
    request<MfaConfirmResponse>("/api/v1/auth/mfa/confirm", {
      method: "POST",
      body: { code },
    }),
  mfaDisable: (code: string) =>
    request<void>("/api/v1/auth/mfa/disable", {
      method: "POST",
      body: { code },
    }),
  mfaVerify: (challengeToken: string, code: string) =>
    request<AuthResponse>("/api/v1/auth/mfa/verify", {
      method: "POST",
      body: { challenge_token: challengeToken, code },
      skipAuth: true,
    }),
};
