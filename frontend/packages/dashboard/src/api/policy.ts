import { request } from '../lib/api';
import type { PolicyAction, Severity } from '../lib/risk';

export type RecipientClass =
  | 'internal'
  | 'approved_partner'
  | 'blocked'
  | 'external'
  | 'public_email'
  | 'unknown';

/** A sender is never 'blocked' — that classification only applies to recipients. */
export type SenderClass = 'internal' | 'approved_partner' | 'external' | 'public_email' | 'unknown';

export const RECIPIENT_CLASSES: readonly RecipientClass[] = [
  'internal',
  'approved_partner',
  'blocked',
  'external',
  'public_email',
  'unknown',
];

export const SENDER_CLASSES: readonly SenderClass[] = [
  'internal',
  'approved_partner',
  'external',
  'public_email',
  'unknown',
];

export const CLASS_LABELS: Record<RecipientClass, string> = {
  internal: 'Internal',
  approved_partner: 'Approved partner',
  blocked: 'Blocked domain',
  external: 'External',
  public_email: 'Personal mailbox',
  unknown: 'Unknown',
};

export interface RuleConditions {
  entity_types_any?: string[];
  entity_types_all?: string[];
  min_entity_count?: number | null;
  min_subject_count?: number | null;
  min_risk_score?: number | null;
  max_risk_score?: number | null;
  min_severity?: Severity | null;
  recipient_class_any?: RecipientClass[];
  recipient_class_all?: RecipientClass[];
  sender_class_any?: SenderClass[];
  has_attachments?: boolean | null;
}

export interface PolicyRule {
  id: string;
  description: string;
  enabled: boolean;
  order: number;
  conditions: RuleConditions;
  action: PolicyAction;
  min_reported_severity: Severity | null;
  user_message: string;
}

export interface PolicySet {
  version: string;
  rules: PolicyRule[];
  is_custom: boolean;
}

export interface PolicySetIn {
  version: string;
  rules: PolicyRule[];
}

export interface SimulationEntity {
  type: string;
  masked_value?: string;
}

export interface SimulationRequest {
  entities: SimulationEntity[];
  risk_score: number;
  severity: Severity;
  recipient_classes: RecipientClass[];
  sender_class: SenderClass;
  has_attachments: boolean;
  /** Unsaved rules to evaluate instead of the stored set. */
  candidate?: PolicySetIn | null;
}

export interface SimulationResponse {
  action: PolicyAction;
  severity: Severity;
  risk_score: number;
  matched_policy_ids: string[];
  user_message: string;
}

export const policyApi = {
  get: () => request<PolicySet>('/api/v1/policy'),
  defaults: () => request<PolicySet>('/api/v1/policy/defaults'),
  replace: (body: PolicySetIn) => request<PolicySet>('/api/v1/policy', { method: 'PUT', body }),
  reset: () => request<PolicySet>('/api/v1/policy/reset', { method: 'POST' }),
  simulate: (body: SimulationRequest) =>
    request<SimulationResponse>('/api/v1/policy/simulate', { method: 'POST', body }),
};
