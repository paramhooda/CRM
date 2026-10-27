import "server-only";
// Line-item rules shared by deal creation and the Line items tab.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Tx } from "@/lib/db";
import { recordChanges } from "@/lib/audit";
import { boqTotals, lineMultiplier } from "@/lib/boq";
import { toNumber } from "@/lib/format";
import { resolveCostSource, type SourceFacts } from "@/lib/costing";

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
    isEstimate: z.boolean().optional(),
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
    costSource: z.enum(["PURCHASE", "RATE_CARD", "PRESALES"]).nullish(),
    costValidTill: z.preprocess((v) => (v === "" ? null : v), z.coerce.date().nullish()),
    costNote: z.string().trim().max(500).nullish(),
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
    // Picking a catalogue product turns an estimate into a real line
    isEstimate: !product && !!l.isEstimate,
    quantity: new Prisma.Decimal(l.quantity),
    unit: l.unit,
    billingFrequency: l.billingFrequency,
    termMonths: term,
    hsnSac: product?.hsnSac ?? (l.hsnSac || null),
    gstRatePct: product ? product.gstRatePct : l.gstRatePct === null || l.gstRatePct === undefined ? null : new Prisma.Decimal(l.gstRatePct),
    notes: l.notes || null,
  };
}

/** What decides a line's cost source (own brand, catalogue standard cost), loaded once per save. */
export async function costFactsLoader(tx: Tx) {
  const own = new Set((await tx.oem.findMany({ where: { ownBrand: true }, select: { id: true } })).map((o) => o.id));
  const std = new Map<string, number | null>();
  return async (spec: { productId: string | null; oemId: string }): Promise<SourceFacts> => {
    if (spec.productId && !std.has(spec.productId)) {
      const p = await tx.product.findUnique({ where: { id: spec.productId }, select: { standardCost: true } });
      std.set(spec.productId, p?.standardCost === null || p?.standardCost === undefined ? null : toNumber(p.standardCost));
    }
    return { ownBrand: own.has(spec.oemId), isProduct: !!spec.productId, standardCost: spec.productId ? std.get(spec.productId) ?? null : null };
  };
}

/** Cost fields for a new line: its cost source, and the rate card cost when that applies. */
export function initialCost(f: SourceFacts, requested?: string | null) {
  const costSource = resolveCostSource(requested, f);
  return costSource === "RATE_CARD"
    ? { costSource, unitCost: new Prisma.Decimal(f.standardCost!), pricingStatus: "QUOTED" as const }
    : { costSource };
}

export const BILLING_FREQUENCIES = ["ONE_TIME", "MONTHLY", "QUARTERLY", "ANNUAL"] as const;

/** Lines captured on the New opportunity form: a catalogue product, or a quick estimate (OEM + category + value). */
export const draftLineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    productId: z.string().min(1),
    quantity: z.coerce.number().positive().max(1e7),
    unitPrice: z.coerce.number().min(0).nullish(),
    billingFrequency: z.enum(BILLING_FREQUENCIES),
    termMonths: z.coerce.number().int().min(1).max(120).nullish(),
  }),
  z.object({
    kind: z.literal("estimate"),
    oemId: z.string().min(1, "Choose an OEM"),
    categoryId: z.string().min(1, "Choose a category"),
    /** Total value of the line over its term */
    value: z.coerce.number().positive("Enter an estimated value").max(1e11),
    billingFrequency: z.enum(BILLING_FREQUENCIES),
    termMonths: z.coerce.number().int().min(1).max(120).nullish(),
    description: z.string().trim().max(200).nullish(),
  }),
]);
export type DraftLine = z.infer<typeof draftLineSchema>;

/**
 * Create a quick-estimate line. The value is the total over the term, so recurring estimates store the
 * per-period price (value / periods) to keep line maths identical to catalogue lines.
 */
export async function createEstimateLine(
  tx: Tx,
  e: {
    opportunityId: string; lineNo: number; categoryId: string; businessUnitId: string; oemId: string; value: number;
    billingFrequency: (typeof BILLING_FREQUENCIES)[number]; termMonths: number | null; description?: string | null; userId: string;
  },
) {
  const [oem, cat] = await Promise.all([
    tx.oem.findUniqueOrThrow({ where: { id: e.oemId }, select: { name: true } }),
    tx.category.findUniqueOrThrow({ where: { id: e.categoryId }, select: { name: true } }),
  ]);
  const term = e.billingFrequency === "ONE_TIME" ? null : (e.termMonths ?? 12);
  const periods = lineMultiplier({ quantity: 1, billingFrequency: e.billingFrequency, termMonths: term });
  return tx.opportunityLineItem.create({
    data: {
      opportunityId: e.opportunityId,
      lineNo: e.lineNo,
      businessUnitId: e.businessUnitId,
      categoryId: e.categoryId,
      oemId: e.oemId,
      description: e.description?.trim() || `Estimate · ${oem.name} · ${cat.name}`,
      isEstimate: true,
      quantity: new Prisma.Decimal(1),
      unit: "Lot",
      billingFrequency: e.billingFrequency,
      termMonths: term,
      unitPrice: new Prisma.Decimal(Math.round((e.value / periods) * 100) / 100),
      createdById: e.userId,
      updatedById: e.userId,
    },
  });
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
  if (estimate > 0) data.amount = new Prisma.Decimal(Math.round(estimate));
  // Revenue model, term and ARR follow the lines: any recurring line makes it an ARR deal; ARR is the yearly value
  // of the recurring lines only, so one-time hardware in the same deal does not inflate it
  const PER_YEAR: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, ANNUAL: 1 };
  const recurring = o.lineItems.filter((l) => l.billingFrequency !== "ONE_TIME");
  data.revenueModel = recurring.length ? "ARR" : "ONE_TIME";
  data.contractTermMonths = recurring.length ? Math.max(...recurring.map((l) => l.termMonths ?? 12)) : o.contractTermMonths;
  if (recurring.length) {
    const arr = recurring.reduce((sum, l) => {
      const unit = l.unitPrice !== null ? toNumber(l.unitPrice) : l.product?.listPrice ? toNumber(l.product.listPrice) : 0;
      return sum + unit * toNumber(l.quantity) * (PER_YEAR[l.billingFrequency] ?? 1);
    }, 0);
    data.arrAmount = arr > 0 ? new Prisma.Decimal(Math.round(arr)) : null;
  } else data.arrAmount = null;
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
    fields: ["amount", "arrAmount", "revenueModel", "contractTermMonths", "expectedMarginPct", "businessUnitId", "categoryId", "oemId"],
    userId,
  });
}
