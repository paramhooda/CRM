import { toNumber } from "./format";

export type BillingFrequencyKey = "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export const MONTHS_PER_PERIOD: Record<BillingFrequencyKey, number> = { ONE_TIME: 0, MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };

export type BoqLineLike = {
  quantity: unknown;
  unitCost: unknown;
  unitPrice: unknown;
  billingFrequency: BillingFrequencyKey;
  termMonths: number | null;
};

/** Number of billing periods over the term. One-time lines bill once. */
export function billingPeriods(l: Pick<BoqLineLike, "billingFrequency" | "termMonths">): number {
  if (l.billingFrequency === "ONE_TIME") return 1;
  const term = Math.max(1, l.termMonths ?? 12);
  return Math.max(1, Math.ceil(term / MONTHS_PER_PERIOD[l.billingFrequency]));
}

/** Extended multiplier: quantity × billing periods. Unit cost and price are per period for recurring lines. */
export function lineMultiplier(l: Pick<BoqLineLike, "quantity" | "billingFrequency" | "termMonths">): number {
  return toNumber(l.quantity) * billingPeriods(l);
}

export function lineValue(l: Pick<BoqLineLike, "quantity" | "billingFrequency" | "termMonths" | "unitPrice">): number {
  return l.unitPrice === null || l.unitPrice === undefined ? 0 : lineMultiplier(l) * toNumber(l.unitPrice);
}

export function boqTotals(lines: BoqLineLike[]) {
  let totalPrice = 0;
  let totalCost = 0;
  let costed = 0;
  let priced = 0;
  let costOfPriced = 0;
  let priceOfCosted = 0;
  let recurringValue = 0;
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
      if (l.billingFrequency !== "ONE_TIME") recurringValue += m * toNumber(l.unitPrice);
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
    recurringValue,
    lines: lines.length,
    costed,
    priced,
    fullyCosted: lines.length > 0 && costed === lines.length,
    fullyPriced: lines.length > 0 && priced === lines.length,
  };
}

/** Value split by a key (OEM, BU, product…) across priced lines, largest first. */
export function mixBy<T extends BoqLineLike>(lines: T[], key: (l: T) => string): { key: string; value: number; share: number }[] {
  const m = new Map<string, number>();
  for (const l of lines) m.set(key(l), (m.get(key(l)) ?? 0) + lineValue(l));
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()]
    .map(([k, value]) => ({ key: k, value, share: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}
