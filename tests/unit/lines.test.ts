import { describe, expect, it } from "vitest";
import { defaultNeedsPresales, deriveLine, lineFieldWhitelist, lineValidationErrors, rollupDeal, salesMethodAllowed } from "@/domain/lines";

describe("line arithmetic", () => {
  it("one-time: value = quantity × price, GM from price and cost", () => {
    expect(deriveLine({ quantity: 10, revenueModel: "ONE_TIME", termMonths: null, unitSalesPrice: "1000.00", unitPurchaseCost: 800 })).toEqual({
      annualValue: null, lineValue: "10000.00", lineCost: "8000.00", expectedGmPct: "20.00",
    });
  });
  it("ARR: annual = quantity × price, value over the term", () => {
    const d = deriveLine({ quantity: 2, revenueModel: "ARR", termMonths: 36, unitSalesPrice: 120000, unitPurchaseCost: 90000 });
    expect(d).toEqual({ annualValue: "240000.00", lineValue: "720000.00", lineCost: "540000.00", expectedGmPct: "25.00" });
  });
  it("no price means no value; no cost means no GM", () => {
    expect(deriveLine({ quantity: 3, revenueModel: "ONE_TIME", termMonths: null, unitSalesPrice: null, unitPurchaseCost: 5 })).toMatchObject({ lineValue: null, lineCost: "15.00", expectedGmPct: null });
    expect(deriveLine({ quantity: 3, revenueModel: "ONE_TIME", termMonths: null, unitSalesPrice: 10, unitPurchaseCost: null }).expectedGmPct).toBeNull();
  });
  it("rounds half up to the paisa", () => {
    expect(deriveLine({ quantity: 3, revenueModel: "ONE_TIME", termMonths: null, unitSalesPrice: "0.005", unitPurchaseCost: null }).lineValue).toBe("0.02");
  });
});

describe("deal roll-up", () => {
  const line = (lineNo: number, p: Record<string, unknown>) => ({
    lineNo, revenueModel: "ONE_TIME" as const, businessUnitId: "bu1", oemId: "oem1", unitSalesPrice: 1, annualValue: null, lineValue: null, lineCost: null, expectedGmPct: null, ...p,
  });
  it("sums values, splits one-time and ARR, takes the primary BU/OEM from the largest line", () => {
    const r = rollupDeal([
      line(1, { lineValue: "100.00", lineCost: "80.00", businessUnitId: "bu1", oemId: "dell" }),
      line(2, { revenueModel: "ARR", lineValue: "300.00", annualValue: "100.00", lineCost: "150.00", businessUnitId: "bu2", oemId: "neon" }),
    ]);
    expect(r).toEqual({ dealValue: "400.00", oneTimeValue: "100.00", annualRecurringValue: "100.00", totalCost: "230.00", expectedGmPct: "42.50", primaryBusinessUnitId: "bu2", primaryOemId: "neon" });
  });
  it("cost and GM are unknown while any priced line has no cost; ties go to the lower line number", () => {
    const r = rollupDeal([line(2, { lineValue: "50.00", lineCost: null, oemId: "b" }), line(1, { lineValue: "50.00", lineCost: "10.00", oemId: "a" })]);
    expect(r.totalCost).toBeNull();
    expect(r.expectedGmPct).toBeNull();
    expect(r.primaryOemId).toBe("a");
  });
  it("an unpriced deal has zero value and no cost, but still a primary dimension from its first line", () => {
    const r = rollupDeal([line(3, { unitSalesPrice: null, oemId: "z" }), line(1, { unitSalesPrice: null, oemId: "x" })]);
    expect(r).toMatchObject({ dealValue: "0.00", totalCost: null, expectedGmPct: null, primaryOemId: "x" });
  });
});

