import { describe, it, expect } from "vitest";
import { reconstruct, baselineFor, lastReviewFor, buildAgenda, dealInsights, verdict, type ReviewDeal, type AuditRow, type PersonStats } from "@/lib/review";

const DAY = 86_400_000;
const now = new Date("2026-10-26T06:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);

const deal = (p: Partial<ReviewDeal> = {}): ReviewDeal => ({
  id: "o1", code: "OPP-1", name: "Zenith - SOC", account: "Zenith", ownerId: "u1", owner: "Rakesh", stage: "PROPOSAL", amount: 1_000_000,
  probability: 50, expectedCloseDate: new Date("2026-12-15T00:00:00Z"), forecastCategory: "COMMIT", healthLabel: "HEALTHY", healthScore: 70,
  flags: [], createdAt: ago(90), closedAt: null, lastActivityAt: ago(2), nextStep: "Demo", nextStepDate: new Date(now.getTime() + 3 * DAY),
  submissionDueDate: null, dealRegExpiry: null, dealRegStatus: "NOT_REQUIRED", closeDateSlipCount: 0, lossReason: null, procurementMode: "DIRECT",
  ...p,
});
const upd = (field: string, oldValue: string, newValue: string, d: number): AuditRow => ({ field, action: "UPDATE", oldValue, newValue, changedAt: ago(d), by: "Rakesh" });

describe("reconstruct", () => {
  it("rebuilds the deal as it stood at the baseline from the first change in the window", () => {
    const audits = [
      upd("amount", "800000", "900000", 20), // before the window: ignored
      upd("amount", "900000", "1000000", 5),
      upd("stage", "BOQ", "PROPOSAL", 4),
      upd("expectedCloseDate", "2026-11-15T00:00:00.000Z", "2026-12-01T00:00:00.000Z", 6),
      upd("expectedCloseDate", "2026-12-01T00:00:00.000Z", "2026-12-15T00:00:00.000Z", 2),
      upd("forecastCategory", "UPSIDE", "COMMIT", 3),
    ];
    const r = reconstruct(deal(), audits, ago(10));
    expect(r.start).toMatchObject({ amount: 900_000, stage: "BOQ", close: "2026-11-15", forecast: "UPSIDE" });
    expect(r.amount).toEqual({ from: 900_000, to: 1_000_000 });
    expect(r.stageDir).toBe("up");
    expect(r.pushes).toBe(2);
    expect(r.changed).toBe(true);
  });

  it("marks deals created after the baseline as new and untouched deals as unchanged", () => {
    expect(reconstruct(deal({ createdAt: ago(3) }), [], ago(10)).isNew).toBe(true);
    const still = reconstruct(deal(), [upd("amount", "1", "2", 30)], ago(10));
    expect(still.changed).toBe(false);
    expect(still.start?.amount).toBe(1_000_000);
  });

  it("tracks health from audited health changes", () => {
    const r = reconstruct(deal({ healthLabel: "DYING" }), [upd("healthLabel", "AT_RISK", "DYING", 4)], ago(7));
    expect(r.health).toEqual({ from: "AT_RISK", to: "DYING" });
  });
});

describe("baselines", () => {
  const reviews = [
    { id: "all", reviewedAt: ago(21), subjectIds: [] },
    { id: "team", reviewedAt: ago(12), subjectIds: ["u2", "u3"] },
    { id: "one", reviewedAt: ago(9), subjectIds: ["u1"] },
  ];
  it("uses each person's latest review, falling back to the all-hands review", () => {
    expect(lastReviewFor("u1", reviews)?.id).toBe("one");
    expect(lastReviewFor("u2", reviews)?.id).toBe("team");
    expect(lastReviewFor("u9", reviews)?.id).toBe("all");
  });
  it("supports fixed windows and the quarter start", () => {
    expect(Math.round((now.getTime() - baselineFor("u1", "14d", reviews, now, ago(26)).date.getTime()) / DAY)).toBe(14);
    expect(baselineFor("u1", "qtd", reviews, now, ago(26)).date).toEqual(ago(26));
    expect(baselineFor("u1", "last", [], now, ago(26)).label).toContain("not reviewed yet");
  });
});

describe("agenda and insights", () => {
  it("files each deal once under its most urgent heading with all facts", () => {
    const d = deal({ expectedCloseDate: ago(10), flags: ["NO_ACTIVITY"], lastActivityAt: ago(30), nextStep: null });
    const rec = reconstruct(d, [upd("expectedCloseDate", "2026-09-01T00:00:00.000Z", ago(10).toISOString(), 3)], ago(7));
    const agenda = buildAgenda([{ deal: d, rec }], now);
    expect(agenda.map((g) => g.key)).toEqual(["deadlines"]);
    expect(agenda[0]!.items[0]!.fact).toMatch(/passed 10 days ago.*Close date.*no activity for 30 days; no next step/i);
    const codes = dealInsights(d, rec, now).map((i) => i.code);
    expect(codes[0]).toBe("CLOSE_PASSED");
    expect(codes).toContain("PUSHED");
  });
});

describe("verdict", () => {
  const base: PersonStats = {
    id: "u1", name: "R", open: 5e7, openCount: 6, commit: 1e7, won: 4e6, wonCount: 2, lost: 0, lostCount: 0, advanced: 3, newPipeline: 8e6,
    newCount: 2, pushedCount: 2, pushedValue: 3e6, pastCloseCount: 1, pastCloseValue: 2e6, quietCount: 2, commitAtRisk: 0, activities: 5,
    fcUpgrades: 1, winRate: 30, remainingTarget: 2e7, quarterPipeline: 3e7, 
  };
  it("credits wins and progress, and flags slips, coverage and low activity against the team", () => {
    const v = verdict(base, { activities: 20, newPipeline: 4e6, winRate: 55 });
    expect(v.good.join(" ")).toMatch(/Won 2 deals/);
    expect(v.good.join(" ")).toMatch(/Moved 3 deals/);
    expect(v.bad.join(" ")).toMatch(/pushed out/);
    expect(v.bad.join(" ")).toMatch(/coverage 1\.5×/i);
    expect(v.bad.join(" ")).toMatch(/Only 5 activities/);
    expect(v.bad.join(" ")).toMatch(/Win rate 30% vs team 55%/);
  });
});
