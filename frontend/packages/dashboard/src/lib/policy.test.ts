import { describe, expect, it } from "vitest";
import type { PolicyRule } from "../api/policy";
import {
  describeConditions,
  inEvaluationOrder,
  isDirty,
  moveRule,
  newRule,
  ORDER_STEP,
  removeRule,
  renumber,
  toPolicySetIn,
  updateRule,
  validateRules,
  versionForSave,
} from "./policy";

function rule(id: string, over: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id,
    description: "",
    enabled: true,
    order: 100,
    conditions: {},
    action: "block",
    min_reported_severity: null,
    user_message: "",
    ...over,
  };
}

const three = [
  rule("block-blocked"),
  rule("quarantine-external"),
  rule("allow-rest"),
];

describe("renumber", () => {
  it("derives order from list position, because position is what the engine walks", () => {
    expect(renumber(three).map((r) => r.order)).toEqual([
      ORDER_STEP,
      ORDER_STEP * 2,
      ORDER_STEP * 3,
    ]);
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(three);
    renumber(three);
    expect(JSON.stringify(three)).toBe(before);
  });
});

describe("moveRule", () => {
  it("moves a rule up and renumbers so first match still means first row", () => {
    const moved = moveRule(renumber(three), 2, -1);
    expect(moved.map((r) => r.id)).toEqual([
      "block-blocked",
      "allow-rest",
      "quarantine-external",
    ]);
    expect(moved.map((r) => r.order)).toEqual([10, 20, 30]);
  });

  it("moves a rule down", () => {
    const moved = moveRule(renumber(three), 0, 1);
    expect(moved.map((r) => r.id)).toEqual([
      "quarantine-external",
      "block-blocked",
      "allow-rest",
    ]);
  });

  it("refuses to move past either end rather than wrapping", () => {
    const start = renumber(three);
    expect(moveRule(start, 0, -1)).toBe(start);
    expect(moveRule(start, 2, 1)).toBe(start);
    expect(moveRule(start, 9, 1)).toBe(start);
  });

  it("round-trips: up then down restores the original order", () => {
    const start = renumber(three);
    expect(moveRule(moveRule(start, 1, -1), 0, 1).map((r) => r.id)).toEqual(
      start.map((r) => r.id),
    );
  });
});

