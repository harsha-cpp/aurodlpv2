import { request } from '../lib/api';
import type { Member } from './auth';

export type MemberRole = Member['role'];

export interface InviteResponse {
  member: Member;
  invite_token: string;
  invite_url_hint: string;
}

export interface AcceptInviteResponse {
  member: Member;
  org_slug: string;
}

export const membersApi = {
  list: () => request<Member[]>('/api/v1/members'),
  invite: (body: { email: string; name?: string | undefined; role: Member['role'] }) =>
    request<InviteResponse>('/api/v1/members/invite', { method: 'POST', body }),
  acceptInvite: (body: { invite_token: string; password: string; name?: string | undefined }) =>
    request<AcceptInviteResponse>('/api/v1/members/accept-invite', { method: 'POST', body, skipAuth: true }),
  updateRole: (id: string, role: Member['role']) =>
    request<Member>(`/api/v1/members/${id}`, { method: 'PATCH', body: { role } }),
  remove: (id: string) => request<void>(`/api/v1/members/${id}`, { method: 'DELETE' }),
};
