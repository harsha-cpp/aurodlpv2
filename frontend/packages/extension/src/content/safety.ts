import type { Verdict } from "@aurodlpv2/shared";
import type { AttachmentUrlRef } from "./attachments";

export function failClosedVerdict(verdict: Verdict): Verdict {
  return {
    ...verdict,
    action: "block",
    severity: "critical",
    risk_score: 100,
    degraded: true,
    matched_policy_ids: [
      ...new Set([
        ...verdict.matched_policy_ids,
        "backend-degraded-local-fallback",
      ]),
    ],
    user_message:
      "Backend verification is unavailable. Sending is blocked until a complete scan succeeds.",
  };
}

export async function resolveCompleteAttachmentSet(
  captured: File[],
  refs: AttachmentUrlRef[],
  resolveRefs: (refs: AttachmentUrlRef[]) => Promise<File[]>,
): Promise<File[]> {
  if (refs.length === 0) return captured;

  const capturedNames = new Map<string, number>();
  for (const file of captured) {
    const name = file.name.trim().toLowerCase();
    capturedNames.set(name, (capturedNames.get(name) ?? 0) + 1);
  }
  const capturedCoverAllRefs =
    refs.length === captured.length &&
    refs.every((ref) => {
      const name = ref.name?.trim().toLowerCase();
      if (!name) return false;
      const remaining = capturedNames.get(name) ?? 0;
      if (remaining === 0) return false;
      capturedNames.set(name, remaining - 1);
      return true;
    });
  if (capturedCoverAllRefs) return captured;

  const resolved = await resolveRefs(refs);
  if (resolved.length !== refs.length) {
    throw new Error("not all visible attachments could be read");
  }
  return resolved;
}
