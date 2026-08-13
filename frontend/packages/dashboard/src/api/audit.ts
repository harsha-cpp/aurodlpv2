import { request } from '../lib/api';

export interface AuditEvent {
  id: string;
  actor: string;
  category: string;
  action: string;
  metadata: Record<string, unknown>;
  previous_hash: string | null;
  event_hash: string;
  created_at: string;
}

export const auditApi = {
  list: (search?: string) =>
    request<AuditEvent[]>('/api/v1/audit', {
      query: { search: search?.trim() || undefined, limit: 100 },
    }),
};
