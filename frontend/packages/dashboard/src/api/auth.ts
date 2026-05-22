import { request } from '../lib/api';

export interface Member {
  id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'admin' | 'analyst' | 'viewer';
  status: 'active' | 'invited' | 'disabled';
  last_login_at: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  org_code: string;
  plan: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  expires_in: number;
  member: Member;
  organization: Organization;
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

export const authApi = {
  signup: (body: SignupBody) => request<AuthResponse>('/api/v1/auth/signup', { method: 'POST', body, skipAuth: true }),
  login: (body: LoginBody) => request<AuthResponse>('/api/v1/auth/login', { method: 'POST', body, skipAuth: true }),
  refresh: () => request<AuthResponse>('/api/v1/auth/refresh', { method: 'POST', skipAuth: true }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  me: () => request<AuthResponse>('/api/v1/auth/me'),
};
