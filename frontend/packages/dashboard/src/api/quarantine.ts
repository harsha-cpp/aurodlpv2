import { request } from '../lib/api';

export type QuarantineStatus = 'pending' | 'approved' | 'rejected';

export interface QuarantineItem {
  id: string;
  scan_id: string;
  client_scan_id: string;
  sender: string;
  subject: string;
  recipients: string[];
  entities: Array<Record<string, unknown>>;
  matched_policy_ids: string[];
  risk_score: number;
  severity: string;
  status: QuarantineStatus;
  analyst_id: string | null;
  analyst_note: string | null;
  decided_at: string | null;
  attachment_refs: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
}

export const quarantineApi = {
  list: (status: QuarantineStatus | 'all' = 'pending') =>
    request<QuarantineItem[]>('/api/v1/quarantine', {
      query: { status: status === 'all' ? undefined : status },
    }),
  approve: (id: string, note?: string) =>
    request<QuarantineItem>(`/api/v1/quarantine/${id}/approve`, {
      method: 'POST',
      body: { note },
    }),
  reject: (id: string, note?: string) =>
    request<QuarantineItem>(`/api/v1/quarantine/${id}/reject`, {
      method: 'POST',
      body: { note },
    }),
};
