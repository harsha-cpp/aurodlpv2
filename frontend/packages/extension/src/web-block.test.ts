import { describe, expect, it } from "vitest";
import {
  WEB_BLOCK_MESSAGE,
  webBlockKey,
  type WebBlockReport,
} from "./web-block";

function report(overrides: Partial<WebBlockReport> = {}): WebBlockReport {
  return {
    type: WEB_BLOCK_MESSAGE,
    site_host: "chatgpt.com",
    entities: [
      { type: "IN_AADHAAR", confidence: 0.98, masked_value: "XXXX XXXX 7460" },
    ],
    risk_score: 82,
    severity: "high",
    reason: "sensitive-data",
    ...overrides,
  };
}

describe("web block reports", () => {
  it("collapses repeats of the same finding on the same site", () => {
    expect(webBlockKey(report())).toBe(webBlockKey(report()));
  });

  it("separates different sites", () => {
    expect(webBlockKey(report())).not.toBe(
      webBlockKey(report({ site_host: "gemini.google.com" })),
    );
  });

  it("separates different findings on one site", () => {
    const other = report({
      entities: [
        { type: "MRN", confidence: 0.9, masked_value: "MRN-----9931" },
      ],
    });
    expect(webBlockKey(report())).not.toBe(webBlockKey(other));
  });

  it("ignores entity order so the key is stable", () => {
    const a = report({
      entities: [
        { type: "MRN", confidence: 0.9, masked_value: "MRN-----9931" },
        {
          type: "IN_AADHAAR",
          confidence: 0.98,
          masked_value: "XXXX XXXX 7460",
        },
      ],
    });
    const b = report({
      entities: [
        {
          type: "IN_AADHAAR",
          confidence: 0.98,
          masked_value: "XXXX XXXX 7460",
        },
        { type: "MRN", confidence: 0.9, masked_value: "MRN-----9931" },
      ],
    });
    expect(webBlockKey(a)).toBe(webBlockKey(b));
  });

  it("separates an inspection limit from a detection on the same site", () => {
    const limit = report({ reason: "inspection-limit", entities: [] });
    expect(webBlockKey(report())).not.toBe(webBlockKey(limit));
  });

  it("carries only masked values", () => {
    const serialised = JSON.stringify(report());
    expect(serialised).not.toContain("753479307460");
    expect(serialised).toContain("XXXX XXXX 7460");
  });
});
