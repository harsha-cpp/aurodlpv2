import type { Analytics, DailyTrendPoint } from "../api/events";
import { entityLabel } from "./entities";
import { senderLabel, toCsv } from "./format";
import { formatRisk } from "./risk";

export const SERIES = {
  allowed: "var(--series-allow)",
  warned: "var(--series-warn)",
  stopped: "var(--series-stop)",
} as const;

export type SeriesKey = keyof typeof SERIES;

export const SERIES_LABELS: Record<SeriesKey, string> = {
  allowed: "Allowed",
  warned: "Warned",
  stopped: "Stopped",
};

export function bucketOfAction(action: string): SeriesKey {
  if (action === "allow") return "allowed";
  if (action === "warn") return "warned";
  return "stopped";
}

export interface TrendDay {
  day: string;
  label: string;
  allowed: number;
  warned: number;
  stopped: number;
  total: number;
}

export function buildTrend(
  rows: DailyTrendPoint[],
  days: number,
  now = new Date(),
): TrendDay[] {
  const byDay = new Map<string, TrendDay>();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const span = Math.max(1, Math.min(days, 365));
  for (let i = span - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, {
      day: key,
      label: key.slice(5),
      allowed: 0,
      warned: 0,
      stopped: 0,
      total: 0,
    });
  }

  for (const row of rows) {
    const key = row.day.slice(0, 10);
    const entry = byDay.get(key) ?? {
      day: key,
      label: key.slice(5),
      allowed: 0,
      warned: 0,
      stopped: 0,
      total: 0,
    };
    entry[bucketOfAction(row.action)] += row.count;
    entry.total += row.count;
    byDay.set(key, entry);
  }

  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

export function interventionRate(
  data: Pick<
    Analytics,
    "total_scans" | "total_blocks" | "total_quarantines" | "total_escalations"
  >,
): number | null {
  if (data.total_scans <= 0) return null;
  return (
    ((data.total_blocks + data.total_quarantines + data.total_escalations) /
      data.total_scans) *
    100
  );
}

export function analyticsCsv(data: Analytics, days: number): string {
  const sections: string[] = [];

  sections.push(
    toCsv(
      ["metric", "value"],
      [
        ["window_days", days],
        ["total_scans", data.total_scans],
        ["total_allows", data.total_allows],
        ["total_warnings", data.total_warnings],
        ["total_blocks", data.total_blocks],
        ["total_quarantines", data.total_quarantines],
        ["total_escalations", data.total_escalations],
        ["unique_senders", data.unique_users],
        ["avg_risk_score_0_100", formatRisk(data.avg_risk_score)],
      ],
    ),
  );

  sections.push(
    toCsv(
      ["day", "action", "count"],
      data.daily_trend.map((row) => [row.day, row.action, row.count]),
    ),
  );

  sections.push(
    toCsv(
      ["entity_type", "entity_label", "detections"],
      data.top_entity_types.map((row) => [
        row.type,
        entityLabel(row.type),
        row.count,
      ]),
    ),
  );

  sections.push(
    toCsv(
      ["sender", "blocks"],
      data.top_users.map((row) => [senderLabel(row.email), row.blocks]),
    ),
  );

  sections.push(
    toCsv(
      [
        "timestamp",
        "sender",
        "action",
        "severity",
        "risk_score_0_100",
        "entity_types",
        "recipients",
      ],
      data.recent_events.map((e) => [
        e.timestamp,
        senderLabel(e.user_email),
        e.action,
        e.severity,
        formatRisk(e.risk_score),
        e.entities
          .map((x) => x.type ?? "")
          .filter(Boolean)
          .join(" | "),
        e.recipients.join(" | "),
      ]),
    ),
  );

  return sections.join("\r\n\r\n");
}
