// Offline fallback detection.
//
// This used to be a second, hand-written set of regexes that drifted from the
// server: different entity names (ABHA_ID vs ABHA_NUMBER), different
// confidences, different policy. The same message got a different verdict
// depending on whether the backend answered. It now runs the rule pack exported
// from the Python engine, so the two agree by construction.
//
// The fallback is still weaker than the server on purpose: it has no spaCy NER
// and only category-level ICD-10 validation. It is what runs when the backend
// is unreachable, not a replacement for it.
import { detect, scoreEntities, type DetectedEntity, type EntitySource } from '@aurodlpv2/shared';
import type { EntityHit, Severity } from '@aurodlpv2/shared';

export type { EntitySource };

export function detectPhi(
  text: string,
  source: EntitySource = 'body',
  attachmentId?: string,
): EntityHit[] {
  return detect(text, source, attachmentId).map(toEntityHit);
}

function toEntityHit(entity: DetectedEntity): EntityHit {
  const hit: EntityHit = {
    type: entity.type,
    masked_value: entity.masked_value,
    confidence: entity.confidence,
    source: entity.source,
  };
  if (entity.attachment_id) hit.attachment_id = entity.attachment_id;
  return hit;
}

export function scorePhi(entities: EntityHit[]): { risk: number; severity: Severity } {
  return scoreEntities(
    entities.map((hit) => ({
      type: hit.type,
      masked_value: hit.masked_value,
      confidence: hit.confidence,
      source: hit.source,
      attachment_id: hit.attachment_id,
      start: 0,
      end: 0,
    })),
  );
}

/**
 * Extract text from an HTML fragment without executing anything in it.
 *
 * The previous implementation assigned untrusted mail HTML to innerHTML on a
 * detached div. Chrome still fires <img onerror> for detached nodes, so that
 * was script execution in the content script's isolated world driven by
 * whatever an attacker put in an email. DOMParser is inert.
 */
export function stripHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return parsed.body.textContent ?? '';
}
