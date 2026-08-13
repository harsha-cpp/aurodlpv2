// Shared PHI/PII detection — usable by Gmail body + attachment scanning.
import type { EntityHit } from "@aurodlpv2/shared";

interface PhiPattern {
  type: string;
  label: string;
  regex: RegExp;
  mask: (match: string) => string;
  confidence: number;
  validate?: (match: string) => boolean;
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const PAN_HOLDER_TYPES = new Set([
  "P",
  "C",
  "H",
  "A",
  "B",
  "G",
  "J",
  "L",
  "F",
  "T",
  "E",
]);
const COMMON_FAKE_PANS = new Set(["ABCDE1234F", "AAAAA0000A", "AAAAA1111A"]);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidAadhaar(value: string): boolean {
  const digits = digitsOnly(value);
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  if (/^(\d)\1{11}$/.test(digits)) return false;
  let checksum = 0;
  const reversed = digits
    .split("")
    .reverse()
    .map((d) => Number(d));
  for (let i = 0; i < reversed.length; i++) {
    checksum = VERHOEFF_D[checksum]![VERHOEFF_P[i % 8]![reversed[i]!]!]!;
  }
  return checksum === 0;
}

export function isValidPan(value: string): boolean {
  const pan = value.toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return false;
  if (COMMON_FAKE_PANS.has(pan)) return false;
  if (!PAN_HOLDER_TYPES.has(pan[3]!)) return false;
  if (/^([A-Z])\1{4}/.test(pan)) return false;
  if (
    pan.slice(0, 3) === pan.slice(0, 3).split("").sort().join("") &&
    pan.startsWith("ABC")
  ) {
    return false;
  }
  return true;
}

export const PHI_PATTERNS: PhiPattern[] = [
  {
    type: "IN_AADHAAR",
    label: "Aadhaar Number",
    regex: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    mask: (m) => m.replace(/\d(?=.{4})/g, "X"),
    confidence: 0.98,
    validate: isValidAadhaar,
  },
  {
    type: "IN_PAN",
    label: "PAN Card",
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    mask: (m) => m.slice(0, 2) + "***" + m.slice(-2),
    confidence: 0.9,
    validate: isValidPan,
  },
  {
    type: "ABHA_ID",
    label: "ABHA Health ID",
    regex: /\b\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    mask: (m) => m.replace(/\d(?=.{4})/g, "X"),
    confidence: 0.84,
  },
  {
    type: "ICD10_CODE",
    label: "ICD-10 Diagnosis Code",
    regex: /\b[A-Z]\d{2}(?:\.\d{1,4})?\b/g,
    mask: (m) => m,
    confidence: 0.72,
  },
  {
    type: "MRN",
    label: "Medical Record Number / UHID",
    regex:
      /\b(?:MRN|MR#?|UHID|Medical Record(?:\s*#)?)\s*[:.]?\s*([A-Z0-9-]{4,16})\b/gi,
    mask: () => "Record ID:***",
    confidence: 0.78,
  },
  {
    type: "PATIENT_DOB",
    label: "Patient Date of Birth",
    regex:
      /\b(?:patient\s+)?(?:DOB|date\s+of\s+birth)\s*[:.-]?\s*(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/gi,
    mask: () => "DOB:**/**/****",
    confidence: 0.88,
  },
  {
    type: "PATIENT_NAME",
    label: "Patient Name",
    regex:
      /\b(?:Patient(?:\s+Name)?|Pt\.?\s+Name)\s*[:.-]\s*([A-Z][A-Za-z'-]{1,39}(?:\s+[A-Z][A-Za-z'-]{1,39}){1,3})\b/g,
    mask: () => "Patient Name:***",
    confidence: 0.82,
  },
  {
    type: "PATIENT_EMAIL",
    label: "Patient Email Address",
    regex:
      /\b(?:patient\s+)?(?:email|e-mail)\s*[:.-]\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    mask: () => "Patient Email:***",
    confidence: 0.86,
  },
  {
    type: "IN_PHONE",
    label: "Indian Phone Number",
    regex: /\b(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g,
    mask: (m) => m.replace(/\d(?=.{4})/g, "*"),
    confidence: 0.65,
  },
];

// ICD-10 produces many false positives on short codes. Only flag if medical context hints present.
const MEDICAL_CONTEXT =
  /\b(diagnosis|diagnosed|patient|treatment|condition|disease|disorder|syndrome|ICD|medical|clinical|health|hospital)\b/i;

export type EntitySource = "body" | "subject" | "attachment";

export function phiLabel(type: string): string {
  return (
    PHI_PATTERNS.find((pattern) => pattern.type === type)?.label ??
    "Sensitive patient data"
  );
}

export function detectPhi(
  text: string,
  source: EntitySource = "body",
  attachmentId?: string,
): EntityHit[] {
  const hits: EntityHit[] = [];
  if (!text) return hits;
  for (const pattern of PHI_PATTERNS) {
    if (pattern.type === "ICD10_CODE" && !MEDICAL_CONTEXT.test(text)) continue;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (pattern.validate && !pattern.validate(match[0])) continue;
      if (
        pattern.type === "ABHA_ID" &&
        !/[\s-]/.test(match[0]) &&
        !MEDICAL_CONTEXT.test(text)
      )
        continue;
      const hit: EntityHit = {
        type: pattern.type,
        masked_value: pattern.mask(match[0]),
        confidence: pattern.confidence,
        source,
      };
      if (attachmentId) hit.attachment_id = attachmentId;
      hits.push(hit);
    }
  }
  return hits;
}

export function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? "";
}
