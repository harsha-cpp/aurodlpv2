import { describe, expect, it } from "vitest";
import type { Verdict } from "@aurodlpv2/shared";
import { failClosedVerdict, resolveCompleteAttachmentSet } from "./safety";

function verdict(action: Verdict["action"]): Verdict {
  return {
    scan_id: "scan-1",
    action,
    severity: "none",
    risk_score: 0,
    matched_policy_ids: [],
    entities: [],
    recipients: [],
    user_message: "local result",
    created_at: "2026-08-07T00:00:00Z",
  };
}

describe("failClosedVerdict", () => {
  it.each(["allow", "warn"] as const)(
    "blocks a local %s result during a backend outage",
    (action) => {
      const result = failClosedVerdict(verdict(action));

      expect(result.action).toBe("block");
      expect(result.severity).toBe("critical");
      expect(result.risk_score).toBe(100);
      expect(result.degraded).toBe(true);
      expect(result.matched_policy_ids).toContain(
        "backend-degraded-local-fallback",
      );
    },
  );

  it("rejects an incomplete set of visible Gmail attachments", async () => {
    await expect(
      resolveCompleteAttachmentSet(
        [],
        [
          { url: "https://mail.example/first", name: "first.pdf" },
          { url: "https://mail.example/second", name: "second.pdf" },
        ],
        async () => [],
      ),
    ).rejects.toThrow("not all visible attachments could be read");
  });
});
