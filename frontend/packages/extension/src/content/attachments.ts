// Attachment scanning — TXT via FileReader, PDF via pdf.js. Runs before Gmail upload.
import { detectPhi } from './phi';
import type { EntityHit } from '@aurodlpv2/shared';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// pdf.js is dynamically imported so the main content bundle stays small.
let pdfLib: typeof import('pdfjs-dist') | null = null;

async function getPdfLib(): Promise<typeof import('pdfjs-dist')> {
  if (pdfLib) return pdfLib;
  pdfLib = await import('pdfjs-dist');
  // Point worker to the bundled file via chrome extension URL.
  pdfLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfLib;
}

async function extractTxt(file: File): Promise<string> {
  return file.text();
}

async function extractPdf(file: File): Promise<string> {
  const lib = await getPdfLib();
  const buffer = await file.arrayBuffer();
  const doc = await lib.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
  } as Parameters<typeof lib.getDocument>[0]).promise;

  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    parts.push(pageText);
  }
  await doc.destroy();
  return parts.join('\n');
}

export interface AttachmentScanResult {
  filename: string;
  entities: EntityHit[];
  error?: string;
}

export interface AttachmentUrlRef {
  url: string;
  name?: string | undefined;
  mimeType?: string | undefined;
}

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type === 'text/plain' || name.endsWith('.txt') || name.endsWith('.csv') || name.endsWith('.log')) {
    return extractTxt(file);
  }
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdf(file);
  }
  // Unsupported type — skip silently
  return '';
}

export async function scanAttachment(file: File): Promise<AttachmentScanResult> {
  try {
    const text = await extractText(file);
    if (!text) return { filename: file.name, entities: [] };
    const entities = detectPhi(text, 'attachment', file.name);
    return { filename: file.name, entities };
  } catch (err) {
    console.error(`[AURO] Attachment scan FAILED for ${file.name}:`, err);
    return { filename: file.name, entities: [], error: (err as Error).message };
  }
}

export async function scanAttachments(files: File[]): Promise<EntityHit[]> {
  if (files.length === 0) return [];
  const results = await Promise.all(files.map(scanAttachment));
  return results.flatMap((r) => r.entities);
}

async function fetchAttachmentRef(ref: AttachmentUrlRef): Promise<File | null> {
  try {
    const res = await fetch(ref.url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const name = ref.name?.trim() || `attachment-${Date.now()}`;
    const type = ref.mimeType || blob.type || 'application/octet-stream';
    return new File([blob], name, { type });
  } catch {
    return null;
  }
}

export async function scanAttachmentRefs(refs: AttachmentUrlRef[]): Promise<EntityHit[]> {
  if (refs.length === 0) return [];
  const fetched = await Promise.all(refs.map(fetchAttachmentRef));
  const files = fetched.filter((f): f is File => Boolean(f));
  return scanAttachments(files);
}

const MAX_BYTES = 25 * 1024 * 1024;

export function isScannable(file: File): boolean {
  if (file.size > MAX_BYTES) return false;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    type === 'text/plain' ||
    type === 'application/pdf' ||
    name.endsWith('.txt') ||
    name.endsWith('.csv') ||
    name.endsWith('.log') ||
    name.endsWith('.pdf')
  );
}
