import { describe, it, expect } from "vitest";
import { fiscalPeriod, quarterRange, parsePeriodKey, fyLabel, lastMonths } from "@/lib/fiscal";
import { inr, inrAxis, isoDate, relativeDays } from "@/lib/format";

describe("Indian fiscal year (April–March)", () => {
  it("assigns quarters correctly", () => {
    expect(fiscalPeriod(new Date("2026-04-01T00:00:00+05:30"))).toEqual({ fiscalYear: 2027, quarter: 1 });
    expect(fiscalPeriod(new Date("2026-10-21T12:00:00+05:30"))).toEqual({ fiscalYear: 2027, quarter: 3 });
    expect(fiscalPeriod(new Date("2027-03-31T23:30:00+05:30"))).toEqual({ fiscalYear: 2027, quarter: 4 });
    expect(fiscalPeriod(new Date("2026-03-31T23:59:00+05:30"))).toEqual({ fiscalYear: 2026, quarter: 4 });
  });
  it("uses IST boundaries, not UTC", () => {
    // 31 Mar 2026 19:00 UTC is already 1 Apr in India
    expect(fiscalPeriod(new Date("2026-03-31T19:00:00Z"))).toEqual({ fiscalYear: 2027, quarter: 1 });
  });
  it("builds quarter ranges", () => {
    const q3 = quarterRange(2027, 3);
    expect(isoDate(q3.start)).toBe("2026-10-01");
    expect(isoDate(new Date(q3.end.getTime() - 1))).toBe("2026-12-31");
    const q4 = quarterRange(2027, 4);
    expect(isoDate(q4.start)).toBe("2027-01-01");
  });
  it("parses period keys", () => {
    expect(parsePeriodKey("FY27-Q2")?.label).toBe("Q2 FY27");
    expect(parsePeriodKey("FY26")?.label).toBe("FY26");
    expect(parsePeriodKey("nonsense")).toBeNull();
    expect(fyLabel(2027)).toBe("FY27");
  });
  it("lists the last n months oldest first", () => {
    const m = lastMonths(3, new Date("2026-02-10T10:00:00+05:30"));
    expect(m.map((x) => x.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("INR formatting", () => {
  it("uses lakh and crore", () => {
    expect(inr(12_500_000)).toBe("₹1.25 Cr");
    expect(inr(4_860_000)).toBe("₹48.6 L");
    expect(inr(250_000)).toBe("₹2.5 L");
    expect(inr(85_000)).toBe("₹85K");
    expect(inr(-150_000)).toBe("-₹1.5 L");
    expect(inr(1234567.5, { precise: true })).toBe("₹12,34,567.5");
  });
  it("formats axis ticks compactly", () => {
    expect(inrAxis(30_000_000)).toBe("3Cr");
    expect(inrAxis(4_500_000)).toBe("45L");
  });
  it("describes relative days", () => {
    const now = new Date("2026-10-21T10:00:00Z");
    expect(relativeDays(new Date("2026-10-11T10:00:00Z"), now)).toBe("10d ago");
    expect(relativeDays(new Date("2026-10-22T10:00:00Z"), now)).toBe("tomorrow");
    expect(relativeDays(null, now)).toBe("never");
  });
});
