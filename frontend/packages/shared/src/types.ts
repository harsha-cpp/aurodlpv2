export type Action = "allow" | "warn" | "block" | "quarantine" | "escalate";
export type Severity = "none" | "low" | "medium" | "high" | "critical";
export type RecipientClass =
  | "internal"
  | "approved_partner"
  | "blocked"
  | "external"
  | "public_email"
  | "unknown";

export interface EntityHit {
  type: string;
  masked_value: string;
  confidence: number;
  source: "body" | "subject" | "attachment";
  attachment_id?: string | undefined;
}

export interface RecipientHit {
  email: string;
  classification: RecipientClass;
}

export interface Verdict {
  scan_id: string;
  action: Action;
  severity: Severity;
  risk_score: number;
  matched_policy_ids: string[];
  entities: EntityHit[];
  recipients: RecipientHit[];
  user_message: string;
  created_at: string;
  quarantine_id?: string | null | undefined;
  degraded?: boolean | undefined;
}

export interface ScanEmailPayload {
  org_code: string;
  client_scan_id: string;
  subject: string;
  body: string;
  recipients: string[];
  user_email?: string | undefined;
}

export interface AttachmentUploadResult {
  attachment_scan_id: string;
  status: "scanned" | "queued" | "failed";
  verdict?: Verdict | null | undefined;
  error?: string | null | undefined;
}

export interface ScanFinalizePayload {
  org_code: string;
  client_scan_id: string;
  subject: string;
  body: string;
  recipients: string[];
  user_email?: string | undefined;
  attachment_scan_ids: string[];
}

export interface AuthTokens {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";
}

export type MemberRole = "owner" | "admin" | "analyst" | "viewer";

export interface UserProfile {
  user_id: string;
  email: string;
  name: string;
  org_id: string;
  role: MemberRole;
}
