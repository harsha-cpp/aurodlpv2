import { describe, expect, it } from "vitest";
import { detectPhi, isValidAadhaar, isValidPan } from "./phi";

describe("local PHI fallback validators", () => {
  it("accepts Aadhaar numbers with a valid Verhoeff checksum", () => {
    expect(isValidAadhaar("2345 6789 0009")).toBe(true);
    expect(detectPhi("Aadhaar 2345 6789 0009")[0]?.type).toBe("IN_AADHAAR");
  });

  it("rejects Aadhaar numbers with an invalid checksum", () => {
    expect(isValidAadhaar("2345 6789 0008")).toBe(false);
    expect(detectPhi("Aadhaar 2345 6789 0008")).toHaveLength(0);
  });

  it("filters common fake PAN values while accepting valid structure", () => {
    expect(isValidPan("BNZAA2318J")).toBe(true);
    expect(isValidPan("ABCDE1234F")).toBe(false);
    expect(
      detectPhi("PAN BNZAA2318J and fake ABCDE1234F").map(
        (hit) => hit.masked_value,
      ),
    ).toEqual(["BN***8J"]);
  });

  it("requires healthcare context for an unformatted 14-digit ABHA candidate", () => {
    expect(detectPhi("Invoice reference 12345678901234")).toHaveLength(0);
    expect(detectPhi("Patient ABHA 12345678901234")[0]?.type).toBe("ABHA_ID");
  });

  it("recognizes valid ICD U codes only in medical context", () => {
    expect(detectPhi("Release U07.1")).toHaveLength(0);
    expect(detectPhi("Diagnosis U07.1")[0]?.type).toBe("ICD10_CODE");
  });
});
