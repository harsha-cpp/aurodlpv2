import {
  detect,
  scoreEntities,
  type DetectedEntity,
  type EntitySource,
} from "@aurodlpv2/shared";
import type { EntityHit, Severity } from "@aurodlpv2/shared";

export type { EntitySource };

export function detectPhi(
  text: string,
  source: EntitySource = "body",
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

export function scorePhi(entities: EntityHit[]): {
  risk: number;
  severity: Severity;
} {
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

export function stripHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.body.textContent ?? "";
}
