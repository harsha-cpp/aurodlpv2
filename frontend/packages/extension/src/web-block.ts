import type { Severity } from "@aurodlpv2/shared";

export const WEB_BLOCK_MESSAGE = "WEB_BLOCK";

export interface WebBlockEntity {
  type: string;
  confidence: number;
  masked_value: string;
}

export interface WebBlockReport {
  type: typeof WEB_BLOCK_MESSAGE;
  site_host: string;
  entities: WebBlockEntity[];
  risk_score: number;
  severity: Severity;
  reason: "sensitive-data" | "inspection-limit";
}

export function webBlockKey(report: WebBlockReport): string {
  const types = [...new Set(report.entities.map((e) => e.type))]
    .sort()
    .join(",");
  return `${report.site_host}|${report.reason}|${types}`;
}
