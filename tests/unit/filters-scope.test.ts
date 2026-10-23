import { describe, it, expect, vi } from "vitest";
import { attribute, scopeSlices, hasLineFilter } from "@/lib/attribution";
import { oppWhere, parseOppFilters, lineScopeLabel, parseAge } from "@/lib/filters";
import { parsePeriodKey } from "@/lib/fiscal";

vi.mock("server-only", () => ({}));

const line = (oemId: string, oem: string, unitPrice: number, bu = "bu1", cat = "c1") => ({
  quantity: 1, unitPrice, billingFrequency: "ONE_TIME" as const, termMonths: null,
  businessUnit: bu, category: cat, oem, product: null, businessUnitId: bu, categoryId: cat, oemId,
});

describe("OEM / BU filters count only the matching share of mixed deals", () => {
  // ₹1 Cr deal: Dell ₹40 L + HPE ₹60 L
  const slices = attribute({ amount: 10_000_000, businessUnit: "bu1", category: "c1", oem: "Dell" }, [line("dell", "Dell", 4_000_000), line("hpe", "HPE", 6_000_000)]);
  const none = { bu: [], cat: [], oem: [] };

  it("returns Dell's share when filtering by Dell", () => {
    expect(Math.round(scopeSlices(slices, { ...none, oem: ["dell"] }).amount)).toBe(4_000_000);
    expect(Math.round(scopeSlices(slices, { ...none, oem: ["dell", "hpe"] }).amount)).toBe(10_000_000);
  });

  it("returns the whole deal without a line filter", () => {
    expect(hasLineFilter(none)).toBe(false);
    expect(Math.round(scopeSlices(slices, none).amount)).toBe(10_000_000);
  });

  it("requires one line to match every line filter", () => {
    expect(scopeSlices(slices, { bu: ["bu2"], cat: [], oem: ["dell"] }).amount).toBe(0);
  });
});

describe("oppWhere", () => {
  it("matches BU, category and OEM on line items only, combined on one line", () => {
    const w = oppWhere(parseOppFilters({ oem: "dell", bu: "bu1" })) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ lineItems: { some: { businessUnitId: { in: ["bu1"] }, oemId: { in: ["dell"] } } } });
    expect(JSON.stringify(w)).not.toContain('"oemId":{"in":["dell"]}},{');
  });

  it("maps status and age to stages and creation dates", () => {
    const w = oppWhere(parseOppFilters({ status: "won,lost" })) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ stage: { in: ["WON", "LOST", "DROPPED"] } });
    expect(parseAge("31-60")).toEqual({ min: 31, max: 60 });
    expect(parseAge("181-")).toEqual({ min: 181, max: null });
    expect(parseAge("abc")).toBeNull();
  });

  it("labels the active line filter", () => {
    const names = { bus: [{ id: "bu1", name: "Cloud" }], categories: [], oems: [{ id: "dell", name: "Dell" }] };
    expect(lineScopeLabel(parseOppFilters({ oem: "dell" }), names)).toBe("Dell");
    expect(lineScopeLabel(parseOppFilters({ oem: "dell", bu: "bu1" }), names)).toBe("Cloud · Dell");
    expect(lineScopeLabel(parseOppFilters({}), names)).toBeNull();
  });
});

describe("period keys", () => {
  const now = new Date("2026-10-23T06:00:00Z");
  it("parses calendar months in IST", () => {
    const r = parsePeriodKey("M2026-08", now)!;
    expect(r.start.toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });
  it("parses inclusive custom ranges", () => {
    const r = parsePeriodKey("R2026-10-01_2026-10-31", now)!;
    expect(r.start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(parsePeriodKey("R2026-10-31_2026-10-01", now)).toBeNull();
  });
  it("parses last quarter and rolling windows", () => {
    expect(parsePeriodKey("last-q", now)!.label).toBe("Q2 FY27");
    const n = parsePeriodKey("next-30", now)!;
    expect(Math.round((n.end.getTime() - n.start.getTime()) / 86_400_000)).toBe(31);
  });
});

describe("estimate lines", () => {
  it("block closing as won until replaced with catalogue products", async () => {
    const { billingReadinessIssues } = await import("@/server/domain/billing");
    const tx = (lines: unknown[]) => ({ opportunityLineItem: { findMany: async () => lines } }) as never;
    const issues = await billingReadinessIssues(tx([{ lineNo: 1, unitPrice: 100, hsnSac: null, isEstimate: true, product: null }]), "o1");
    expect(issues).toEqual(["Replace estimate line 1 with catalogue products."]);
  });
});
