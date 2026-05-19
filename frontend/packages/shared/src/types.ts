export type Action = 'allow' | 'warn' | 'block' | 'quarantine' | 'escalate';
export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type RecipientClass =
  | 'internal'
  | 'approved_partner'
  | 'external'
  | 'public_email'
  | 'unknown';

export interface EntityHit {
  type: string;
  masked_value: string;
  confidence: number;
  source: 'body' | 'subject' | 'attachment';
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
}

export interface ScanEmailPayload {
  subject: string;
  body: string;
  recipients: string[];
}

export interface AttachmentUploadResult {
  scan_id: string;
  status: 'scanned' | 'queued';
  filename: string;
  size_bytes: number;
  mime_type: string;
}

export interface ScanFinalizePayload {
  scan_id: string;
  attachment_scan_ids: string[];
}

export interface AuthTokens {
  access_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

export interface UserProfile {
  user_id: string;
  email: string;
  name: string;
  workspace_id: string;
  role: 'user' | 'analyst' | 'admin' | 'super_admin';
}
