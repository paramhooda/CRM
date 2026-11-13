// Bundles (pure, unit-tested): one supplier price for several lines. Suppliers often price a configured item as one
// (a server with its extra RAM and disks), and sometimes line by line. Presales groups lines while building the BOQ
// and purchase can regroup to match the supplier's quote. The lead line carries the price of the whole bundle; the
// lines bundled into it carry none ("included"). One level only, and only lines purchase prices can share a price.

export type BundleLine = {
  lineNo: number;
  costSource: string;
  isEstimate: boolean;
  billingFrequency: string;
  termMonths: number | null;
  /** Index (in the same list) of the line whose price covers this one; null when it has its own price */
  bundleWith: number | null;
};

/** What is wrong with the bundles in a list of lines; empty when they are fine. */
export function bundleProblems(lines: BundleLine[]): string[] {
  const out: string[] = [];
  lines.forEach((l, i) => {
    if (l.bundleWith === null) return;
    const lead = lines[l.bundleWith];
    const n = `Line ${l.lineNo}`;
    if (!lead) return void out.push(`${n} is priced with a line that is no longer on the BOQ.`);
    if (l.bundleWith === i) return void out.push(`${n} can't be priced with itself.`);
    if (lead.bundleWith !== null) return void out.push(`${n}: line ${lead.lineNo} is itself priced with another line. Put it under the main line instead.`);
    if (l.isEstimate || lead.isEstimate) return void out.push(`${n}: estimate lines can't be bundled.`);
    if (l.costSource !== "PURCHASE" || lead.costSource !== "PURCHASE")
      return void out.push(`${n}: only lines purchase prices can share a price (not rate card or own-brand lines).`);
    const term = (x: BundleLine) => (x.billingFrequency === "ONE_TIME" ? "" : String(x.termMonths ?? ""));
    if (l.billingFrequency !== lead.billingFrequency || term(l) !== term(lead))
      out.push(`${n} bills differently from line ${lead.lineNo}. Lines priced together share the billing and term.`);
  });
  return out;
}

/** "line 3", "lines 1–3" or "lines 1, 3, 5" */
export function linesLabel(nos: number[]): string {
  const s = [...new Set(nos)].sort((a, b) => a - b);
  if (s.length === 1) return `line ${s[0]}`;
  const consecutive = s.every((n, i) => i === 0 || n === s[i - 1]! + 1);
  return consecutive ? `lines ${s[0]}–${s[s.length - 1]}` : `lines ${s.join(", ")}`;
}

/** For each lead's line number, the line numbers its price covers (itself first). */
export function bundlesOf<L extends { lineNo: number; id: string; bundleLeadId: string | null }>(lines: L[]): Map<number, number[]> {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out = new Map<number, number[]>();
  for (const l of lines) {
    const lead = l.bundleLeadId ? byId.get(l.bundleLeadId) : undefined;
    if (!lead) continue;
    out.set(lead.lineNo, [...(out.get(lead.lineNo) ?? [lead.lineNo]), l.lineNo]);
  }
  return out;
}
