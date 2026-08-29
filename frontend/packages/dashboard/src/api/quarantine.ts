import { request } from "../lib/api";
import type { Severity } from "../lib/risk";

export type QuarantineStatus = "pending" | "approved" | "rejected";

export interface QuarantineEntity {
  type?: string;
  masked_value?: string;
  confidence?: number;
  source?: string;
  attachment_id?: string | null;
}

export interface AttachmentRef {
  filename?: string;
  attachment_id?: string;
  content_type?: string;
  size_bytes?: number;
}

export interface QuarantineItem {
  id: string;
  scan_id: string;
  client_scan_id: string;
  sender: string;
  subject: string;
  recipients: string[];
  entities: QuarantineEntity[];
  matched_policy_ids: string[];
  risk_score: number;
  severity: Severity;
  status: QuarantineStatus;
  analyst_id: string | null;
  analyst_note: string | null;
  decided_at: string | null;
  attachment_refs: AttachmentRef[];
  created_at: string;
  updated_at: string;
}

export const QUARANTINE_STATUSES: readonly QuarantineStatus[] = [
  "pending",
  "approved",
  "rejected",
];

export const quarantineApi = {
  list: (status: QuarantineStatus | "all" = "pending", limit = 100) => {
    if (status === "all") {
      return Promise.all(
        QUARANTINE_STATUSES.map((s) =>
          request<QuarantineItem[]>("/api/v1/quarantine", {
            query: { status: s, limit },
          }),
        ),
      ).then((groups) =>
        groups.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
    }
    return request<QuarantineItem[]>("/api/v1/quarantine", {
      query: { status, limit },
    });
  },
  get: (id: string) => request<QuarantineItem>(`/api/v1/quarantine/${id}`),
  approve: (id: string, note?: string) =>
    request<QuarantineItem>(`/api/v1/quarantine/${id}/approve`, {
      method: "POST",
      body: { note: note ?? null },
    }),
  reject: (id: string, note?: string) =>
    request<QuarantineItem>(`/api/v1/quarantine/${id}/reject`, {
      method: "POST",
      body: { note: note ?? null },
    }),
};
