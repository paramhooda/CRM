import { describe, it, expect } from "vitest";
import { linesNeedingQuote, uncoveredLines, type CoverLine } from "@/lib/quote-coverage";

const now = new Date("2026-11-13T06:00:00Z");
const raised = new Date("2026-11-10T06:00:00Z");
const line = (p: Partial<CoverLine> & { id: string; lineNo: number }): CoverLine => ({
  isEstimate: false, costSource: "PURCHASE", ownBrand: false, costSetAt: null, pricingStatus: "QUOTED", costValidTill: new Date("2026-12-31"), ...p,
});

describe("supplier quotes behind purchase prices", () => {
  const lines = [
    line({ id: "a", lineNo: 1, costSetAt: new Date("2026-11-11") }), // priced in this request
    line({ id: "b", lineNo: 2, pricingStatus: "PENDING" }), // in the request, confirmed by completing
    line({ id: "c", lineNo: 3, costSetAt: new Date("2026-10-01") }), // priced earlier, unchanged
    line({ id: "d", lineNo: 4, costValidTill: new Date("2026-11-01") }), // lapsed: renewed now
    line({ id: "e", lineNo: 5, costSource: "RATE_CARD", pricingStatus: "PENDING" }),
    line({ id: "f", lineNo: 6, ownBrand: true, costSetAt: new Date("2026-11-11") }), // Progression bought in
  ];
  it("asks only for lines priced in this request, never for rate card or own-brand lines", () => {
    expect(linesNeedingQuote(lines, raised, now).map((l) => l.lineNo)).toEqual([1, 2, 4]);
  });
  it("one quote can cover several lines", () => {
    const need = linesNeedingQuote(lines, raised, now);
    expect(uncoveredLines(need, ["a", "b"])).toEqual([4]);
    expect(uncoveredLines(need, ["a", "b", "d"])).toEqual([]);
  });
});
