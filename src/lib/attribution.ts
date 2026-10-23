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
  /** Ids let filters (bu / cat / oem) select the matching slices */
  businessUnitId?: string;
  categoryId?: string;
  oemId?: string;
};

export type AttrSlice = {
  businessUnit: string; category: string; oem: string; product: string | null; amount: number; share: number;
  businessUnitId?: string; categoryId?: string; oemId?: string;
};

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
    businessUnitId: l.businessUnitId,
    categoryId: l.categoryId,
    oemId: l.oemId,
    share: weights[i]! / total,
    amount: (deal.amount * weights[i]!) / total,
  }));
}

/** Sum attributed amounts by a name key across many deals, keeping the matching id for click-through filters. */
export function rollupWithId(
  slices: AttrSlice[],
  key: "businessUnit" | "category" | "oem",
): { key: string; id: string | null; amount: number }[] {
  const idKey = ({ businessUnit: "businessUnitId", category: "categoryId", oem: "oemId" } as const)[key];
  const m = new Map<string, { key: string; id: string | null; amount: number }>();
  for (const s of slices) {
    const r = m.get(s[key]) ?? { key: s[key], id: s[idKey] ?? null, amount: 0 };
    r.amount += s.amount;
    m.set(s[key], r);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
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

/** Line-level filters. A deal matches when one of its lines matches all of them. */
export type LineFilter = { bu: string[]; cat: string[]; oem: string[] };

export const hasLineFilter = (f: LineFilter) => f.bu.length + f.cat.length + f.oem.length > 0;

export function sliceMatches(s: AttrSlice, f: LineFilter): boolean {
  return (
    (!f.bu.length || (!!s.businessUnitId && f.bu.includes(s.businessUnitId))) &&
    (!f.cat.length || (!!s.categoryId && f.cat.includes(s.categoryId))) &&
    (!f.oem.length || (!!s.oemId && f.oem.includes(s.oemId)))
  );
}

/**
 * The part of a deal inside a BU / category / OEM filter. Filtering by Dell shows Dell's share of a mixed deal,
 * not the whole deal, so OEM and BU totals never double count. Without a line filter the whole deal is in scope.
 */
export function scopeSlices(slices: AttrSlice[], f: LineFilter): { amount: number; slices: AttrSlice[] } {
  if (!hasLineFilter(f)) return { amount: slices.reduce((a, s) => a + s.amount, 0), slices };
  const inScope = slices.filter((s) => sliceMatches(s, f));
  return { amount: inScope.reduce((a, s) => a + s.amount, 0), slices: inScope };
}
