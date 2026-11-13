// Fiscal calendar: April to March, labelled by the end year (FY27 = April 2026 to March 2027). Dates are taken in
// IST, the business's calendar, so a deal closing on 31 March IST belongs to the right year wherever the server runs.

const IST_OFFSET_MIN = 330;

/** The calendar date (year, month 1–12, day) of an instant in IST. */
export function istDate(d: Date): { year: number; month: number; day: number } {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Fiscal year (end year) of an instant or a calendar date. */
export function fiscalYearOf(d: Date | { year: number; month: number }): number {
  const { year, month } = d instanceof Date ? istDate(d) : d;
  return month >= 4 ? year + 1 : year;
}

/** Fiscal quarter 1–4 (Q1 = April–June). */
export function fiscalQuarterOf(d: Date | { year: number; month: number }): number {
  const { month } = d instanceof Date ? istDate(d) : d;
  return Math.floor(((month + 8) % 12) / 3) + 1;
}

export function fyLabel(fiscalYear: number): string {
  return `FY${String(fiscalYear).slice(-2)}`;
}

/** Start of a UTC day for a calendar date (used for date-only columns). */
export function dateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export type DateRange = { from: Date; to: Date; label: string };

/** First and last calendar day (inclusive) of a fiscal quarter, as date-only values. */
export function quarterRange(fiscalYear: number, quarter: number): DateRange {
  const startMonth = 4 + (quarter - 1) * 3; // 4, 7, 10, 13
  const startYear = startMonth > 12 ? fiscalYear : fiscalYear - 1;
  const sm = ((startMonth - 1) % 12) + 1;
  const from = dateOnly(startYear, sm, 1);
  const endExclusive = dateOnly(sm + 3 > 12 ? startYear + 1 : startYear, ((sm + 2) % 12) + 1, 1);
  const to = new Date(endExclusive.getTime() - 86_400_000);
  return { from, to, label: `${fyLabel(fiscalYear)} Q${quarter}` };
}

export function fiscalYearRange(fiscalYear: number): DateRange {
  return { from: dateOnly(fiscalYear - 1, 4, 1), to: dateOnly(fiscalYear, 3, 31), label: fyLabel(fiscalYear) };
}

export type PeriodKey = "this-q" | "next-q" | "last-q" | "this-fy" | "last-fy" | "next-30" | "next-60" | "next-90" | "all";

/**
 * Turns a period key from the URL into a date range on expected close date. Accepts the named keys, `FY27-Q3`,
 * `FY27`, and `R2026-10-01_2026-12-31`. Unknown keys mean "all time" (null).
 */
export function parsePeriodKey(key: string | null | undefined, now = new Date()): DateRange | null {
  if (!key || key === "all") return null;
  const fy = fiscalYearOf(now);
  const q = fiscalQuarterOf(now);
  const { year, month, day } = istDate(now);
  const today = dateOnly(year, month, day);
  const shift = (range: { fy: number; q: number }, by: number) => {
    let qq = range.q + by;
    let f = range.fy;
    while (qq > 4) { qq -= 4; f += 1; }
    while (qq < 1) { qq += 4; f -= 1; }
    return quarterRange(f, qq);
  };
  switch (key) {
    case "this-q": return shift({ fy, q }, 0);
    case "next-q": return shift({ fy, q }, 1);
    case "last-q": return shift({ fy, q }, -1);
    case "this-fy": return fiscalYearRange(fy);
    case "last-fy": return fiscalYearRange(fy - 1);
    case "next-30":
    case "next-60":
    case "next-90": {
      const days = Number(key.slice(5));
      return { from: today, to: new Date(today.getTime() + days * 86_400_000), label: `Next ${days} days` };
    }
  }
  const fyq = /^FY(\d{2})-Q([1-4])$/.exec(key);
  if (fyq) return quarterRange(2000 + Number(fyq[1]), Number(fyq[2]));
  const fyOnly = /^FY(\d{2})$/.exec(key);
  if (fyOnly) return fiscalYearRange(2000 + Number(fyOnly[1]));
  const custom = /^R(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (custom) {
    const from = new Date(`${custom[1]}T00:00:00Z`);
    const to = new Date(`${custom[2]}T00:00:00Z`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) return { from, to, label: `${custom[1]} to ${custom[2]}` };
  }
  return null;
}

/** Period choices for filter bars. */
export function periodOptions(now = new Date()): { key: PeriodKey | string; label: string }[] {
  const fy = fiscalYearOf(now);
  const q = fiscalQuarterOf(now);
  return [
    { key: "this-q", label: `This quarter (${fyLabel(fy)} Q${q})` },
    { key: "next-q", label: "Next quarter" },
    { key: "last-q", label: "Last quarter" },
    { key: "this-fy", label: `This year (${fyLabel(fy)})` },
    { key: "last-fy", label: `Last year (${fyLabel(fy - 1)})` },
    { key: "next-90", label: "Next 90 days" },
    { key: "all", label: "All time" },
  ];
}

/** Days from `a` to `b` (fractional), for time-in-stage. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round(((b.getTime() - a.getTime()) / 86_400_000) * 100) / 100;
}
