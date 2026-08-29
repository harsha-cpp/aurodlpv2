import { request } from "../lib/api";
import type { Channel } from "../lib/channel";

export interface EntityTypeCount {
  type: string;
  count: number;
}

export interface UserBlockCount {
  email: string | null;
  blocks: number;
}

export interface SiteBlockCount {
  site_host: string;
  count: number;
}

export interface ChannelCountsResponse {
  email: number;
  web: number;
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
  user_email: string | null;
  action: string;
  channel: Channel;
  site_host: string | null;
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
  avg_risk_score: number;
  by_channel: ChannelCountsResponse;
  top_entity_types: EntityTypeCount[];
  top_sites: SiteBlockCount[];
  top_users: UserBlockCount[];
  daily_trend: DailyTrendPoint[];
  recent_events: RecentEvent[];
}

export const eventsApi = {
  analytics: (days = 30) =>
    request<Analytics>("/api/v1/events/analytics", { query: { days } }),
};
