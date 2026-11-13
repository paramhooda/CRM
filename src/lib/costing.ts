// Where each line's cost comes from (pure, unit-tested).
// Third-party products are costed by purchase, each line with its own supplier validity. Own-brand lines
// (Progression, Neon Cloud) in rate card categories (Cloud, NOC, SOC) take the catalogue's standard cost; other
// own-brand lines, and deals that need a different cost, are costed by presales. Any own-brand line can still go to
// purchase, for subcontracted or back-to-back work.

export type CostSourceKey = "PURCHASE" | "RATE_CARD" | "PRESALES";

/** `costLabel`: what the cost is called on a line. Only purchase lines have a purchase price; the rest are internal. */
export const COST_SOURCE_META: Record<CostSourceKey, { label: string; who: string; hint: string; costLabel: string }> = {
  PURCHASE: { label: "Purchase", who: "purchase", hint: "Supplier price from purchase, with its own validity", costLabel: "Purchase price" },
  RATE_CARD: { label: "Rate card", who: "the rate card", hint: "Standard cost from the catalogue, applied automatically", costLabel: "Internal cost" },
  PRESALES: { label: "Presales", who: "presales", hint: "Cost worked out by presales for this deal", costLabel: "Internal cost" },
};

/** Column heading for the cost of a set of lines: "Purchase price", "Internal cost", or both when mixed. */
export function costHeading(sources: string[]): string {
  const purchase = sources.some((s) => s === "PURCHASE");
  const internal = sources.some((s) => s !== "PURCHASE");
  return purchase && internal ? "Purchase price / internal cost" : internal ? "Internal cost" : "Purchase price";
}

/** `rateCard`: the line's category uses the rate card (Cloud, NOC, SOC today) */
export type SourceFacts = { ownBrand: boolean; standardCost: number | null; isProduct: boolean; rateCard: boolean };

const onRateCard = (f: SourceFacts) => f.rateCard && f.isProduct && f.standardCost !== null;

/** Own-brand catalogue items in a rate card category with a standard cost use the rate card; other own-brand lines are costed by presales. */
export function defaultCostSource(f: SourceFacts): CostSourceKey {
  if (!f.ownBrand) return "PURCHASE";
  return onRateCard(f) ? "RATE_CARD" : "PRESALES";
}

/** Sources a line may use: internal costing is only for own brand, and the rate card only in its categories, where it has a cost. */
export function allowedCostSources(f: SourceFacts): CostSourceKey[] {
  if (!f.ownBrand) return ["PURCHASE"];
  return onRateCard(f) ? ["RATE_CARD", "PRESALES", "PURCHASE"] : ["PRESALES", "PURCHASE"];
}

/** The requested source if it is allowed for the line, otherwise its default. */
export function resolveCostSource(requested: string | null | undefined, f: SourceFacts): CostSourceKey {
  const allowed = allowedCostSources(f);
  return requested && (allowed as string[]).includes(requested) ? (requested as CostSourceKey) : defaultCostSource(f);
}

export type CostLine = {
  lineNo?: number;
  isEstimate: boolean;
  costSource: string;
  pricingStatus: string;
  unitCost: unknown;
  costValidTill?: Date | null;
};

const hasCurrentCost = (l: CostLine) => l.pricingStatus === "QUOTED" && l.unitCost !== null && l.unitCost !== undefined;

/** A BOQ line still waiting on purchase for a supplier price. */
export const needsPurchaseCost = (l: CostLine) => !l.isEstimate && l.costSource === "PURCHASE" && !hasCurrentCost(l);
/** A BOQ line still waiting on an internal cost (presales, or a rate card line without a standard cost). */
export const needsInternalCost = (l: CostLine) => !l.isEstimate && l.costSource !== "PURCHASE" && !hasCurrentCost(l);
/** A priced purchase line whose supplier price has lapsed. */
export const costExpired = (l: CostLine, now: Date) =>
  !l.isEstimate && l.costSource === "PURCHASE" && hasCurrentCost(l) && !!l.costValidTill && l.costValidTill < now;

/**
 * Pricing status after a line is saved.
 * - Rate card lines are always current: their cost comes from the catalogue.
 * - The person who owns a line's cost confirms it by saving it. For purchase lines a changed specification still
 *   needs a new supplier price unless the cost was updated with it.
 * - Anyone else changing a costed line's specification, or moving it to another source, sends it back for a cost.
 */
export function lineCostStatus(i: {
  source: CostSourceKey;
  prevStatus: string | null; // null for a new line
  sourceChanged: boolean;
  specChanged: boolean;
  canCost: boolean;
  costChanged: boolean;
  hasCost: boolean;
  /** The line was already waiting for a new cost because it changed after being costed */
  stale?: boolean;
  /** Purchase ticked "Price unchanged" on this line: the old cost still holds for the new specification */
  confirmed?: boolean;
}): { status: "PENDING" | "QUOTED"; repriced: boolean; stale: boolean } {
  const was = i.prevStatus ?? "PENDING";
  const stale = !!i.stale;
  if (i.source === "RATE_CARD") return { status: i.hasCost ? "QUOTED" : "PENDING", repriced: false, stale: false };
  if (i.canCost) {
    if (!i.hasCost) return { status: "PENDING", repriced: false, stale };
    // A changed purchase line keeps its old cost for reference; saving the line again does not make that cost
    // current. Purchase must enter a new cost or validity, or confirm the old price still holds.
    if (i.source === "PURCHASE" && (i.specChanged || stale) && !i.costChanged && !i.confirmed)
      return { status: "PENDING", repriced: i.specChanged && was === "QUOTED", stale: true };
    return { status: "QUOTED", repriced: false, stale: false };
  }
  if (i.prevStatus === null || i.sourceChanged) return { status: "PENDING", repriced: false, stale: false };
  if (i.specChanged && was === "QUOTED") return { status: "PENDING", repriced: true, stale: i.source === "PURCHASE" };
  return { status: was === "QUOTED" ? "QUOTED" : "PENDING", repriced: false, stale };
}

/** Plain list of line numbers: "line 3" or "lines 2, 5". */
export function linesText(nos: number[]) {
  return `line${nos.length > 1 ? "s" : ""} ${nos.join(", ")}`;
}
