// Is the latest quote still what the deal will bill? (pure, unit-tested)
// A quote is a promise to the customer about lines and prices. If anything the customer sees changed after it was
// sent (a line, quantity, term, unit price or GST rate), the quote no longer describes the deal: it can't be accepted
// and the deal can't be won until a revised quote goes out. Costs and margins are internal and don't count.

export type QuotedLine = {
  lineNo: number;
  partNumber: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  billingFrequency: string;
  termMonths: number | null;
  unitPrice: number | null;
  /** Missing on quotes issued before GST was recorded per line */
  gstRatePct?: number | null;
};

type LineRow = {
  lineNo: number; partNumber: string | null; description: string; quantity: unknown; unit: string | null;
  billingFrequency: string; termMonths: number | null; unitPrice: unknown; gstRatePct?: unknown;
  product?: { gstRatePct?: unknown } | null;
};

/** A BOQ line as the customer sees it on a quote. Used both for the quote snapshot and to compare against it. */
export function quotedLine(l: LineRow): QuotedLine {
  const gst = l.gstRatePct ?? l.product?.gstRatePct ?? null;
  return {
    lineNo: l.lineNo, partNumber: l.partNumber, description: l.description, quantity: Number(l.quantity), unit: l.unit,
    billingFrequency: l.billingFrequency, termMonths: l.termMonths,
    unitPrice: l.unitPrice === null || l.unitPrice === undefined ? null : Number(l.unitPrice),
    gstRatePct: gst === null || gst === undefined ? null : Number(gst),
  };
}

const LIVE = ["SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED"];
export const isLiveQuote = (status: string | null | undefined) => !!status && LIVE.includes(status);

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Math.round(Number(v) * 100) / 100);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().replace(/\s+/g, " "));

/** Read a stored quote snapshot defensively (it is JSON written by createQuote) */
export function snapshotLines(snapshot: unknown): QuotedLine[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((r: Record<string, unknown>) => ({
    lineNo: Number(r.lineNo),
    partNumber: (r.partNumber as string | null) ?? null,
    description: s(r.description),
    quantity: Number(r.quantity),
    unit: (r.unit as string | null) ?? null,
    billingFrequency: s(r.billingFrequency),
    termMonths: r.termMonths === null || r.termMonths === undefined ? null : Number(r.termMonths),
    unitPrice: n(r.unitPrice),
    gstRatePct: r.gstRatePct === undefined ? undefined : n(r.gstRatePct),
  }));
}

function key(l: QuotedLine, withGst: boolean) {
  const termed = l.billingFrequency === "ONE_TIME" ? "" : String(l.termMonths ?? "");
  return [l.lineNo, s(l.partNumber), s(l.description), n(l.quantity), s(l.unit), s(l.billingFrequency), termed, n(l.unitPrice), withGst ? n(l.gstRatePct) : ""].join("|");
}

/** A stable description of what the customer sees, line by line. */
export function quoteFingerprint(lines: QuotedLine[], withGst = true): string {
  return [...lines].sort((a, b) => a.lineNo - b.lineNo).map((l) => key(l, withGst)).join("\n");
}

/**
 * Do the deal's current lines still match the quote? GST is compared only when the quote recorded it. A quote with
 * no recorded lines (imported or very old) can't be compared: null, and callers fall back to the older rule.
 */
export function quoteMatchesLines(snapshot: unknown, current: QuotedLine[]): boolean | null {
  const quoted = snapshotLines(snapshot);
  if (!quoted.length) return null;
  const withGst = quoted.every((l) => l.gstRatePct !== undefined);
  return quoteFingerprint(quoted, withGst) === quoteFingerprint(current, withGst);
}

/** First differing line, for a message like "Line 3 changed since quote v2" (null when they match). */
export function firstDifference(snapshot: unknown, current: QuotedLine[]): string | null {
  const quoted = snapshotLines(snapshot);
  const withGst = quoted.length > 0 && quoted.every((l) => l.gstRatePct !== undefined);
  const a = new Map(quoted.map((l) => [l.lineNo, key(l, withGst)]));
  const b = new Map(current.map((l) => [l.lineNo, key(l, withGst)]));
  for (const no of [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y)) {
    if (!a.has(no)) return `line ${no} was added`;
    if (!b.has(no)) return `line ${no} was removed`;
    if (a.get(no) !== b.get(no)) return `line ${no} changed`;
  }
  return null;
}

/** A quote can't be valid longer than the supplier prices behind it. */
export function maxQuoteValidity(costValidTills: (Date | null | undefined)[]): Date | null {
  const dates = costValidTills.filter((d): d is Date => !!d);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}
