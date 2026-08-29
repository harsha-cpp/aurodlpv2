import type { EntityHit, Severity, Verdict } from "@aurodlpv2/shared";
import { scorePhi } from "./phi";

export interface OrgPolicy {
  approvedDomains: Set<string>;
  approvedEmails: Set<string>;
  blockedDomains: Set<string>;
  failOpen: boolean;
  hasConfig: boolean;
}

export type PolicyReadiness = "ready" | "no-allowlist" | "no-config";

export function emptyPolicy(): OrgPolicy {
  return {
    approvedDomains: new Set(),
    approvedEmails: new Set(),
    blockedDomains: new Set(),
    failOpen: false,
    hasConfig: false,
  };
}

export function policyReadiness(policy: OrgPolicy): PolicyReadiness {
  if (!policy.hasConfig) return "no-config";
  if (policy.approvedDomains.size === 0 && policy.approvedEmails.size === 0)
    return "no-allowlist";
  return "ready";
}

export function recipientAddress(addr: string): string {
  return addr
    .replace(/^.*<|>.*$/g, "")
    .trim()
    .toLowerCase();
}

export function recipientDomain(addr: string): string {
  const cleaned = recipientAddress(addr);
  const at = cleaned.lastIndexOf("@");
  if (at < 0) return "";
  return cleaned.slice(at + 1).trim();
}

function domainMatches(domain: string, list: Set<string>): boolean {
  if (!domain) return false;
  for (const entry of list) {
    if (domain === entry) return true;
    if (domain.endsWith("." + entry)) return true;
  }
  return false;
}

export function isRecipientApproved(addr: string, policy: OrgPolicy): boolean {
  if (policyReadiness(policy) !== "ready") return false;
  if (policy.approvedEmails.has(recipientAddress(addr))) return true;
  return domainMatches(recipientDomain(addr), policy.approvedDomains);
}

export function isRecipientBlocked(addr: string, policy: OrgPolicy): boolean {
  return domainMatches(recipientDomain(addr), policy.blockedDomains);
}

export interface RecipientSplit {
  approved: string[];
  unapproved: string[];
  blocked: string[];
}

export function classifyRecipients(
  recipients: string[],
  policy: OrgPolicy,
): RecipientSplit {
  const split: RecipientSplit = { approved: [], unapproved: [], blocked: [] };
  for (const raw of recipients) {
    const addr = recipientAddress(raw);
    if (!addr) continue;
    if (isRecipientBlocked(raw, policy)) split.blocked.push(addr);
    else if (isRecipientApproved(raw, policy)) split.approved.push(addr);
    else split.unapproved.push(addr);
  }
  return split;
}

export interface LocalVerdictInput {
  entities: EntityHit[];
  recipients: string[];
  policy: OrgPolicy;
  unscannedAttachments?: number;
}

const NO_CONFIG_MESSAGE =
  "Auro has no policy configuration for this account, so the recipients could not be checked. " +
  "Connect the extension to your organization (or reconnect if the dashboard is unreachable) before sending sensitive data.";
const NO_ALLOWLIST_MESSAGE =
  "This organization has no approved recipient domains configured, so the recipients could not be checked. " +
  "Ask your administrator to add the approved domains before sending sensitive data.";

