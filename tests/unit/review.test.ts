import { describe, expect, it } from "vitest";
import { changesSince, flagsFor, personSummary } from "@/domain/review";

const d = (iso: string) => new Date(iso);
const now = d("2026-11-13T10:00:00Z");

describe("changes since a date", () => {
  it("takes the value at the start of the window and the value now, counting close-date pushes", () => {
    const rows = [
      { field: "dealValue", oldValue: "100", newValue: "120", changedAt: d("2026-11-01T00:00:00Z"), action: "UPDATE" },
      { field: "dealValue", oldValue: "120", newValue: "150", changedAt: d("2026-11-05T00:00:00Z"), action: "UPDATE" },
      { field: "expectedCloseDate", oldValue: "2026-11-30", newValue: "2026-12-15", changedAt: d("2026-11-06T00:00:00Z"), action: "UPDATE" },
      { field: "expectedCloseDate", oldValue: "2026-12-15", newValue: "2026-12-10", changedAt: d("2026-11-07T00:00:00Z"), action: "UPDATE" },
      { field: "stage", oldValue: "BOQ", newValue: "QUALIFIED", changedAt: d("2026-10-01T00:00:00Z"), action: "STAGE_CHANGE" },
      { field: "nextStep", oldValue: null, newValue: "Call", changedAt: d("2026-11-08T00:00:00Z"), action: "UPDATE" },
    ];
    const c = changesSince({ createdAt: d("2026-09-01T00:00:00Z") }, rows, d("2026-10-31T00:00:00Z"));
    expect(c.changes).toEqual({ dealValue: { from: "100", to: "150" }, expectedCloseDate: { from: "2026-11-30", to: "2026-12-10" } });
    expect(c.pushes).toBe(1);
    expect(c.isNew).toBe(false);
  });
  it("a value changed and changed back is not a change", () => {
    const rows = [
      { field: "forecastCategory", oldValue: "PIPELINE", newValue: "COMMIT", changedAt: d("2026-11-01T00:00:00Z"), action: "UPDATE" },
      { field: "forecastCategory", oldValue: "COMMIT", newValue: "PIPELINE", changedAt: d("2026-11-02T00:00:00Z"), action: "UPDATE" },
    ];
    expect(changesSince({ createdAt: d("2026-11-01T12:00:00Z") }, rows, d("2026-10-31T00:00:00Z"))).toEqual({ changes: {}, pushes: 0, isNew: true });
  });
});

describe("flags", () => {
  const base = { stage: "QUALIFIED" as const, forecastCategory: "PIPELINE" as const, expectedCloseDate: d("2026-12-31"), stageEnteredAt: d("2026-11-10"), updatedAt: d("2026-11-12"), nextStep: "Demo" };
  it("raises each concern at its boundary and nothing on a closed deal", () => {
    expect(flagsFor(base, 0, now)).toEqual([]);
    expect(flagsFor({ ...base, expectedCloseDate: d("2026-11-10") }, 0, now)).toContain("CLOSE_DATE_PASSED");
    expect(flagsFor(base, 2, now)).toContain("SLIPPED");
    expect(flagsFor({ ...base, updatedAt: d("2026-10-01") }, 0, now)).toContain("NO_ACTIVITY_21D");
    expect(flagsFor({ ...base, stageEnteredAt: d("2026-10-01") }, 0, now)).toContain("STUCK");
    expect(flagsFor({ ...base, forecastCategory: "COMMIT" }, 0, now)).toContain("COMMIT_WITHOUT_PROPOSAL");
    expect(flagsFor({ ...base, forecastCategory: "COMMIT", stage: "NEGOTIATION" }, 0, now)).not.toContain("COMMIT_WITHOUT_PROPOSAL");
    expect(flagsFor({ ...base, nextStep: null }, 0, now)).toContain("NO_NEXT_STEP");
    expect(flagsFor({ ...base, stage: "CLOSED_WON", updatedAt: d("2025-01-01") }, 3, now)).toEqual([]);
  });
});

describe("person summary", () => {
  it("says what went well and what is lagging against target", () => {
    const since = d("2026-11-01");
    const empty = { changes: {}, pushes: 0, isNew: false };
    const s = personSummary(
      [
        { stage: "CLOSED_WON", dealValue: 4_000_000, forecastCategory: "COMMIT", closedAt: d("2026-11-05"), flags: [], changes: empty },
        { stage: "NEGOTIATION", dealValue: 3_000_000, forecastCategory: "COMMIT", closedAt: null, flags: ["CLOSE_DATE_PASSED"], changes: { changes: { stage: { from: "PROPOSAL_SUBMITTED", to: "NEGOTIATION" } }, pushes: 1, isNew: false } },
        { stage: "QUALIFIED", dealValue: 1_000_000, forecastCategory: "PIPELINE", closedAt: null, flags: ["NO_ACTIVITY_21D"], changes: { ...empty, isNew: true } },
      ],
      since,
      10_000_000,
    );
    expect(s).toMatchObject({ wonValue: 4_000_000, wonCount: 1, advanced: 1, newPipeline: 1_000_000, pushed: 1, pastClose: 1, quiet: 1, commitUpside: 3_000_000, openPipeline: 4_000_000 });
    expect(s.doneWell.join(" ")).toMatch(/Won 1 deal worth ₹40.0 L/);
    expect(s.lagging.join(" ")).toMatch(/cover 70% of the quarter target/);
  });
});
