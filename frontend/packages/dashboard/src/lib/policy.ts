import type {
  PolicyRule,
  PolicySet,
  PolicySetIn,
  RuleConditions,
} from "../api/policy";
import { CLASS_LABELS } from "../api/policy";
import { entityLabel } from "./entities";
import { severityLabel, type Severity } from "./risk";

export const ORDER_STEP = 10;
export const MAX_RULES = 200;

export function renumber(rules: PolicyRule[]): PolicyRule[] {
  return rules.map((rule, i) => ({ ...rule, order: (i + 1) * ORDER_STEP }));
}

export function inEvaluationOrder(rules: PolicyRule[]): PolicyRule[] {
  return rules
    .map((rule, i) => ({ rule, i }))
    .sort((a, b) => a.rule.order - b.rule.order || a.i - b.i)
    .map(({ rule }) => rule);
}

export function moveRule(
  rules: PolicyRule[],
  index: number,
  direction: -1 | 1,
): PolicyRule[] {
  const target = index + direction;
  if (
    index < 0 ||
    index >= rules.length ||
    target < 0 ||
    target >= rules.length
  )
    return rules;
  const next = [...rules];
  const [moved] = next.splice(index, 1);
  if (!moved) return rules;
  next.splice(target, 0, moved);
  return renumber(next);
}

export function removeRule(rules: PolicyRule[], id: string): PolicyRule[] {
  return renumber(rules.filter((r) => r.id !== id));
}

export function updateRule(
  rules: PolicyRule[],
  id: string,
  patch: Partial<PolicyRule>,
): PolicyRule[] {
  return rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function newRule(existing: PolicyRule[]): PolicyRule {
  const taken = new Set(existing.map((r) => r.id));
  let n = existing.length + 1;
  let id = `custom-rule-${n}`;
  while (taken.has(id)) {
    n += 1;
    id = `custom-rule-${n}`;
  }
  return {
    id,
    description: "",
    enabled: true,
    order: (existing.length + 1) * ORDER_STEP,
    conditions: {},
    action: "warn",
    min_reported_severity: null,
    user_message: "",
  };
}

export function validateRules(rules: PolicyRule[]): string[] {
  const problems: string[] = [];
  if (rules.length === 0) problems.push("A policy needs at least one rule.");
  if (rules.length > MAX_RULES)
    problems.push(`A policy can hold at most ${MAX_RULES} rules.`);

  const seen = new Set<string>();
  for (const rule of rules) {
    const id = rule.id.trim();
    if (!id) problems.push("Every rule needs an id.");
    else if (seen.has(id))
      problems.push(
        `Duplicate rule id "${id}" - ids identify matches in scan verdicts.`,
      );
    seen.add(id);

    const { min_risk_score: min, max_risk_score: max } = rule.conditions;
    if (
      min !== null &&
      min !== undefined &&
      max !== null &&
      max !== undefined &&
      min > max
    ) {
      problems.push(
        `"${id}": minimum risk ${min} is above maximum risk ${max}, so it can never match.`,
      );
    }
  }

  if (rules.every((r) => !r.enabled)) {
    problems.push(
      "Every rule is disabled - nothing would ever match and every send would be allowed.",
    );
  }
  return problems;
}

export function toPolicySetIn(
  rules: PolicyRule[],
  version: string,
): PolicySetIn {
  return { version, rules: renumber(rules) };
}

export const CUSTOM_VERSION = "custom";

export function versionForSave(saved: PolicySet | undefined): string {
  if (!saved) return CUSTOM_VERSION;
  return saved.is_custom ? saved.version : CUSTOM_VERSION;
}

export function isDirty(
  saved: PolicySet | undefined,
  draft: PolicyRule[],
): boolean {
  if (!saved) return false;
  return stableJson(renumber(saved.rules)) !== stableJson(renumber(draft));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const record = val as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          const inner = record[k];
          if (
            inner !== undefined &&
            inner !== null &&
            !(Array.isArray(inner) && inner.length === 0)
          ) {
            acc[k] = inner;
          }
          return acc;
        }, {});
    }
    return val;
  });
}

export function describeConditions(conditions: RuleConditions): string[] {
  const out: string[] = [];
  const {
    entity_types_any,
    entity_types_all,
    min_entity_count,
    min_subject_count,
    min_risk_score,
    max_risk_score,
    min_severity,
    recipient_class_any,
    recipient_class_all,
    sender_class_any,
    has_attachments,
  } = conditions;

  if (entity_types_any?.length)
    out.push(`detects any of: ${entity_types_any.map(entityLabel).join(", ")}`);
  if (entity_types_all?.length)
    out.push(`detects all of: ${entity_types_all.map(entityLabel).join(", ")}`);
  if (min_entity_count != null)
    out.push(
      `at least ${min_entity_count} detection${min_entity_count === 1 ? "" : "s"}`,
    );
  if (min_subject_count != null)
    out.push(`at least ${min_subject_count} distinct patients`);
  if (min_risk_score != null) out.push(`risk ≥ ${min_risk_score}`);
  if (max_risk_score != null) out.push(`risk ≤ ${max_risk_score}`);
  if (min_severity)
    out.push(`severity ≥ ${severityLabel(min_severity as Severity)}`);
  if (recipient_class_any?.length) {
    out.push(
      `any recipient is ${recipient_class_any.map((c) => CLASS_LABELS[c]).join(" / ")}`,
    );
  }
  if (recipient_class_all?.length) {
    out.push(
      `every recipient is ${recipient_class_all.map((c) => CLASS_LABELS[c]).join(" / ")}`,
    );
  }
  if (sender_class_any?.length) {
    out.push(
      `sender is ${sender_class_any.map((c) => CLASS_LABELS[c]).join(" / ")}`,
    );
  }
  if (has_attachments === true) out.push("has attachments");
  if (has_attachments === false) out.push("has no attachments");

  if (out.length === 0) out.push("matches everything (catch-all)");
  return out;
}

export const ACTION_COPY: Record<PolicyRule["action"], string> = {
  allow: "Send goes out, no interruption.",
  warn: "User sees a warning and can send anyway.",
  block: "Send is refused.",
  quarantine: "Held for an analyst to approve or reject.",
  escalate: "Sent on, but flagged for review.",
};
