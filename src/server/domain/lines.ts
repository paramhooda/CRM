import "server-only";
// Line-item rules shared by deal creation and the Line items tab.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Tx } from "@/lib/db";
import { recordChanges } from "@/lib/audit";
import { boqTotals, lineMultiplier } from "@/lib/boq";
import { toNumber } from "@/lib/format";

export const HSN_SAC = /^\d{4,8}$/;

export const lineInputSchema = z
  .object({
    id: z.string().optional(),
    productId: z.string().nullish(),
    businessUnitId: z.string().nullish(),
    categoryId: z.string().nullish(),
    oemId: z.string().nullish(),
    partNumber: z.string().max(80).nullish(),
    description: z.string().trim().min(2, "Each line needs a description").max(500),
    quantity: z.coerce.number().positive("Quantity must be positive").max(1e7),
    unit: z.string().max(20).default("Nos"),
    billingFrequency: z.enum(["ONE_TIME", "MONTHLY", "QUARTERLY", "ANNUAL"]).default("ONE_TIME"),
    termMonths: z.coerce.number().int().min(1).max(120).nullish(),
    hsnSac: z.string().trim().regex(HSN_SAC, "HSN/SAC must be 4–8 digits").nullish().or(z.literal("")),
    gstRatePct: z.coerce.number().min(0).max(28).nullish(),
    unitCost: z.coerce.number().min(0).nullish(),
    distributor: z.string().max(80).nullish(),
    oemQuoteRef: z.string().max(80).nullish(),
    leadTimeDays: z.coerce.number().int().min(0).max(365).nullish(),
    unitPrice: z.coerce.number().min(0).nullish(),
    notes: z.string().max(500).nullish(),
  })
  .superRefine((l, ctx) => {
    if (!l.productId && (!l.businessUnitId || !l.categoryId || !l.oemId)) {
      ctx.addIssue({ code: "custom", path: ["oemId"], message: "Custom lines need a business unit, category and OEM" });
    }
    if (l.billingFrequency !== "ONE_TIME" && !l.termMonths) {
      ctx.addIssue({ code: "custom", path: ["termMonths"], message: "Recurring lines need a term in months" });
    }
  });
export type LineInput = z.infer<typeof lineInputSchema>;

/** Specification fields for a line. Catalogue products are authoritative for classification and tax codes. */
export async function resolveSpec(tx: Tx, l: LineInput, fallbackTerm: number | null) {
  const product = l.productId ? await tx.product.findUnique({ where: { id: l.productId } }) : null;
  if (l.productId && !product) throw new Error("Selected product no longer exists.");
  const term = l.billingFrequency === "ONE_TIME" ? null : l.termMonths ?? fallbackTerm ?? product?.defaultTermMonths ?? 12;
  return {
    productId: product?.id ?? null,
    businessUnitId: product?.businessUnitId ?? l.businessUnitId!,
    categoryId: product?.categoryId ?? l.categoryId!,
    oemId: product?.oemId ?? l.oemId!,
    partNumber: l.partNumber || product?.code || null,
    description: l.description,
    quantity: new Prisma.Decimal(l.quantity),
    unit: l.unit,
    billingFrequency: l.billingFrequency,
    termMonths: term,
    hsnSac: product?.hsnSac ?? (l.hsnSac || null),
    gstRatePct: product ? product.gstRatePct : l.gstRatePct === null || l.gstRatePct === undefined ? null : new Prisma.Decimal(l.gstRatePct),
    notes: l.notes || null,
  };
}

/**
 * Keep the deal header in step with its lines: value = sum of line values (sell price, or catalogue list price
 * while unpriced), primary BU/category/OEM = the largest line, margin from costed and priced lines.
 * Every change is audited so pipeline reviews pick it up.
 */
export async function rollUpDeal(tx: Tx, opportunityId: string, userId: string) {
  const o = await tx.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: { lineItems: { include: { product: { select: { listPrice: true } } } } },
  });
  if (!o.lineItems.length) return;
  let estimate = 0;
  let top: { value: number; l: (typeof o.lineItems)[number] } | null = null;
  for (const l of o.lineItems) {
    const unit = l.unitPrice !== null ? toNumber(l.unitPrice) : l.product?.listPrice ? toNumber(l.product.listPrice) : 0;
    const value = lineMultiplier(l) * unit;
    estimate += value;
    if (!top || value > top.value) top = { value, l };
  }
  const totals = boqTotals(o.lineItems);
  const data: Prisma.OpportunityUncheckedUpdateInput = {};
  if (estimate > 0) {
    data.amount = new Prisma.Decimal(Math.round(estimate));
    if (o.revenueModel === "ARR" && o.contractTermMonths) data.arrAmount = new Prisma.Decimal(Math.round(estimate / (o.contractTermMonths / 12)));
  }
  if (totals.marginPct !== null) data.expectedMarginPct = new Prisma.Decimal(Math.round(totals.marginPct * 100) / 100);
  if (top) {
    data.businessUnitId = top.l.businessUnitId;
    data.categoryId = top.l.categoryId;
    data.oemId = top.l.oemId;
  }
  await tx.opportunity.update({ where: { id: opportunityId }, data });
  await recordChanges(tx, {
    entityType: "Opportunity",
    entityId: opportunityId,
    before: o,
    after: { ...o, ...data },
    fields: ["amount", "arrAmount", "expectedMarginPct", "businessUnitId", "categoryId", "oemId"],
    userId,
  });
}
