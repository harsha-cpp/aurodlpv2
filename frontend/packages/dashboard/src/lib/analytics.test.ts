import { describe, expect, it } from "vitest";
import type { Analytics } from "../api/events";
import {
  analyticsCsv,
  bucketOfAction,
  buildTrend,
  interventionRate,
  SERIES,
} from "./analytics";

describe("bucketOfAction", () => {
  it("separates allowed, warned and stopped", () => {
    expect(bucketOfAction("allow")).toBe("allowed");
    expect(bucketOfAction("warn")).toBe("warned");
    for (const a of ["block", "quarantine", "escalate"]) {
      expect(bucketOfAction(a)).toBe("stopped");
    }
  });

  it("treats an unrecognised action as stopped rather than silently allowed", () => {
    expect(bucketOfAction("something_new")).toBe("stopped");
  });
});

describe("buildTrend", () => {
  const now = new Date("2026-08-28T09:00:00Z");

  it("fills quiet days with zeros so the chart does not bridge the gap", () => {
    const trend = buildTrend(
      [{ day: "2026-08-28", action: "block", count: 2 }],
      7,
      now,
    );
    expect(trend).toHaveLength(7);
    expect(trend[0]?.day).toBe("2026-08-22");
    expect(trend[6]).toMatchObject({ day: "2026-08-28", stopped: 2, total: 2 });
    expect(trend[3]?.total).toBe(0);
  });

  it("sums the per-action rows for a day into the right buckets", () => {
    const trend = buildTrend(
      [
        { day: "2026-08-28", action: "allow", count: 10 },
        { day: "2026-08-28", action: "warn", count: 3 },
        { day: "2026-08-28", action: "block", count: 2 },
        { day: "2026-08-28", action: "quarantine", count: 1 },
      ],
      2,
      now,
    );
    expect(trend[1]).toMatchObject({
      allowed: 10,
      warned: 3,
      stopped: 3,
      total: 16,
    });
  });

  it("keeps days in chronological order", () => {
    const days = buildTrend([], 5, now).map((d) => d.day);
    expect([...days].sort()).toEqual(days);
  });

  it("tolerates a full timestamp where a date was expected", () => {
    const trend = buildTrend(
      [{ day: "2026-08-28T00:00:00Z", action: "allow", count: 4 }],
      1,
      now,
    );
    expect(trend[0]?.allowed).toBe(4);
  });
});

describe("interventionRate", () => {
  it("is the share of scans that were stopped", () => {
    expect(
      interventionRate({
        total_scans: 200,
        total_blocks: 10,
        total_quarantines: 5,
        total_escalations: 5,
      }),
    ).toBe(10);
  });

  it("is null rather than NaN when nothing has been scanned", () => {
    expect(
      interventionRate({
        total_scans: 0,
        total_blocks: 0,
        total_quarantines: 0,
        total_escalations: 0,
      }),
    ).toBeNull();
  });
});

describe("analyticsCsv", () => {
  const data: Analytics = {
    total_scans: 3,
    total_blocks: 1,
    total_allows: 1,
    total_warnings: 1,
    total_quarantines: 0,
    total_escalations: 0,
    unique_users: 2,
    avg_risk_score: 41.5,
    by_channel: { email: 2, web: 1 },
    top_sites: [{ site_host: "chatgpt.com", count: 1 }],
    top_entity_types: [{ type: "PATIENT_VISIT_ID", count: 4 }],
    top_users: [{ email: null, blocks: 1 }],
    daily_trend: [{ day: "2026-08-28", action: "block", count: 1 }],
    recent_events: [
      {
        user_email: null,
        action: "block",
        channel: "email",
        site_host: null,
        severity: "high",
        risk_score: 61,
        entities: [{ type: "MRN" }],
        recipients: ["x@y.test"],
        timestamp: "2026-08-28T10:00:00Z",
      },
    ],
  };

  it('exports the null sender as "Unattributed", never as an empty or "null" cell', () => {
    const csv = analyticsCsv(data, 30);
    expect(csv).toContain('"Unattributed"');
    expect(csv).not.toContain('"null"');
  });

  it("carries both the raw type and its label for entity counts", () => {
    const csv = analyticsCsv(data, 30);
    expect(csv).toContain('"PATIENT_VISIT_ID"');
    expect(csv).toContain('"Patient visit ID"');
  });

  it("labels the risk column with its 0-100 scale", () => {
    expect(analyticsCsv(data, 30)).toContain("avg_risk_score_0_100");
  });
});

describe("SERIES palette", () => {
  it("binds each series to the matching semantic token, not a fixed colour", () => {
    expect(SERIES.stopped).toBe("var(--series-stop)");
    expect(SERIES.warned).toBe("var(--series-warn)");
    expect(SERIES.allowed).toBe("var(--series-allow)");
    expect(new Set(Object.values(SERIES)).size).toBe(3);
  });
});
