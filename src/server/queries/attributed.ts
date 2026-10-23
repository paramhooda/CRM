import "server-only";
// Shared loader shape for line-attributed deal values (dashboard, reports, pipeline, lists).
import { attribute, scopeSlices, type AttrSlice, type LineFilter } from "@/lib/attribution";
import { toNumber } from "@/lib/format";
import type { BillingFrequencyKey } from "@/lib/boq";

export const attributionLineSelect = {
  select: {
    quantity: true, unitPrice: true, billingFrequency: true, termMonths: true, businessUnitId: true, categoryId: true, oemId: true,
    product: { select: { name: true, listPrice: true } },
    businessUnit: { select: { name: true } }, category: { select: { name: true } }, oem: { select: { name: true } },
  },
} as const;

type LineRow = {
  quantity: unknown; unitPrice: unknown; billingFrequency: BillingFrequencyKey; termMonths: number | null;
  businessUnitId: string; categoryId: string; oemId: string;
  product: { name: string; listPrice: unknown } | null;
  businessUnit: { name: string }; category: { name: string }; oem: { name: string };
};

/**
 * Split a deal across its lines and narrow it to the active BU / category / OEM filter.
 * `amount` is the in-scope value (e.g. Dell's share); `dealAmount` is the whole deal.
 */
export function attributeDeal(
  o: { amount: unknown; businessUnit: { name: string }; category: { name: string }; oem: { name: string } | null; lineItems: LineRow[] },
  f: LineFilter,
): { amount: number; dealAmount: number; slices: AttrSlice[] } {
  const dealAmount = toNumber(o.amount);
  const all = attribute(
    { amount: dealAmount, businessUnit: o.businessUnit.name, category: o.category.name, oem: o.oem?.name ?? null },
    o.lineItems.map((l) => ({
      quantity: l.quantity, unitPrice: l.unitPrice, listPrice: l.product?.listPrice ?? null, billingFrequency: l.billingFrequency,
      termMonths: l.termMonths, businessUnit: l.businessUnit.name, category: l.category.name, oem: l.oem.name, product: l.product?.name ?? null,
      businessUnitId: l.businessUnitId, categoryId: l.categoryId, oemId: l.oemId,
    })),
  );
  const scoped = scopeSlices(all, f);
  return { amount: scoped.amount, dealAmount, slices: scoped.slices };
}
