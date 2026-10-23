// Line-level attribution: split a deal's value across its line items so BU / OEM / product analytics stay
// accurate for multi-OEM deals. Deals without lines attribute 100% to their header classification.
import { lineMultiplier, type BillingFrequencyKey } from "./boq";
import { toNumber } from "./format";

export type AttrLine = {
  quantity: unknown;
  unitPrice: unknown;
  billingFrequency: BillingFrequencyKey;
  termMonths: number | null;
  listPrice?: unknown;
  businessUnit: string;
  category: string;
  oem: string;
  product: string | null;
};

export type AttrSlice = { businessUnit: string; category: string; oem: string; product: string | null; amount: number; share: number };

export function attribute(
  deal: { amount: number; businessUnit: string; category: string; oem: string | null },
  lines: AttrLine[],
): AttrSlice[] {
  const weights = lines.map((l) => lineMultiplier(l) * toNumber(l.unitPrice ?? l.listPrice ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!lines.length || total <= 0) {
    return [{ businessUnit: deal.businessUnit, category: deal.category, oem: deal.oem ?? "Unassigned", product: null, amount: deal.amount, share: 1 }];
  }
  return lines.map((l, i) => ({
    businessUnit: l.businessUnit,
    category: l.category,
    oem: l.oem,
    product: l.product,
    share: weights[i]! / total,
    amount: (deal.amount * weights[i]!) / total,
  }));
}

/** Sum attributed amounts by a key across many deals. */
export function rollup<K extends keyof AttrSlice>(slices: AttrSlice[], key: K): { key: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const s of slices) {
    const k = String(s[key] ?? "Unassigned");
    m.set(k, (m.get(k) ?? 0) + s.amount);
  }
  return [...m.entries()].map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount);
}
