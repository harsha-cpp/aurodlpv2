import { describe, expect, it } from "vitest";
import {
  ENTITY_GROUPS,
  ENTITY_TYPES,
  entityGroup,
  entityLabel,
  entityTypesByGroup,
} from "./entities";

describe("entityLabel", () => {
  it("covers all 21 canonical types", () => {
    expect(ENTITY_TYPES).toHaveLength(21);
  });

  it("never leaks a SCREAMING_SNAKE type name to a clinician", () => {
    for (const type of ENTITY_TYPES) {
      const label = entityLabel(type);
      expect(label).not.toContain("_");
      expect(label).not.toBe(type);
    }
  });

  it.each([
    ["PATIENT_VISIT_ID", "Patient visit ID"],
    ["IN_AADHAAR", "Aadhaar number"],
    ["ABHA_ADDRESS", "ABHA address"],
    ["MRN", "Medical record number"],
    ["ICD10", "ICD-10 diagnosis code"],
    ["IN_IFSC", "IFSC code"],
    ["DATE_OF_BIRTH", "Date of birth"],
  ])('labels %s as "%s"', (type, expected) => {
    expect(entityLabel(type)).toBe(expected);
  });

  it("degrades a type the engine added before this map did", () => {
    expect(entityLabel("IN_RATION_CARD")).toBe("Ration card");
  });

  it("has an answer for missing input", () => {
    expect(entityLabel(null)).toBe("Unknown type");
    expect(entityLabel("")).toBe("Unknown type");
  });
});

describe("entityGroup", () => {
  it("assigns every canonical type to exactly one group", () => {
    const grouped = ENTITY_GROUPS.flatMap((g) => entityTypesByGroup(g));
    expect(grouped).toHaveLength(ENTITY_TYPES.length);
    expect(new Set(grouped).size).toBe(ENTITY_TYPES.length);
  });

  it("returns null for an unknown type instead of inventing a group", () => {
    expect(entityGroup("NOT_A_TYPE")).toBeNull();
  });
});
