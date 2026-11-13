import { describe, it, expect } from "vitest";
import { gmSummary, priceAtMargin } from "@/lib/boq";

describe("gross margin", () => {
  it("prices a cost at a margin of the sales price, to the paisa", () => {
    expect(priceAtMargin(85, 15)).toBe(100);
    expect(priceAtMargin(0.34, 15)).toBe(0.4);
    expect(priceAtMargin(1000, 0)).toBe(1000); // rate to rate
  });

  it("contract GM covers one-time lines and recurring lines over their term; monthly GM covers recurring lines", () => {
    const s = gmSummary([
      { quantity: 10, unitCost: 900, unitPrice: 1000, billingFrequency: "ONE_TIME", termMonths: null }, // 10,000 / 9,000
      { quantity: 50, unitCost: 300, unitPrice: 500, billingFrequency: "MONTHLY", termMonths: 36 }, // 25,000 / 15,000 a month
      { quantity: 2, unitCost: 3000, unitPrice: 6000, billingFrequency: "QUARTERLY", termMonths: 12 }, // 4,000 / 2,000 a month
    ]);
    expect(s.contract.value).toBe(10_000 + 25_000 * 36 + 12_000 * 4);
    expect(s.contract.cost).toBe(9_000 + 15_000 * 36 + 6_000 * 4);
    expect(s.monthly).toEqual({ value: 29_000, cost: 17_000, gm: 12_000, gmPct: (12_000 / 29_000) * 100 });
  });

  it("lines without a price or cost are left out; nothing recurring means no monthly GM", () => {
    const s = gmSummary([
      { quantity: 1, unitCost: 80, unitPrice: 100, billingFrequency: "ONE_TIME", termMonths: null },
      { quantity: 1, unitCost: null, unitPrice: 500, billingFrequency: "ONE_TIME", termMonths: null },
    ]);
    expect(s.contract).toEqual({ value: 100, cost: 80, gm: 20, gmPct: 20 });
    expect(s.monthly).toBeNull();
    expect(gmSummary([]).contract.gmPct).toBeNull();
  });
});