export function buildLocalVerdict(input: LocalVerdictInput): Verdict {
  const { entities, recipients, policy } = input;
  const unscanned = input.unscannedAttachments ?? 0;
  const readiness = policyReadiness(policy);
  const split = classifyRecipients(recipients, policy);

  if (split.blocked.length > 0) {
    return verdict({
      action: "block",
      severity: "high",
      risk: 90,
      policyIds: ["blocked-recipient-domain"],
      entities,
      message: `Blocked: recipient${split.blocked.length > 1 ? "s" : ""} [${split.blocked.join(", ")}] ${
        split.blocked.length > 1 ? "are" : "is"
      } on this organization's blocked list.`,
    });
  }

  if (entities.length === 0 && unscanned === 0) {
    return verdict({
      action: "allow",
      severity: "none",
      risk: 0,
      policyIds: [],
      entities: [],
      message: "",
    });
  }

  const scored =
    entities.length > 0
      ? scorePhi(entities)
      : { risk: 40, severity: "medium" as Severity };
  const types = [...new Set(entities.map((e) => e.type))];
  const unscannedNote =
    unscanned > 0
      ? ` ${unscanned} attachment${unscanned > 1 ? "s" : ""} on this draft could not be read for scanning.`
      : "";

  if (readiness !== "ready") {
    const reason =
      readiness === "no-config" ? NO_CONFIG_MESSAGE : NO_ALLOWLIST_MESSAGE;
    const found =
      types.length > 0 ? `Sensitive data detected (${types.join(", ")}). ` : "";

    if (policy.failOpen) {
      return verdict({
        action: "allow",
        severity: scored.severity,
        risk: scored.risk,
        policyIds: ["unverified-recipients-fail-open"],
        entities,
        message: `${found}${reason}${unscannedNote} Your organization has opted to allow sending in this state.`,
      });
    }

    return verdict({
      action: "warn",
      severity: scored.severity,
      risk: scored.risk,
      policyIds: [
        readiness === "no-config"
          ? "unverified-recipients-no-config"
          : "unverified-recipients-no-allowlist",
      ],
      entities,
      message: `${found}${reason}${unscannedNote}`,
    });
  }

  if (recipients.length === 0) {
    return verdict({
      action: "warn",
      severity: scored.severity,
      risk: scored.risk,
      policyIds: ["unverified-recipients-none-listed"],
      entities,
      message: `Sensitive data detected (${types.join(", ")}) but no recipient could be read from this draft.${unscannedNote}`,
    });
  }

  if (split.unapproved.length > 0) {
    return verdict({
      action: "block",
      severity: scored.severity,
      risk: scored.risk,
      policyIds: ["local-phi-policy"],
      entities,
      message: `This email contains sensitive data (${types.join(", ")}). Blocked because recipient${
        split.unapproved.length > 1 ? "s" : ""
      } [${split.unapproved.join(", ")}] ${split.unapproved.length > 1 ? "are" : "is"} not on your approved list.${unscannedNote}`,
    });
  }

  if (unscanned > 0) {
    return verdict({
      action: "warn",
      severity: scored.severity,
      risk: scored.risk,
      policyIds: ["unscannable-attachment"],
      entities,
      message: `${unscanned} attachment${unscanned > 1 ? "s" : ""} on this draft could not be read for scanning, so ${
        unscanned > 1 ? "they were" : "it was"
      } not checked for patient data.`,
    });
  }

  return verdict({
    action: "allow",
    severity: scored.severity,
    risk: scored.risk,
    policyIds: ["local-phi-policy"],
    entities,
    message: `Sensitive data detected (${types.join(", ")}) but all recipients are on the approved list - allowed.`,
  });
}

export function withUnscannedAttachments(
  input: Verdict,
  count: number,
): Verdict {
  if (count <= 0 || input.action !== "allow") return input;
  return {
    ...input,
    action: "warn",
    severity: input.severity === "none" ? "medium" : input.severity,
    matched_policy_ids: [
      ...new Set([...input.matched_policy_ids, "unscannable-attachment"]),
    ],
    user_message: `${count} attachment${count > 1 ? "s" : ""} on this draft could not be read for scanning, so ${
      count > 1 ? "they were" : "it was"
    } not checked for patient data.`,
  };
}

export function degradedVerdict(input: Verdict): Verdict {
  const message =
    input.action === "allow"
      ? input.user_message
      : `Backend scan unavailable. Local fallback result: ${input.user_message}`;
  return {
    ...input,
    degraded: true,
    matched_policy_ids: [
      ...new Set([
        ...input.matched_policy_ids,
        "backend-degraded-local-fallback",
      ]),
    ],
    user_message: message,
  };
}

function verdict(input: {
  action: Verdict["action"];
  severity: Severity;
  risk: number;
  policyIds: string[];
  entities: EntityHit[];
  message: string;
}): Verdict {
  return {
    scan_id: newScanId(),
    action: input.action,
    severity: input.severity,
    risk_score: input.risk,
    matched_policy_ids: input.policyIds,
    entities: input.entities,
    recipients: [],
    user_message: input.message,
    created_at: new Date().toISOString(),
  };
}

function newScanId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
