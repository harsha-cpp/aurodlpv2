import { describe, expect, it } from "vitest";
import type { AuditEvent } from "../api/audit";
import {
  actionLabel,
  applyFilters,
  auditCsv,
  categoryLabel,
  distinctActors,
  verifyChain,
} from "./audit";

function event(over: Partial<AuditEvent>): AuditEvent {
  return {
    id: "id",
    actor: "member:owner@hospital.example",
    category: "policy",
    action: "policy_replaced",
    metadata: {},
    previous_hash: null,
    event_hash: "hash",
    created_at: "2026-08-28T10:00:00Z",
    ...over,
  };
}

const intact = [
  event({ id: "3", event_hash: "c", previous_hash: "b" }),
  event({ id: "2", event_hash: "b", previous_hash: "a" }),
  event({ id: "1", event_hash: "a", previous_hash: null }),
];

describe("verifyChain", () => {
  it("marks an intact run as linked down to the root", () => {
    expect(verifyChain(intact, true)).toEqual(["linked", "linked", "root"]);
  });

  it("flags the row whose recorded predecessor no longer matches", () => {
    const tampered = [
      event({ id: "3", event_hash: "c", previous_hash: "DELETED" }),
      event({ id: "2", event_hash: "b", previous_hash: "a" }),
      event({ id: "1", event_hash: "a", previous_hash: null }),
    ];
    expect(verifyChain(tampered, true)).toEqual(["broken", "linked", "root"]);
  });

  it("refuses to judge a filtered list, because hidden rows are not tampering", () => {
    expect(verifyChain(intact, false)).toEqual([
      "unverifiable",
      "unverifiable",
      "root",
    ]);
  });

  it("does not claim a break at the oldest row on screen", () => {
    const page = [event({ id: "9", event_hash: "z", previous_hash: "y" })];
    expect(verifyChain(page, true)).toEqual(["unverifiable"]);
  });

  it("handles an empty log", () => {
    expect(verifyChain([], true)).toEqual([]);
  });
});

describe("applyFilters", () => {
  const rows = [
    event({ id: "1", category: "policy", actor: "member:ann@x.test" }),
    event({ id: "2", category: "quarantine", actor: "member:bob@x.test" }),
    event({ id: "3", category: "policy", actor: "device:ward-3" }),
  ];

  it("returns everything when nothing is selected", () => {
    expect(applyFilters(rows, { category: "", actor: "" })).toHaveLength(3);
  });

  it("filters by category", () => {
    expect(
      applyFilters(rows, { category: "policy", actor: "" }).map((r) => r.id),
    ).toEqual(["1", "3"]);
  });

  it("matches actors case-insensitively on a substring", () => {
    expect(
      applyFilters(rows, { category: "", actor: "BOB" }).map((r) => r.id),
    ).toEqual(["2"]);
  });

  it("applies both filters together", () => {
    expect(
      applyFilters(rows, { category: "policy", actor: "device" }).map(
        (r) => r.id,
      ),
    ).toEqual(["3"]);
  });
});

describe("distinctActors", () => {
  it("lists each actor once, sorted, so the filter dropdown is stable", () => {
    const rows = [
      event({ actor: "member:bob@x.test" }),
      event({ actor: "member:ann@x.test" }),
      event({ actor: "member:bob@x.test" }),
    ];
    expect(distinctActors(rows)).toEqual([
      "member:ann@x.test",
      "member:bob@x.test",
    ]);
  });
});

describe("labels", () => {
  it("expands known categories and leaves unknown ones readable", () => {
    expect(categoryLabel("quarantine")).toBe("Quarantine decisions");
    expect(categoryLabel("future_thing")).toBe("future_thing");
  });

  it("de-snakes actions", () => {
    expect(actionLabel("device_enrolled")).toBe("Device enrolled");
  });
});

describe("auditCsv", () => {
  it("exports both hashes so the chain can be checked outside the dashboard", () => {
    const csv = auditCsv(intact);
    expect(csv.split("\r\n")[0]).toContain("event_hash");
    expect(csv).toContain('"c"');
    expect(csv.split("\r\n")).toHaveLength(4);
  });

  it('writes an empty cell for the root row instead of "null"', () => {
    expect(auditCsv([intact[2] as AuditEvent])).not.toContain("null");
  });
});
