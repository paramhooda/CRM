import { describe, it, expect } from "vitest";
import { boqTotals, lineMultiplier } from "@/lib/boq";
import { can, opportunityScope } from "@/lib/authz";

describe("BOQ totals", () => {
  it("multiplies recurring lines by billing periods and computes margin on costed+priced lines", () => {
    expect(lineMultiplier({ quantity: 10, billingFrequency: "MONTHLY", termMonths: 36 })).toBe(360);
    expect(lineMultiplier({ quantity: 10, billingFrequency: "QUARTERLY", termMonths: 36 })).toBe(120);
    expect(lineMultiplier({ quantity: 10, billingFrequency: "ANNUAL", termMonths: 36 })).toBe(30);
    expect(lineMultiplier({ quantity: 10, billingFrequency: "ONE_TIME", termMonths: 36 })).toBe(10);
    const t = boqTotals([
      { quantity: 2, unitCost: 80, unitPrice: 100, billingFrequency: "ONE_TIME" as const, termMonths: null },
      { quantity: 1, unitCost: 10, unitPrice: 20, billingFrequency: "MONTHLY" as const, termMonths: 12 },
      { quantity: 5, unitCost: null, unitPrice: 50, billingFrequency: "ONE_TIME" as const, termMonths: null },
    ]);
    expect(t.totalPrice).toBe(200 + 240 + 250);
    expect(t.totalCost).toBe(160 + 120);
    expect(t.marginPct).toBeCloseTo(((440 - 280) / 440) * 100, 5);
    expect(t.fullyPriced).toBe(true);
    expect(t.fullyCosted).toBe(false);
  });
  it("returns null margin when nothing is costed", () => {
    expect(boqTotals([{ quantity: 1, unitCost: null, unitPrice: 10, billingFrequency: "ONE_TIME" as const, termMonths: null }]).marginPct).toBeNull();
  });
});

describe("authorization", () => {
  const opp = { salesOwnerId: "s1", presalesOwnerId: "p1", purchaseOwnerId: "b1" };
  it("lets only the owner or managers edit a deal", () => {
    expect(can.editOpportunity({ id: "s1", role: "SALES" }, opp)).toBe(true);
    expect(can.editOpportunity({ id: "s2", role: "SALES" }, opp)).toBe(false);
    expect(can.editOpportunity({ id: "h", role: "SALES_HEAD" }, opp)).toBe(true);
    expect(can.editOpportunity({ id: "p1", role: "PRESALES" }, opp)).toBe(false);
  });
  it("splits BOQ editing rights by role", () => {
    expect(can.editBoqSpec({ id: "p1", role: "PRESALES" }, opp)).toBe(true);
    expect(can.editBoqSpec({ id: "p2", role: "PRESALES" }, opp)).toBe(false);
    expect(can.editBoqCost({ id: "b1", role: "PURCHASE" })).toBe(true);
    expect(can.editBoqCost({ id: "s1", role: "SALES" })).toBe(false);
    expect(can.editBoqPrice({ id: "s1", role: "SALES" }, opp)).toBe(true);
    expect(can.editBoqPrice({ id: "b1", role: "PURCHASE" }, opp)).toBe(false);
    // Everyone may see cost and margin; only purchase/admin may change cost
    expect(can.viewCost({ id: "p1", role: "PRESALES" })).toBe(true);
    expect(can.editBoqCost({ id: "p1", role: "PRESALES" })).toBe(false);
    expect(can.manageProducts({ id: "a", role: "ADMIN" })).toBe(true);
    expect(can.manageProducts({ id: "b1", role: "PURCHASE" })).toBe(false);
  });
  it("scopes sales users to their own deals, others read all", () => {
    expect(opportunityScope({ id: "s1", role: "SALES" })).toMatchObject({ salesOwnerId: "s1", deletedAt: null });
    expect(opportunityScope({ id: "a", role: "ADMIN" })).toEqual({ deletedAt: null });
    // Presales and purchase can read every deal
    expect(opportunityScope({ id: "p1", role: "PRESALES" })).toEqual({ deletedAt: null });
    expect(opportunityScope({ id: "b1", role: "PURCHASE" })).toEqual({ deletedAt: null });
  });
});
