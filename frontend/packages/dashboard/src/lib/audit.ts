import type { AuditEvent } from "../api/audit";
import { toCsv } from "./format";

export const AUDIT_CATEGORIES = [
  "auth",
  "device",
  "members",
  "org",
  "policy",
  "quarantine",
  "scan",
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  auth: "Sign-in & sessions",
  device: "Devices",
  members: "Members",
  org: "Organization",
  policy: "Policy",
  quarantine: "Quarantine decisions",
  scan: "Scans",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function actionLabel(action: string): string {
  const words = action.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type ChainState = "root" | "linked" | "broken" | "unverifiable";

export function verifyChain(
  rows: AuditEvent[],
  contiguous: boolean,
): ChainState[] {
  return rows.map((row, i) => {
    if (row.previous_hash === null) return "root";
    if (!contiguous) return "unverifiable";
    const predecessor = rows[i + 1];
    if (!predecessor) return "unverifiable";
    return predecessor.event_hash === row.previous_hash ? "linked" : "broken";
  });
}

export const CHAIN_COPY: Record<ChainState, string> = {
  root: "First event in this organization's log - nothing precedes it.",
  linked:
    "Hash matches the event immediately before it. Nothing was removed between them.",
  broken:
    "Hash does not match the event before it. This log may have been altered.",
  unverifiable:
    "Not checked - continuity can only be verified on an unfiltered list.",
};

export interface AuditFilter {
  category: string;
  actor: string;
}

export function applyFilters(
  rows: AuditEvent[],
  filter: AuditFilter,
): AuditEvent[] {
  const actor = filter.actor.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.category && row.category !== filter.category) return false;
    if (actor && !row.actor.toLowerCase().includes(actor)) return false;
    return true;
  });
}

export function distinctActors(rows: AuditEvent[]): string[] {
  return Array.from(new Set(rows.map((r) => r.actor))).sort();
}

export function auditCsv(rows: AuditEvent[]): string {
  return toCsv(
    [
      "created_at",
      "category",
      "action",
      "actor",
      "event_hash",
      "previous_hash",
      "metadata",
    ],
    rows.map((r) => [
      r.created_at,
      r.category,
      r.action,
      r.actor,
      r.event_hash,
      r.previous_hash ?? "",
      JSON.stringify(r.metadata),
    ]),
  );
}
