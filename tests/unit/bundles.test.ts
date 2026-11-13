import { describe, it, expect } from "vitest";
import { bundleProblems, bundlesOf, linesLabel, type BundleLine } from "@/lib/bundles";

const line = (lineNo: number, p: Partial<BundleLine> = {}): BundleLine => ({
  lineNo, costSource: "PURCHASE", isEstimate: false, billingFrequency: "ONE_TIME", termMonths: null, bundleWith: null, ...p,
});

describe("bundles", () => {
  it("a server with its RAM and disks shares one price", () => {
    expect(bundleProblems([line(1), line(2, { bundleWith: 0 }), line(3, { bundleWith: 0 }), line(4)])).toEqual([]);
  });
  it("one level only, never itself, and only lines purchase prices", () => {
    expect(bundleProblems([line(1, { bundleWith: 0 })])[0]).toMatch(/itself/);
    expect(bundleProblems([line(1), line(2, { bundleWith: 0 }), line(3, { bundleWith: 1 })])[0]).toMatch(/itself priced with another line/);
    expect(bundleProblems([line(1, { costSource: "RATE_CARD" }), line(2, { bundleWith: 0 })])[0]).toMatch(/only lines purchase prices/);
    expect(bundleProblems([line(1), line(2, { bundleWith: 5 })])[0]).toMatch(/no longer on the BOQ/);
  });
  it("lines priced together share the billing and term", () => {
    expect(bundleProblems([line(1), line(2, { billingFrequency: "MONTHLY", termMonths: 36, bundleWith: 0 })])[0]).toMatch(/bills differently/);
    const m = { billingFrequency: "MONTHLY", termMonths: 36 };
    expect(bundleProblems([line(1, m), line(2, { ...m, bundleWith: 0 })])).toEqual([]);
    expect(bundleProblems([line(1, m), line(2, { ...m, termMonths: 12, bundleWith: 0 })])[0]).toMatch(/bills differently/);
  });
  it("labels and groups", () => {
    expect(linesLabel([3])).toBe("line 3");
    expect(linesLabel([2, 1, 3])).toBe("lines 1–3");
    expect(linesLabel([1, 3, 5])).toBe("lines 1, 3, 5");
    const g = bundlesOf([
      { id: "a", lineNo: 1, bundleLeadId: null }, { id: "b", lineNo: 2, bundleLeadId: "a" }, { id: "c", lineNo: 3, bundleLeadId: "a" }, { id: "d", lineNo: 4, bundleLeadId: null },
    ]);
    expect([...g.entries()]).toEqual([[1, [1, 2, 3]]]);
  });
});
