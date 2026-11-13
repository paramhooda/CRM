import { describe, expect, it } from "vitest";
import { daysBetween, fiscalQuarterOf, fiscalYearOf, fyLabel, parsePeriodKey, quarterRange } from "@/domain/fiscal";
import { inr, pct } from "@/domain/money";
import { formatCode, sequenceKey } from "@/domain/codes";
import { toCsv } from "@/domain/csv";
import { ipBlocked, isLocked, lockUntil } from "@/domain/rate-limit";

describe("fiscal calendar", () => {
  it("April to March, labelled by the end year, in IST", () => {
    expect(fiscalYearOf(new Date("2026-11-13T10:00:00Z"))).toBe(2027);
    expect(fiscalYearOf(new Date("2026-03-31T20:00:00Z"))).toBe(2027); // 1 April 01:30 IST
    expect(fiscalYearOf(new Date("2026-03-31T10:00:00Z"))).toBe(2026);
    expect(fiscalQuarterOf({ year: 2026, month: 4 })).toBe(1);
    expect(fiscalQuarterOf({ year: 2026, month: 11 })).toBe(3);
    expect(fiscalQuarterOf({ year: 2027, month: 3 })).toBe(4);
    expect(fyLabel(2027)).toBe("FY27");
  });
  it("quarter ranges and period keys", () => {
    const q3 = quarterRange(2027, 3);
    expect(q3.from.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(q3.to.toISOString().slice(0, 10)).toBe("2026-12-31");
    const q4 = quarterRange(2027, 4);
    expect([q4.from.toISOString().slice(0, 10), q4.to.toISOString().slice(0, 10)]).toEqual(["2027-01-01", "2027-03-31"]);
    const now = new Date("2026-11-13T10:00:00Z");
    expect(parsePeriodKey("this-q", now)?.label).toBe("FY27 Q3");
    expect(parsePeriodKey("next-q", now)?.label).toBe("FY27 Q4");
    expect(parsePeriodKey("last-fy", now)?.label).toBe("FY26");
    expect(parsePeriodKey("FY28-Q1")?.from.toISOString().slice(0, 10)).toBe("2027-04-01");
    expect(parsePeriodKey("R2026-10-01_2026-10-31")?.label).toBe("2026-10-01 to 2026-10-31");
    expect(parsePeriodKey("R2026-10-31_2026-10-01")).toBeNull();
    expect(parsePeriodKey("all")).toBeNull();
    expect(parsePeriodKey("junk")).toBeNull();
  });
  it("days between", () => {
    expect(daysBetween(new Date("2026-01-01"), new Date("2026-01-11T12:00:00Z"))).toBe(10.5);
  });
});

describe("money", () => {
  it("lakh and crore", () => {
    expect(inr(950)).toBe("₹950");
    expect(inr(85000)).toBe("₹85K");
    expect(inr(4860000)).toBe("₹48.6 L");
    expect(inr(12500000)).toBe("₹1.25 Cr");
    expect(inr("10000000.00")).toBe("₹1 Cr");
    expect(inr(-250000)).toBe("-₹2.5 L");
    expect(inr(null)).toBe("—");
    expect(inr(1234.5, { precise: true })).toBe("₹1,234.50");
    expect(pct("42.5")).toBe("42.5%");
  });
});

describe("codes", () => {
  it("deals are numbered per fiscal year", () => {
    expect(sequenceKey("OPP", new Date("2026-11-13"))).toBe("OPP-FY27");
    expect(sequenceKey("ACC")).toBe("ACC");
    expect(formatCode("OPP-FY27", 42)).toBe("OPP-FY27-0042");
    expect(formatCode("ACC", 12345n)).toBe("ACC-12345");
  });
});

describe("csv", () => {
  it("BOM, CRLF, quoting and formula neutralising", () => {
    const csv = toCsv([{ header: "Name", value: (r: { n: string }) => r.n }, { header: "Note", value: (r: { x: unknown }) => r.x }], [{ n: "Acme, Ltd", x: '=SUM(A1)' }, { n: "Plain", x: null }]);
    expect(csv).toBe('﻿Name,Note\r\n"Acme, Ltd",\'=SUM(A1)\r\nPlain,\r\n');
  });
});

describe("rate limit", () => {
  it("locks after ten failures and blocks an address after thirty", () => {
    const now = new Date("2026-11-13T10:00:00Z");
    expect(lockUntil(9, now)).toBeNull();
    expect(lockUntil(10, now)?.toISOString()).toBe("2026-11-13T10:15:00.000Z");
    expect(isLocked(new Date("2026-11-13T10:10:00Z"), now)).toBe(true);
    expect(isLocked(new Date("2026-11-13T09:00:00Z"), now)).toBe(false);
    expect(ipBlocked(29)).toBe(false);
    expect(ipBlocked(30)).toBe(true);
  });
});
