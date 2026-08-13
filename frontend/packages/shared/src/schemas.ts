import { z } from 'zod';

export const actionSchema = z.enum(['allow', 'warn', 'block', 'quarantine', 'escalate']);
export const severitySchema = z.enum(['none', 'low', 'medium', 'high', 'critical']);
export const recipientClassSchema = z.enum([
  'internal',
  'approved_partner',
  'external',
  'public_email',
  'unknown',
]);

export const entityHitSchema = z.object({
  type: z.string(),
  masked_value: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['body', 'subject', 'attachment']),
  attachment_id: z.string().optional(),
});

export const recipientHitSchema = z.object({
  email: z.string().email(),
  classification: recipientClassSchema,
});

export const verdictSchema = z.object({
  scan_id: z.string(),
  action: actionSchema,
  severity: severitySchema,
  risk_score: z.number(),
  matched_policy_ids: z.array(z.string()),
  entities: z.array(entityHitSchema),
  recipients: z.array(recipientHitSchema),
  user_message: z.string(),
  created_at: z.string(),
  quarantine_id: z.string().nullable().optional(),
  degraded: z.boolean().optional(),
});

export const attachmentUploadResultSchema = z.object({
  attachment_scan_id: z.string(),
  status: z.enum(['scanned', 'queued', 'failed']),
  verdict: verdictSchema.nullable().optional(),
  error: z.string().nullable().optional(),
});

export const authTokensSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.literal('Bearer'),
});

export const userProfileSchema = z.object({
  user_id: z.string(),
  email: z.string().email(),
  name: z.string(),
  workspace_id: z.string(),
  role: z.enum(['user', 'analyst', 'admin', 'super_admin']),
});
