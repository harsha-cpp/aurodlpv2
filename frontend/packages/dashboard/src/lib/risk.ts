/**
 * Risk is a real 0-100 scale (backend: `100 * (1 - exp(-weight / K))`), not the
 * old log-scale 0-7 blended with policy constants. Every surface that shows a
 * number must agree on the buckets or "avg risk score" means nothing again.
 */

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export const SEVERITIES: readonly Severity[] = ['none', 'low', 'medium', 'high', 'critical'];

/** Upper bound (exclusive) of each bucket, mirroring detection/scoring/weights.py. */
const BUCKETS: ReadonlyArray<readonly [number, Severity]> = [
  [1, 'none'],
  [30, 'low'],
  [55, 'medium'],
  [78, 'high'],
];

export const RISK_MIN = 0;
export const RISK_MAX = 100;

export function severityOf(score: number): Severity {
  if (!Number.isFinite(score)) return 'none';
  for (const [cutoff, label] of BUCKETS) {
    if (score < cutoff) return label;
  }
  return 'critical';
}

export function severityRank(severity: Severity): number {
  const i = SEVERITIES.indexOf(severity);
  return i === -1 ? 0 : i;
}

/** Coerce a server-supplied severity string; unknown values degrade to 'none'. */
export function asSeverity(value: string | null | undefined): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : 'none';
}

export function severityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/**
 * One decimal is the most the scale can honestly carry, and a whole number
 * reads better on a stat tile. Non-numeric input renders as an em dash rather
 * than "NaN" — an absent score is not a zero score.
 */
export function formatRisk(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return '—';
  const clamped = Math.min(RISK_MAX, Math.max(RISK_MIN, score));
  return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1);
}

/** "72 / 100 · High" — the denominator stops anyone reading 72 as a 0-7 score. */
export function formatRiskWithScale(score: number | null | undefined): string {
  const value = formatRisk(score);
  if (value === '—') return value;
  return `${value} / 100`;
}

export type PolicyAction = 'allow' | 'warn' | 'block' | 'quarantine' | 'escalate';

export const POLICY_ACTIONS: readonly PolicyAction[] = [
  'allow',
  'warn',
  'block',
  'quarantine',
  'escalate',
];

/** Anything that is not a silent pass — used to pick the alarming pill style. */
export function isRestrictiveAction(action: string): boolean {
  return action !== 'allow';
}
