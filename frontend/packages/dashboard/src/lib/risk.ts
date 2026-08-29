export type Severity = "none" | "low" | "medium" | "high" | "critical";

export const SEVERITIES: readonly Severity[] = [
  "none",
  "low",
  "medium",
  "high",
  "critical",
];

const BUCKETS: ReadonlyArray<readonly [number, Severity]> = [
  [1, "none"],
  [30, "low"],
  [55, "medium"],
  [78, "high"],
];

export const RISK_MIN = 0;
export const RISK_MAX = 100;

export function severityOf(score: number): Severity {
  if (!Number.isFinite(score)) return "none";
  for (const [cutoff, label] of BUCKETS) {
    if (score < cutoff) return label;
  }
  return "critical";
}

export function severityRank(severity: Severity): number {
  const i = SEVERITIES.indexOf(severity);
  return i === -1 ? 0 : i;
}

export function asSeverity(value: string | null | undefined): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : "none";
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function formatRisk(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score))
    return "-";
  const clamped = Math.min(RISK_MAX, Math.max(RISK_MIN, score));
  return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1);
}

export function formatRiskWithScale(score: number | null | undefined): string {
  const value = formatRisk(score);
  if (value === "-") return value;
  return `${value} / 100`;
}

export type PolicyAction =
  | "allow"
  | "warn"
  | "block"
  | "quarantine"
  | "escalate";

export const POLICY_ACTIONS: readonly PolicyAction[] = [
  "allow",
  "warn",
  "block",
  "quarantine",
  "escalate",
];

export function isRestrictiveAction(action: string): boolean {
  return action !== "allow";
}
