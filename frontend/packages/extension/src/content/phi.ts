// Shared PHI/PII detection — usable by Gmail body + attachment scanning.
import type { EntityHit } from '@aurodlpv2/shared';

interface PhiPattern {
  type: string;
  label: string;
  regex: RegExp;
  mask: (match: string) => string;
}

export const PHI_PATTERNS: PhiPattern[] = [
  {
    type: 'IN_AADHAAR',
    label: 'Aadhaar Number',
    regex: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    mask: (m) => m.replace(/\d(?=.{4})/g, 'X'),
  },
  {
    type: 'IN_PAN',
    label: 'PAN Card',
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    mask: (m) => m.slice(0, 2) + '***' + m.slice(-2),
  },
  {
    type: 'ABHA_ID',
    label: 'ABHA Health ID',
    regex: /\b\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    mask: (m) => m.replace(/\d(?=.{4})/g, 'X'),
  },
  {
    type: 'ICD10_CODE',
    label: 'ICD-10 Diagnosis Code',
    regex: /\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b/g,
    mask: (m) => m,
  },
  {
    type: 'MRN',
    label: 'Medical Record Number',
    regex: /\b(?:MRN|MR#?|Medical Record(?:\s*#)?)\s*[:.]?\s*([A-Z0-9]{4,12})\b/gi,
    mask: () => 'MRN:***',
  },
  {
    type: 'IN_PHONE',
    label: 'Indian Phone Number',
    regex: /\b(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g,
    mask: (m) => m.replace(/\d(?=.{4})/g, '*'),
  },
];

// ICD-10 produces many false positives on short codes. Only flag if medical context hints present.
const MEDICAL_CONTEXT =
  /\b(diagnosis|diagnosed|patient|treatment|condition|disease|disorder|syndrome|ICD|medical|clinical|health|hospital)\b/i;

export type EntitySource = 'body' | 'subject' | 'attachment';

export function detectPhi(text: string, source: EntitySource = 'body', attachmentId?: string): EntityHit[] {
  const hits: EntityHit[] = [];
  if (!text) return hits;
  for (const pattern of PHI_PATTERNS) {
    if (pattern.type === 'ICD10_CODE' && !MEDICAL_CONTEXT.test(text)) continue;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const hit: EntityHit = {
        type: pattern.type,
        masked_value: pattern.mask(match[0]),
        confidence: 0.85,
        source,
      };
      if (attachmentId) hit.attachment_id = attachmentId;
      hits.push(hit);
    }
  }
  return hits;
}

export function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent ?? '';
}
