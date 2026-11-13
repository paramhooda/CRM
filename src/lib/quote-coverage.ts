// Supplier quotes behind purchase prices (pure, unit-tested). Every third-party line purchase prices in a request
// must be backed by a supplier or OEM quote attached to that request; one quote can cover several lines. Rate card
// and presales-costed lines, and own-brand lines (Progression, Neon Cloud) bought in, need none.

export type CoverLine = {
  id: string;
  lineNo: number;
  isEstimate: boolean;
  costSource: string;
  ownBrand: boolean;
  /** When purchase last entered or confirmed its cost or validity */
  costSetAt: Date | null;
  /** Still waiting on purchase when the request is completed: its cost is confirmed by completing */
  pricingStatus: string;
  costValidTill: Date | null;
};

export const QUOTE_KINDS = ["SUPPLIER_QUOTE", "OEM_QUOTE"];

/** Lines priced in this request that need a supplier quote: set or confirmed since it was raised, or lapsed and renewed now. */
export function linesNeedingQuote<L extends CoverLine>(lines: L[], requestCreatedAt: Date, now: Date): L[] {
  return lines.filter(
    (l) =>
      !l.isEstimate && l.costSource === "PURCHASE" && !l.ownBrand &&
      ((l.costSetAt !== null && l.costSetAt >= requestCreatedAt) || l.pricingStatus === "PENDING" || (!!l.costValidTill && l.costValidTill < now)),
  );
}

/** Line numbers still without a quote, given the line ids the request's quotes cover. */
export function uncoveredLines(needing: CoverLine[], coveredIds: Iterable<string>): number[] {
  const covered = new Set(coveredIds);
  return needing.filter((l) => !covered.has(l.id)).map((l) => l.lineNo);
}