describe("inEvaluationOrder", () => {
  it("sorts by order, so a server set with sparse numbers still reads correctly", () => {
    const rules = [
      rule("c", { order: 90 }),
      rule("a", { order: 10 }),
      rule("b", { order: 50 }),
    ];
    expect(inEvaluationOrder(rules).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by original position instead of reordering arbitrarily", () => {
    const rules = [rule("first", { order: 10 }), rule("second", { order: 10 })];
    expect(inEvaluationOrder(rules).map((r) => r.id)).toEqual([
      "first",
      "second",
    ]);
  });
});

describe("removeRule / updateRule", () => {
  it("removes by id and closes the numbering gap", () => {
    const left = removeRule(renumber(three), "quarantine-external");
    expect(left.map((r) => r.id)).toEqual(["block-blocked", "allow-rest"]);
    expect(left.map((r) => r.order)).toEqual([10, 20]);
  });

  it("patches only the addressed rule", () => {
    const patched = updateRule(three, "allow-rest", { enabled: false });
    expect(patched.map((r) => r.enabled)).toEqual([true, true, false]);
  });
});

describe("newRule", () => {
  it("lands last so it cannot silently pre-empt an existing hard stop", () => {
    const added = newRule(renumber(three));
    expect(added.order).toBe(ORDER_STEP * 4);
  });

  it("does not collide with an id already in use", () => {
    const taken = [rule("custom-rule-1"), rule("custom-rule-2")];
    expect(taken.map((r) => r.id)).not.toContain(newRule(taken).id);
  });
});

describe("validateRules", () => {
  it("accepts a sane set", () => {
    expect(validateRules(renumber(three))).toEqual([]);
  });

  it("rejects an empty set", () => {
    expect(validateRules([])).toContain("A policy needs at least one rule.");
  });

  it("catches duplicate ids, which would make verdicts ambiguous", () => {
    const problems = validateRules([rule("dupe"), rule("dupe")]);
    expect(problems.some((p) => p.includes("Duplicate rule id"))).toBe(true);
  });

  it("catches an unsatisfiable risk window", () => {
    const problems = validateRules([
      rule("impossible", {
        conditions: { min_risk_score: 80, max_risk_score: 20 },
      }),
    ]);
    expect(problems.some((p) => p.includes("can never match"))).toBe(true);
  });

  it("warns when everything is switched off, which would allow every send", () => {
    const problems = validateRules([rule("a", { enabled: false })]);
    expect(
      problems.some((p) => p.includes("every send would be allowed")),
    ).toBe(true);
  });
});

describe("isDirty", () => {
  const saved = { version: "v1", rules: renumber(three), is_custom: true };

  it("is false for an untouched copy", () => {
    expect(isDirty(saved, renumber(three))).toBe(false);
  });

  it("is true once the order changes, even with the same rules", () => {
    expect(isDirty(saved, moveRule(renumber(three), 0, 1))).toBe(true);
  });

  it("is true when a rule is disabled", () => {
    expect(
      isDirty(
        saved,
        updateRule(renumber(three), "allow-rest", { enabled: false }),
      ),
    ).toBe(true);
  });

  it("ignores empty-vs-absent condition arrays, which the engine treats alike", () => {
    const withEmpty = renumber(three).map((r) => ({
      ...r,
      conditions: { entity_types_any: [] },
    }));
    expect(isDirty(saved, withEmpty)).toBe(false);
  });
});

describe("toPolicySetIn", () => {
  it("always sends order matching the on-screen sequence", () => {
    const body = toPolicySetIn(three, "custom");
    expect(body.rules.map((r) => r.order)).toEqual([10, 20, 30]);
    expect(body.version).toBe("custom");
  });
});

describe("describeConditions", () => {
  it("says so plainly when a rule matches everything", () => {
    expect(describeConditions({})).toEqual(["matches everything (catch-all)"]);
  });

  it("uses readable entity labels, not raw type names", () => {
    const text = describeConditions({
      entity_types_any: ["PATIENT_VISIT_ID"],
    }).join(" ");
    expect(text).toContain("Patient visit ID");
    expect(text).not.toContain("PATIENT_VISIT_ID");
  });

  it('distinguishes "any recipient" from "every recipient"', () => {
    expect(
      describeConditions({ recipient_class_any: ["blocked"] })[0],
    ).toContain("any recipient");
    expect(
      describeConditions({ recipient_class_all: ["internal"] })[0],
    ).toContain("every recipient");
  });

  it("renders both sides of a risk window", () => {
    expect(
      describeConditions({ min_risk_score: 30, max_risk_score: 70 }),
    ).toEqual(["risk ≥ 30", "risk ≤ 70"]);
  });

  it("keeps a zero threshold instead of dropping it as falsy", () => {
    expect(describeConditions({ max_risk_score: 0 })).toEqual(["risk ≤ 0"]);
  });

  it("describes both attachment states", () => {
    expect(describeConditions({ has_attachments: true })).toEqual([
      "has attachments",
    ]);
    expect(describeConditions({ has_attachments: false })).toEqual([
      "has no attachments",
    ]);
  });
});

describe("versionForSave", () => {
  it("renames the built-in set on first customisation", () => {
    expect(
      versionForSave({
        version: "builtin-2026.08",
        rules: three,
        is_custom: false,
      }),
    ).toBe("custom");
  });

  it("keeps an organization's own version name on later saves", () => {
    expect(
      versionForSave({
        version: "ward-policy-v3",
        rules: three,
        is_custom: true,
      }),
    ).toBe("ward-policy-v3");
  });

  it("has an answer before the saved set has loaded", () => {
    expect(versionForSave(undefined)).toBe("custom");
  });
});
