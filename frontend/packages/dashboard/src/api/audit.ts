import { request } from '../lib/api';

export interface AuditEvent {
  id: string;
  actor: string;
  category: string;
  action: string;
  metadata: Record<string, unknown>;
  /** Null only for the very first event in an organization's log. */
  previous_hash: string | null;
  event_hash: string;
  created_at: string;
}

export interface AuditPage {
  events: AuditEvent[];
  /** Opaque. Pass back as `cursor` for the next page; null means the end. */
  next_cursor: string | null;
}

/**
 * Server-side verification of the whole chain.
 *
 * The client can only ever check continuity within the rows it happens to have
 * loaded, which is not a tamper-evidence claim worth making to an auditor.
 */
export interface ChainStatus {
  ok: boolean;
  checked: number;
  broken_at: number | null;
  detail: string | null;
}

export interface AuditQuery {
  search?: string | undefined;
  category?: string | undefined;
  actor?: string | undefined;
  action?: string | undefined;
  since?: string | undefined;
  until?: string | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

export const auditApi = {
  list: (query: AuditQuery = {}) =>
    request<AuditPage>('/api/v1/audit', {
      query: {
        search: query.search?.trim() || undefined,
        category: query.category || undefined,
        actor: query.actor?.trim() || undefined,
        action: query.action || undefined,
        since: query.since || undefined,
        until: query.until || undefined,
        cursor: query.cursor || undefined,
        limit: query.limit ?? 50,
      },
    }),

  /** Distinct categories, so the filter offers only what actually exists. */
  categories: () => request<string[]>('/api/v1/audit/categories'),

  chain: () => request<ChainStatus>('/api/v1/audit/chain'),
};
