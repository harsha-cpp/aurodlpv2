import { request } from '../lib/api';

export interface EntityTypeCount {
  type: string;
  count: number;
}

export interface UserBlockCount {
  /** Null when the send could not be attributed to a mailbox. */
  email: string | null;
  blocks: number;
}

export interface DailyTrendPoint {
  day: string;
  action: string;
  count: number;
}

export interface RecentEventEntity {
  type?: string;
  masked_value?: string;
  confidence?: number;
}

export interface RecentEvent {
  /** Null when the send could not be attributed to a mailbox. */
  user_email: string | null;
  action: string;
  severity: string;
  risk_score: number;
  entities: RecentEventEntity[];
  recipients: string[];
  timestamp: string;
}

export interface Analytics {
  total_scans: number;
  total_blocks: number;
  total_allows: number;
  total_warnings: number;
  total_quarantines: number;
  total_escalations: number;
  unique_users: number;
  /** 0-100, same scale as every other risk number in the product. */
  avg_risk_score: number;
  top_entity_types: EntityTypeCount[];
  top_users: UserBlockCount[];
  daily_trend: DailyTrendPoint[];
  recent_events: RecentEvent[];
}

export const eventsApi = {
  analytics: (days = 30) => request<Analytics>('/api/v1/events/analytics', { query: { days } }),
};
