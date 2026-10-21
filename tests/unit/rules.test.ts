import { describe, it, expect } from "vitest";
import { evaluateOpportunity, defaultForecast, type RuleInput } from "@/lib/rules/evaluate";
import { sortFlags } from "@/lib/rules/flags";

const NOW = new Date("2026-10-21T06:30:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function base(over: Partial<RuleInput> = {}): RuleInput {
  return {
    stage: "PROPOSAL", forecastCategory: "UPSIDE", amount: 2_000_000, revenueModel: "ONE_TIME", arrAmount: null,
    contractTermMonths: null, expectedCloseDate: daysAgo(-30), closeDateSlipCount: 0, stageEnteredAt: daysAgo(5),
    lastActivityAt: daysAgo(2), createdAt: daysAgo(60), nextStep: "Walkthrough", nextStepDate: daysAgo(-3),
    presalesOwnerId: "p1", primaryContactId: "c1", contactCount: 2, marginPct: 15, openPricingDueDate: null,
    openPresalesDueDate: null, dealRegStatus: "NOT_REQUIRED", dealRegExpiry: null, procurementMode: "DIRECT", submissionDueDate: null,
    ...over,
  };
}

describe("evaluateOpportunity", () => {
  it("labels a late-stage, engaged, on-time deal as HOT", () => {
    const r = evaluateOpportunity(base(), NOW);
    expect(r.label).toBe("HOT");
    expect(r.flags).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it("labels a deal with no activity for 21+ days as DYING", () => {
    const r = evaluateOpportunity(base({ lastActivityAt: daysAgo(30) }), NOW);
    expect(r.label).toBe("DYING");
    expect(r.flags).toContain("NO_ACTIVITY");
  });

  it("flags an overdue close date and marks commit at risk", () => {
    const r = evaluateOpportunity(base({ expectedCloseDate: daysAgo(5), forecastCategory: "COMMIT" }), NOW);
    expect(r.flags).toEqual(expect.arrayContaining(["CLOSE_DATE_OVERDUE", "COMMIT_AT_RISK"]));
    expect(r.label).toBe("AT_RISK");
  });

  it("goes DYING when the close date is more than 14 days past", () => {
    expect(evaluateOpportunity(base({ expectedCloseDate: daysAgo(20) }), NOW).label).toBe("DYING");
  });

  it("flags stale stage, slipped dates, missing next step", () => {
    const r = evaluateOpportunity(base({ stage: "BOQ", stageEnteredAt: daysAgo(30), closeDateSlipCount: 3, nextStep: null }), NOW);
    expect(r.flags).toEqual(expect.arrayContaining(["STALE_STAGE", "CLOSE_DATE_SLIPPED", "NO_NEXT_STEP"]));
  });

  it("requires presales from BOQ onward", () => {
    expect(evaluateOpportunity(base({ stage: "BOQ", presalesOwnerId: null }), NOW).flags).toContain("NO_PRESALES");
    expect(evaluateOpportunity(base({ stage: "QUALIFIED", presalesOwnerId: null }), NOW).flags).not.toContain("NO_PRESALES");
  });

  it("flags low margin, single-threaded high value, ARR without term", () => {
    const r = evaluateOpportunity(base({ marginPct: 5, amount: 9_000_000, contactCount: 1, revenueModel: "ARR" }), NOW);
    expect(r.flags).toEqual(expect.arrayContaining(["LOW_MARGIN", "SINGLE_THREADED", "ARR_TERM_MISSING"]));
  });

  it("flags overdue presales and pricing SLAs", () => {
    const r = evaluateOpportunity(base({ stage: "BOQ", openPricingDueDate: daysAgo(2), openPresalesDueDate: daysAgo(1) }), NOW);
    expect(r.flags).toEqual(expect.arrayContaining(["PRICING_PENDING", "PRESALES_OVERDUE"]));
    expect(r.label).toBe("AT_RISK");
  });

  it("flags expiring deal registration and RFP due soon", () => {
    const r = evaluateOpportunity(
      base({ stage: "BOQ", dealRegStatus: "APPROVED", dealRegExpiry: daysAgo(-5), procurementMode: "RFP", submissionDueDate: daysAgo(-3) }),
      NOW,
    );
    expect(r.flags).toEqual(expect.arrayContaining(["DEAL_REG_EXPIRING", "SUBMISSION_DUE"]));
  });

  it("returns CLOSED with no flags for closed deals", () => {
    expect(evaluateOpportunity(base({ stage: "WON", lastActivityAt: daysAgo(200) }), NOW)).toMatchObject({ label: "CLOSED", flags: [] });
  });

  it("keeps the score within 0..100", () => {
    const worst = evaluateOpportunity(base({ stage: "HOLD", lastActivityAt: daysAgo(90), stageEnteredAt: daysAgo(200), expectedCloseDate: daysAgo(60), closeDateSlipCount: 5, nextStep: null }), NOW);
    expect(worst.score).toBe(0);
  });
});

describe("helpers", () => {
  it("maps stages to default forecast", () => {
    expect(defaultForecast("NEGOTIATION")).toBe("COMMIT");
    expect(defaultForecast("PROPOSAL")).toBe("UPSIDE");
    expect(defaultForecast("QUALIFIED")).toBe("PIPELINE");
    expect(defaultForecast("WON")).toBe("OMITTED");
  });
  it("sorts flags by severity and drops unknown codes", () => {
    expect(sortFlags(["LOW_MARGIN", "BOGUS", "NO_ACTIVITY", "STALE_STAGE"])).toEqual(["NO_ACTIVITY", "STALE_STAGE", "LOW_MARGIN"]);
  });
});