describe("line rules", () => {
  it("needs presales when any line's Sub BU is flagged", () => {
    const subs = [{ id: "server", needsPresales: true }, { id: "laptop", needsPresales: false }];
    expect(defaultNeedsPresales(["laptop"], subs)).toBe(false);
    expect(defaultNeedsPresales(["laptop", "server"], subs)).toBe(true);
  });
  it("sales method only for third-party OEMs", () => {
    expect(salesMethodAllowed(true)).toBe(false);
    expect(salesMethodAllowed(false)).toBe(true);
  });
  it("validation: quantity, term for ARR, no sales method on own IP", () => {
    expect(lineValidationErrors({ revenueModel: "ARR", termMonths: null, salesMethodId: null, quantity: 1, unitSalesPrice: null, unitPurchaseCost: null }, false)[0]).toMatch(/term/);
    expect(lineValidationErrors({ revenueModel: "ONE_TIME", termMonths: null, salesMethodId: "sm", quantity: 0, unitSalesPrice: null, unitPurchaseCost: null }, true)).toEqual([
      "Quantity must be more than zero.", "Own-IP lines have no sales method.",
    ]);
    expect(lineValidationErrors({ revenueModel: "ONE_TIME", termMonths: null, salesMethodId: null, quantity: 1, unitSalesPrice: -1, unitPurchaseCost: null }, false)[0]).toMatch(/negative/);
  });
  it("who may change which fields", () => {
    const base = { canEditDeal: false, isAssignedPresales: false, isAssignedPurchase: false, dealOpen: true, lineOwnIp: false, openPresalesRequest: false, openPricingRequest: false } as const;
    expect([...lineFieldWhitelist({ ...base, role: "ADMIN" })]).toEqual(["spec", "price", "cost", "delete"]);
    expect([...lineFieldWhitelist({ ...base, role: "SALES", canEditDeal: true })]).toEqual(["spec", "price", "delete"]);
    expect([...lineFieldWhitelist({ ...base, role: "SALES" })]).toEqual([]);
    expect([...lineFieldWhitelist({ ...base, role: "PRESALES", isAssignedPresales: true })]).toEqual(["spec", "delete"]);
    expect([...lineFieldWhitelist({ ...base, role: "PRESALES", isAssignedPresales: true, lineOwnIp: true })]).toContain("cost");
    expect([...lineFieldWhitelist({ ...base, role: "PURCHASE", isAssignedPurchase: true })]).toEqual(["cost"]);
    expect([...lineFieldWhitelist({ ...base, role: "PURCHASE" })]).toEqual([]);
    expect([...lineFieldWhitelist({ ...base, role: "ADMIN", dealOpen: false })]).toEqual([]);
  });
  it("while presales builds the BOQ the lines are theirs; while purchase prices them, what is sold is frozen", () => {
    const base = { canEditDeal: true, isAssignedPresales: true, isAssignedPurchase: true, dealOpen: true, lineOwnIp: false, openPresalesRequest: false, openPricingRequest: false } as const;
    expect([...lineFieldWhitelist({ ...base, role: "SALES", openPresalesRequest: true })]).toEqual([]);
    expect([...lineFieldWhitelist({ ...base, role: "SALES", openPricingRequest: true })]).toEqual(["price"]);
    expect([...lineFieldWhitelist({ ...base, role: "SALES_HEAD", openPresalesRequest: true })]).toEqual([]);
    expect([...lineFieldWhitelist({ ...base, role: "PRESALES", openPricingRequest: true })]).toEqual([]);
    expect([...lineFieldWhitelist({ ...base, role: "PRESALES", openPricingRequest: true, lineOwnIp: true })]).toEqual(["cost"]);
    expect([...lineFieldWhitelist({ ...base, role: "PURCHASE", openPricingRequest: true })]).toEqual(["cost"]);
    expect([...lineFieldWhitelist({ ...base, role: "ADMIN", openPresalesRequest: true, openPricingRequest: true })]).toEqual(["spec", "price", "cost", "delete"]);
  });
});
