// Deal lines: what each line is worth, what the deal rolls up to, and who may change which fields.
import Decimal from "decimal.js";
import { dec, round2, type Money } from "./money";

export type RevenueModel = "ONE_TIME" | "ARR";

export type LineAmounts = {
  quantity: Money;
  revenueModel: RevenueModel;
  termMonths: number | null | undefined;
  unitSalesPrice: Money;
  unitPurchaseCost: Money;
};

export type DerivedLine = {
  annualValue: string | null;
  lineValue: string | null;
  lineCost: string | null;
  expectedGmPct: string | null;
};

const s = (d: Decimal | null) => (d ? round2(d).toFixed(2) : null);

/**
 * One-time: value = quantity × unit price. ARR: annual value = quantity × unit price (annual), and the line's value
 * over its term = annual × term / 12. Cost follows the same shape. GM % = (price − cost) / price.
 */
export function deriveLine(l: LineAmounts): DerivedLine {
  const qty = dec(l.quantity) ?? new Decimal(0);
  const price = dec(l.unitSalesPrice);
  const cost = dec(l.unitPurchaseCost);
  const termFactor = l.revenueModel === "ARR" ? new Decimal(l.termMonths ?? 12).div(12) : new Decimal(1);
  const annualValue = l.revenueModel === "ARR" && price ? qty.mul(price) : null;
  const lineValue = price ? qty.mul(price).mul(termFactor) : null;
  const lineCost = cost ? qty.mul(cost).mul(termFactor) : null;
  const gm = price && cost && price.gt(0) ? price.minus(cost).div(price).mul(100) : null;
  return { annualValue: s(annualValue), lineValue: s(lineValue), lineCost: s(lineCost), expectedGmPct: s(gm) };
}

export type RollupLine = DerivedLine & { revenueModel: RevenueModel; businessUnitId: string; oemId: string; lineNo: number; unitSalesPrice: Money };

export type DealRollup = {
  dealValue: string;
  oneTimeValue: string;
  annualRecurringValue: string;
  totalCost: string | null;
  expectedGmPct: string | null;
  primaryBusinessUnitId: string | null;
  primaryOemId: string | null;
};

/** Deal totals from its lines. Cost and GM are unknown (null) while any priced line has no cost. */
export function rollupDeal(lines: RollupLine[]): DealRollup {
  let value = new Decimal(0), oneTime = new Decimal(0), arr = new Decimal(0), cost = new Decimal(0);
  let costKnown = true, anyPriced = false;
  let primary: RollupLine | null = null;
  for (const l of lines) {
    const v = dec(l.lineValue);
    if (v) {
      anyPriced = true;
      value = value.plus(v);
      if (l.revenueModel === "ONE_TIME") oneTime = oneTime.plus(v);
      const c = dec(l.lineCost);
      if (c) cost = cost.plus(c);
      else costKnown = false;
      if (!primary || v.gt(dec(primary.lineValue) ?? 0) || (v.eq(dec(primary.lineValue) ?? 0) && l.lineNo < primary.lineNo)) primary = l;
    }
    const a = dec(l.annualValue);
    if (a) arr = arr.plus(a);
  }
  // With no priced line, fall back to the first line for the primary dimensions
  const first = [...lines].sort((a, b) => a.lineNo - b.lineNo)[0] ?? null;
  const p = primary ?? first;
  const gm = anyPriced && costKnown && value.gt(0) ? value.minus(cost).div(value).mul(100) : null;
  return {
    dealValue: round2(value).toFixed(2),
    oneTimeValue: round2(oneTime).toFixed(2),
    annualRecurringValue: round2(arr).toFixed(2),
    totalCost: anyPriced && costKnown ? round2(cost).toFixed(2) : null,
    expectedGmPct: s(gm),
    primaryBusinessUnitId: p?.businessUnitId ?? null,
    primaryOemId: p?.oemId ?? null,
  };
}

/** A deal needs presales when any of its lines is in a Sub BU flagged "needs presales". */
export function defaultNeedsPresales(subBusinessUnitIds: string[], subBus: { id: string; needsPresales: boolean }[]): boolean {
  const flagged = new Set(subBus.filter((s) => s.needsPresales).map((s) => s.id));
  return subBusinessUnitIds.some((id) => flagged.has(id));
}

/** Sales method (B2B, MoQ, Stock) applies only to third-party OEMs. */
export const salesMethodAllowed = (oemIsOwnIp: boolean) => !oemIsOwnIp;

export type LineField = "spec" | "price" | "cost" | "delete";

export type LineEditContext = {
  role: "ADMIN" | "SALES_HEAD" | "SALES" | "PRESALES" | "PURCHASE";
  /** The actor owns the deal, or is a manager with the owner in scope */
  canEditDeal: boolean;
  isAssignedPresales: boolean;
  isAssignedPurchase: boolean;
  dealOpen: boolean;
  lineOwnIp: boolean;
};

/** Which groups of line fields the actor may change. */
export function lineFieldWhitelist(c: LineEditContext): Set<LineField> {
  const out = new Set<LineField>();
  if (!c.dealOpen) return out;
  if (c.role === "ADMIN") return new Set(["spec", "price", "cost", "delete"]);
  if ((c.role === "SALES" || c.role === "SALES_HEAD") && c.canEditDeal) {
    out.add("spec"); out.add("price"); out.add("delete");
  }
  if (c.role === "PRESALES" && c.isAssignedPresales) {
    out.add("spec"); out.add("delete");
    if (c.lineOwnIp) out.add("cost");
  }
  if (c.role === "PURCHASE" && c.isAssignedPurchase) out.add("cost");
  return out;
}

export type LineForValidation = { revenueModel: RevenueModel; termMonths: number | null | undefined; salesMethodId: string | null | undefined; quantity: Money; unitSalesPrice: Money; unitPurchaseCost: Money };

export function lineValidationErrors(l: LineForValidation, oemIsOwnIp: boolean): string[] {
  const out: string[] = [];
  const qty = dec(l.quantity);
  if (!qty || qty.lte(0)) out.push("Quantity must be more than zero.");
  if (l.revenueModel === "ARR" && (!l.termMonths || l.termMonths < 1 || l.termMonths > 120)) out.push("ARR lines need a term of 1 to 120 months.");
  if (l.revenueModel === "ONE_TIME" && l.termMonths) out.push("One-time lines have no term.");
  if (oemIsOwnIp && l.salesMethodId) out.push("Own-IP lines have no sales method.");
  const price = dec(l.unitSalesPrice);
  if (price && price.lt(0)) out.push("The sales price can't be negative.");
  const cost = dec(l.unitPurchaseCost);
  if (cost && cost.lt(0)) out.push("The purchase cost can't be negative.");
  return out;
}
