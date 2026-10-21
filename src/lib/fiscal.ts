// Indian fiscal year: April to March. FY "2026-27" is labelled FY27 and identified by its end year 2027.
// Quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar.

export type FiscalPeriod = { fiscalYear: number; quarter: 1 | 2 | 3 | 4 };

/** Calendar parts in IST so period boundaries match what users see. */
function istParts(d: Date) {
  const s = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [y, m] = s.split("-").map(Number);
  return { year: y!, month: m! }; // month 1-12
}

export function fiscalPeriod(d: Date): FiscalPeriod {
  const { year, month } = istParts(d);
  const fiscalYear = month >= 4 ? year + 1 : year;
  const quarter = (month >= 4 ? Math.floor((month - 4) / 3) + 1 : 4) as 1 | 2 | 3 | 4;
  return { fiscalYear, quarter };
}

/** IST midnight for a calendar date, expressed as a UTC Date. */
function istDate(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day) - 330 * 60_000);
}

export function quarterRange(fy: number, q: number): { start: Date; end: Date } {
  const startMonth = q === 4 ? 1 : 4 + (q - 1) * 3; // 1-12
  const startYear = q === 4 ? fy : fy - 1;
  const start = istDate(startYear, startMonth, 1);
  const endMonth = startMonth + 3;
  const end = endMonth > 12 ? istDate(startYear + 1, endMonth - 12, 1) : istDate(startYear, endMonth, 1);
  return { start, end }; // end exclusive
}

export function fiscalYearRange(fy: number): { start: Date; end: Date } {
  return { start: istDate(fy - 1, 4, 1), end: istDate(fy, 4, 1) };
}

export function fyLabel(fy: number): string {
  return `FY${String(fy).slice(-2)}`;
}

export function periodLabel(p: FiscalPeriod): string {
  return `Q${p.quarter} ${fyLabel(p.fiscalYear)}`;
}

/** Parse "FY27-Q3" / "FY27" / "this-q" style period keys used in filters */
export function parsePeriodKey(key: string | undefined, now = new Date()): { start: Date; end: Date; label: string } | null {
  if (!key) return null;
  const cur = fiscalPeriod(now);
  if (key === "this-q") return { ...quarterRange(cur.fiscalYear, cur.quarter), label: periodLabel(cur) };
  if (key === "next-q") {
    const n = cur.quarter === 4 ? { fiscalYear: cur.fiscalYear + 1, quarter: 1 as const } : { fiscalYear: cur.fiscalYear, quarter: (cur.quarter + 1) as 1 | 2 | 3 | 4 };
    return { ...quarterRange(n.fiscalYear, n.quarter), label: periodLabel(n) };
  }
  if (key === "this-fy") return { ...fiscalYearRange(cur.fiscalYear), label: fyLabel(cur.fiscalYear) };
  const m = /^FY(\d{2})(?:-Q([1-4]))?$/.exec(key);
  if (!m) return null;
  const fy = 2000 + Number(m[1]);
  if (m[2]) return { ...quarterRange(fy, Number(m[2])), label: `Q${m[2]} ${fyLabel(fy)}` };
  return { ...fiscalYearRange(fy), label: fyLabel(fy) };
}

/** Last n fiscal months (IST) as {key:'2026-10', label:'Oct 26', start, end} oldest first. */
export function lastMonths(n: number, now = new Date()) {
  const { year, month } = istParts(now);
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const start = istDate(y, m, 1);
    const end = m === 12 ? istDate(y + 1, 1, 1) : istDate(y, m + 1, 1);
    const label = start.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "2-digit" });
    out.push({ key: `${y}-${String(m).padStart(2, "0")}`, label, start, end });
  }
  return out;
}

/** Period options for filter chips: this/next quarter, this FY, plus each quarter of current and previous FY. */
export function periodOptions(now = new Date()) {
  const cur = fiscalPeriod(now);
  const out = [
    { value: "this-q", label: `This quarter (${periodLabel(cur)})` },
    { value: "next-q", label: "Next quarter" },
    { value: "this-fy", label: `This year (${fyLabel(cur.fiscalYear)})` },
  ];
  for (const fy of [cur.fiscalYear, cur.fiscalYear - 1]) {
    for (const q of [1, 2, 3, 4]) {
      if (fy === cur.fiscalYear && q > cur.quarter + 1) continue;
      out.push({ value: `FY${String(fy).slice(-2)}-Q${q}`, label: `Q${q} ${fyLabel(fy)}` });
    }
    if (fy !== cur.fiscalYear) out.push({ value: `FY${String(fy).slice(-2)}`, label: fyLabel(fy) });
  }
  return out;
}
