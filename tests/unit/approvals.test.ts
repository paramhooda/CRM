import { describe, it, expect } from "vitest";
import { matchRules, mergeSteps, resolveSteps, nextOpenStep, rateCardDiscountLines, priceFingerprint, type RuleInput } from "@/lib/approvals";

const rule = (p: Partial<RuleInput>): RuleInput => ({
  id: "r", name: "Rule", active: true, gmBelowPct: null, rateCardDiscount: false, minDealValue: null, businessUnitIds: [], steps: [{ kind: "OWNER_MANAGER" }], ...p,
});
const deal = { gmPct: 8, value: 5_00_000, businessUnitIds: ["cloud"], rateCardDiscountLines: [] as number[] };

describe("approval rules", () => {
  it("every condition on a rule must hold; inactive rules and rules without a condition never match", () => {
    expect(matchRules([rule({ gmBelowPct: 10 })], deal)[0]?.reasons).toEqual(["GM 8.0% is below 10%"]);
    expect(matchRules([rule({ gmBelowPct: 5 })], deal)).toEqual([]);
    expect(matchRules([rule({ gmBelowPct: 10, minDealValue: 10_00_000 })], deal)).toEqual([]); // GM low but deal small
    expect(matchRules([rule({ gmBelowPct: 10, minDealValue: 1_00_000 })], deal)[0]?.reasons).toHaveLength(2);
    expect(matchRules([rule({ gmBelowPct: 10, active: false })], deal)).toEqual([]);
    expect(matchRules([rule({})], deal)).toEqual([]);
  });

  it("rate card discounts and the business unit filter", () => {
    expect(matchRules([rule({ rateCardDiscount: true })], deal)).toEqual([]);
    expect(matchRules([rule({ rateCardDiscount: true })], { ...deal, rateCardDiscountLines: [2, 3] })[0]?.reasons).toEqual(["Rate card discount on lines 2, 3"]);
    expect(matchRules([rule({ gmBelowPct: 10, businessUnitIds: ["infra"] })], deal)).toEqual([]);
    expect(matchRules([rule({ gmBelowPct: 10, businessUnitIds: ["infra", "cloud"] })], deal)).toHaveLength(1);
    expect(rateCardDiscountLines([
      { lineNo: 1, costSource: "RATE_CARD", unitPrice: 900, listPrice: 1000 },
      { lineNo: 2, costSource: "RATE_CARD", unitPrice: 1000, listPrice: 1000 },
      { lineNo: 3, costSource: "PURCHASE", unitPrice: 10, listPrice: 1000 },
    ])).toEqual([1]);
  });

  it("steps of all matching rules run in rule order, each approver once", () => {
    const a = rule({ id: "a", gmBelowPct: 10, steps: [{ kind: "OWNER_MANAGER" }, { kind: "ROLE", role: "ADMIN" }] });
    const b = rule({ id: "b", minDealValue: 1, steps: [{ kind: "OWNER_MANAGER" }, { kind: "USER", userId: "u9" }] });
    expect(mergeSteps(matchRules([a, b], deal))).toEqual([{ kind: "OWNER_MANAGER" }, { kind: "ROLE", role: "ADMIN" }, { kind: "USER", userId: "u9" }]);
  });

  it("nobody approves their own prices; a step with no one available goes to the admins", () => {
    const head = { id: "h", name: "Vivek" }, admin = { id: "ad", name: "Admin" };
    const ctx = { requesterId: "h", ownerManager: head, byRole: { SALES_HEAD: [head], ADMIN: [admin] }, byId: {}, admins: [admin] };
    const steps = resolveSteps([{ kind: "OWNER_MANAGER" }, { kind: "ROLE", role: "ADMIN" }, { kind: "USER", userId: "gone" }], ctx);
    expect(steps[0]).toMatchObject({ decision: "APPROVED", auto: true }); // the head asked: their own step passes
    expect(steps[1]).toMatchObject({ label: "Any Admin", approverIds: ["ad"] });
    expect(steps[2]!.approverIds).toEqual(["ad"]);
    expect(steps[2]!.label).toMatch(/no one available/);
    expect(nextOpenStep(steps)).toBe(1);
    expect(resolveSteps([{ kind: "OWNER_MANAGER" }], { ...ctx, requesterId: "s1" })[0]).toMatchObject({ approverIds: ["h"] });
  });

  it("the fingerprint changes with any price, cost, quantity or term, and not with line order", () => {
    const l = [
      { id: "a", quantity: 2, unitPrice: 100, unitCost: 80, billingFrequency: "ONE_TIME", termMonths: null },
      { id: "b", quantity: 1, unitPrice: 50.5, unitCost: 40, billingFrequency: "MONTHLY", termMonths: 36 },
    ];
    const f = priceFingerprint(l);
    expect(priceFingerprint([...l].reverse())).toBe(f);
    expect(priceFingerprint([{ ...l[0]!, unitPrice: 99 }, l[1]!])).not.toBe(f);
    expect(priceFingerprint([l[0]!, { ...l[1]!, termMonths: 24 }])).not.toBe(f);
  });
});
