// Where each line's cost comes from (pure, unit-tested).
// Third-party products are costed by purchase, each line with its own supplier validity. Own-brand lines
// (Progression, Neon Cloud) are costed from the rate card (the catalogue's standard cost) or by presales when the
// deal needs a different cost. Any own-brand line can still go to purchase, for subcontracted or back-to-back work.

export type CostSourceKey = "PURCHASE" | "RATE_CARD" | "PRESALES";

export const COST_SOURCE_META: Record<CostSourceKey, { label: string; who: string; hint: string }> = {
  PURCHASE: { label: "Purchase", who: "purchase", hint: "Supplier price from purchase, with its own validity" },
  RATE_CARD: { label: "Rate card", who: "the rate card", hint: "Standard cost from the catalogue, applied automatically" },
  PRESALES: { label: "Presales", who: "presales", hint: "Cost worked out by presales for this deal" },
};

export type SourceFacts = { ownBrand: boolean; standardCost: number | null; isProduct: boolean };

/** Own-brand catalogue items with a standard cost use the rate card; other own-brand lines are costed by presales. */
export function defaultCostSource(f: SourceFacts): CostSourceKey {
  if (!f.ownBrand) return "PURCHASE";
  return f.isProduct && f.standardCost !== null ? "RATE_CARD" : "PRESALES";
}

/** Sources a line may use: internal costing is only for own brand, and the rate card only where it has a cost. */
export function allowedCostSources(f: SourceFacts): CostSourceKey[] {
  if (!f.ownBrand) return ["PURCHASE"];
  return f.isProduct && f.standardCost !== null ? ["RATE_CARD", "PRESALES", "PURCHASE"] : ["PRESALES", "PURCHASE"];
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
}): { status: "PENDING" | "QUOTED"; repriced: boolean } {
  const was = i.prevStatus ?? "PENDING";
  if (i.source === "RATE_CARD") return { status: i.hasCost ? "QUOTED" : "PENDING", repriced: false };
  if (i.canCost) {
    if (!i.hasCost) return { status: "PENDING", repriced: false };
    if (i.source === "PURCHASE" && i.specChanged && !i.costChanged) return { status: "PENDING", repriced: was === "QUOTED" };
    return { status: "QUOTED", repriced: false };
  }
  if (i.prevStatus === null || i.sourceChanged) return { status: "PENDING", repriced: false };
  if (i.specChanged && was === "QUOTED") return { status: "PENDING", repriced: true };
  return { status: was === "QUOTED" ? "QUOTED" : "PENDING", repriced: false };
}

/** Plain list of line numbers: "line 3" or "lines 2, 5". */
export function linesText(nos: number[]) {
  return `line${nos.length > 1 ? "s" : ""} ${nos.join(", ")}`;
}
