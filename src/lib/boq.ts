import { toNumber } from "./format";

export type BoqLineLike = {
  quantity: unknown;
  unitCost: unknown;
  unitPrice: unknown;
  recurring: boolean;
  termMonths: number | null;
};

/** Extended multiplier: one-time lines bill once; recurring lines bill monthly for the term. */
export function lineMultiplier(l: Pick<BoqLineLike, "quantity" | "recurring" | "termMonths">): number {
  return toNumber(l.quantity) * (l.recurring ? Math.max(1, l.termMonths ?? 12) : 1);
}

export function boqTotals(lines: BoqLineLike[]) {
  let totalPrice = 0;
  let totalCost = 0;
  let costed = 0;
  let priced = 0;
  let costOfPriced = 0;
  let priceOfCosted = 0;
  for (const l of lines) {
    const m = lineMultiplier(l);
    const hasCost = l.unitCost !== null && l.unitCost !== undefined;
    const hasPrice = l.unitPrice !== null && l.unitPrice !== undefined;
    if (hasCost) {
      costed++;
      totalCost += m * toNumber(l.unitCost);
    }
    if (hasPrice) {
      priced++;
      totalPrice += m * toNumber(l.unitPrice);
    }
    if (hasCost && hasPrice) {
      costOfPriced += m * toNumber(l.unitCost);
      priceOfCosted += m * toNumber(l.unitPrice);
    }
  }
  const marginPct = priceOfCosted > 0 ? ((priceOfCosted - costOfPriced) / priceOfCosted) * 100 : null;
  return {
    totalPrice,
    totalCost,
    marginPct,
    lines: lines.length,
    costed,
    priced,
    fullyCosted: lines.length > 0 && costed === lines.length,
    fullyPriced: lines.length > 0 && priced === lines.length,
  };
}
