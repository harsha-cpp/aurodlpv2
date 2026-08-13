import { describe, expect, it } from "vitest";

import { normalizeApiBaseUrl } from "./config";

describe("extension API base URL", () => {
  it("accepts HTTPS origins and normalizes away paths", () => {
    expect(normalizeApiBaseUrl("https://api.auro.example/v1/")).toBe(
      "https://api.auro.example",
    );
  });

  it("permits HTTP only for local development", () => {
    expect(normalizeApiBaseUrl("http://localhost:8000")).toBe(
      "http://localhost:8000",
    );
    expect(normalizeApiBaseUrl("http://api.auro.example")).toBeNull();
  });

  it("rejects credentials, query strings, and fragments", () => {
    expect(normalizeApiBaseUrl("https://user:pass@api.auro.example")).toBeNull();
    expect(normalizeApiBaseUrl("https://api.auro.example?redirect=bad")).toBeNull();
    expect(normalizeApiBaseUrl("https://api.auro.example#bad")).toBeNull();
  });
});
