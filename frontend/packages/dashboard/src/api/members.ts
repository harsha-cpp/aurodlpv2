import { request } from '../lib/api';
import type { Role } from '../lib/roles';

export type MemberRole = Role;

/** A member row as the roster endpoint returns it (MemberOut). */
export interface OrgMember {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: 'active' | 'invited' | 'disabled';
  last_login_at: string | null;
  created_at: string;
}

export interface InviteResponse {
  member: OrgMember;
  /**
   * The backend mails the invite link itself; the token is never returned to
   * the dashboard, so there is nothing here to copy or leak.
   */
  email_sent: boolean;
}

export interface AcceptInviteResponse {
  member: OrgMember;
  org_slug: string;
}

export const membersApi = {
  list: () => request<OrgMember[]>('/api/v1/members'),
  invite: (body: { email: string; name?: string | undefined; role: Role }) =>
    request<InviteResponse>('/api/v1/members/invite', { method: 'POST', body }),
  acceptInvite: (body: { invite_token: string; password: string; name?: string | undefined }) =>
    request<AcceptInviteResponse>('/api/v1/members/accept-invite', { method: 'POST', body, skipAuth: true }),
  updateRole: (id: string, role: Role) =>
    request<OrgMember>(`/api/v1/members/${id}`, { method: 'PATCH', body: { role } }),
  remove: (id: string) => request<void>(`/api/v1/members/${id}`, { method: 'DELETE' }),
};
