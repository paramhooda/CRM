"use server";
// Sales → Presales → Purchase → Sales workflow: BOQ requests, BOQ editing, pricing requests and quotes.
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { can, opportunityScope } from "@/lib/authz";
import { recordEvent, recordChanges } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextCode } from "@/lib/sequence";
import { boqTotals, lineMultiplier } from "@/lib/boq";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { toNumber } from "@/lib/format";
import { THRESHOLDS, STAGE_META, type StageKey } from "@/lib/constants";
import { zodErrors, type ActionResult } from "@/lib/validation";
import { applyStageChange, UserError } from "@/server/domain/stage";

const DAY = 86_400_000;

async function visibleOpp(user: CurrentUser, id: string) {
  return db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] } });
}
function refresh(oppId: string) {
  revalidatePath(`/opportunities/${oppId}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
}

/** Pick the purchase user with the fewest open pricing requests. */
async function leastLoadedPurchase(tx: Tx) {
  const users = await tx.user.findMany({
    where: { role: "PURCHASE", active: true },
    select: { id: true, _count: { select: { pricingAssigned: { where: { status: { in: ["REQUESTED", "IN_PROGRESS"] } } } } } },
  });
  users.sort((a, b) => a._count.pricingAssigned - b._count.pricingAssigned);
  return users[0]?.id ?? null;
}

// ───────────── Presales ─────────────

const presalesSchema = z.object({
  assignedToId: z.string().min(1, "Select a presales owner"),
  dueDate: z.coerce.date(),
  scope: z.string().trim().min(10, "Describe the scope in a sentence or two").max(4000),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  moveToBoq: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
});

export async function requestPresales(oppId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.requestPresales(user, opp)) return { ok: false, error: "Only the deal owner or a manager can pull in presales." };
  const parsed = presalesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  const assignee = await db.user.findFirst({ where: { id: v.assignedToId, role: "PRESALES", active: true } });
  if (!assignee) return { ok: false, error: "Selected user is not an active presales engineer." };
  const open = await db.presalesRequest.count({ where: { opportunityId: oppId, status: { in: ["REQUESTED", "IN_PROGRESS"] } } });
  if (open) return { ok: false, error: "A presales request is already open on this deal." };

  await db.$transaction(async (tx) => {
    await tx.presalesRequest.create({
      data: { opportunityId: oppId, requestedById: user.id, assignedToId: v.assignedToId, dueDate: v.dueDate, scope: v.scope, priority: v.priority },
    });
    await tx.opportunity.update({ where: { id: oppId }, data: { presalesOwnerId: v.assignedToId, updatedById: user.id } });
    await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: opp, after: { presalesOwnerId: v.assignedToId }, fields: ["presalesOwnerId"], userId: user.id });
    await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "PRESALES_REQUESTED", userId: user.id, newValue: assignee.name });
    await notify(tx, [v.assignedToId], {
      type: "PRESALES_REQUEST",
      title: `BOQ requested: ${opp.name}`,
      body: `${user.name} pulled you in${v.priority !== "NORMAL" ? ` (${v.priority.toLowerCase()} priority)` : ""}. Due ${v.dueDate.toLocaleDateString("en-IN")}.`,
      link: `/opportunities/${oppId}?tab=boq`,
    });
    if (v.moveToBoq && STAGE_META[opp.stage as StageKey].order < STAGE_META.BOQ.order) {
      await applyStageChange(tx, user, oppId, "BOQ", {});
    }
    await recomputeOpportunity(tx, oppId);
  });
  refresh(oppId);
  return { ok: true };
}

export async function startPresales(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.presalesRequest.findUnique({ where: { id: requestId } });
  if (!r || (r.assignedToId !== user.id && user.role !== "ADMIN")) return { ok: false, error: "Request not found." };
  if (r.status !== "REQUESTED") return { ok: true };
  await db.presalesRequest.update({ where: { id: requestId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  refresh(r.opportunityId);
  return { ok: true };
}

const submitBoqSchema = z.object({
  solutionSummary: z.string().trim().min(10, "Add a short solution summary").max(4000),
  purchaseUserId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export async function submitBoq(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.presalesRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || (r.assignedToId !== user.id && user.role !== "ADMIN")) return { ok: false, error: "Request not found." };
  if (r.status === "BOQ_SUBMITTED" || r.status === "CANCELLED") return { ok: false, error: "This request is already closed." };
  const parsed = submitBoqSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const lines = await db.opportunityLineItem.count({ where: { opportunityId: r.opportunityId } });
  if (!lines) return { ok: false, error: "Add at least one BOQ line before submitting." };

  await db.$transaction(async (tx) => {
    const now = new Date();
    const purchaseId = parsed.data.purchaseUserId || (await leastLoadedPurchase(tx));
    if (!purchaseId) throw new Error("No active purchase user to assign pricing to.");
    await tx.presalesRequest.update({
      where: { id: requestId },
      data: { status: "BOQ_SUBMITTED", submittedAt: now, solutionSummary: parsed.data.solutionSummary, startedAt: r.startedAt ?? now },
    });
    await tx.pricingRequest.create({
      data: {
        opportunityId: r.opportunityId, presalesRequestId: r.id, requestedById: user.id, assignedToId: purchaseId,
        dueDate: parsed.data.dueDate ?? new Date(now.getTime() + THRESHOLDS.pricingSlaDays * DAY), notes: parsed.data.notes || null,
      },
    });
    await tx.opportunity.update({ where: { id: r.opportunityId }, data: { purchaseOwnerId: purchaseId } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: r.opportunityId, action: "BOQ_SUBMITTED", userId: user.id, newValue: `${lines} lines` });
    await notify(tx, [purchaseId], {
      type: "PRICING_REQUEST",
      title: `Pricing requested: ${r.opportunity.name}`,
      body: `${user.name} submitted a ${lines}-line BOQ. Get OEM / distributor pricing.`,
      link: `/opportunities/${r.opportunityId}?tab=boq`,
    });
    await notify(tx, [r.opportunity.salesOwnerId], {
      type: "BOQ_SUBMITTED",
      title: `BOQ ready: ${r.opportunity.name}`,
      body: `${user.name} submitted the BOQ. Purchase has been asked for pricing.`,
      link: `/opportunities/${r.opportunityId}?tab=boq`,
      exclude: user.id,
    });
    await recomputeOpportunity(tx, r.opportunityId);
  });
  refresh(r.opportunityId);
  return { ok: true };
}

// ───────────── Pricing ─────────────

const pricingSchema = z.object({
  assignedToId: z.string().optional(),
  dueDate: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});

/** Direct pricing request from Sales (e.g. BOQ prepared without presales, or re-pricing). */
export async function requestPricing(oppId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.editBoqSpec(user, opp)) return { ok: false, error: "Not allowed." };
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const lines = await db.opportunityLineItem.count({ where: { opportunityId: oppId } });
  if (!lines) return { ok: false, error: "Add BOQ lines before requesting pricing." };
  const open = await db.pricingRequest.count({ where: { opportunityId: oppId, status: { in: ["REQUESTED", "IN_PROGRESS"] } } });
  if (open) return { ok: false, error: "A pricing request is already open on this deal." };
  await db.$transaction(async (tx) => {
    const purchaseId = parsed.data.assignedToId || (await leastLoadedPurchase(tx));
    if (!purchaseId) throw new Error("No active purchase user.");
    await tx.pricingRequest.create({
      data: { opportunityId: oppId, requestedById: user.id, assignedToId: purchaseId, dueDate: parsed.data.dueDate, notes: parsed.data.notes || null },
    });
    await tx.opportunityLineItem.updateMany({ where: { opportunityId: oppId, unitCost: null }, data: { pricingStatus: "PENDING" } });
    await tx.opportunity.update({ where: { id: oppId }, data: { purchaseOwnerId: purchaseId } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "PRICING_REQUESTED", userId: user.id });
    await notify(tx, [purchaseId], { type: "PRICING_REQUEST", title: `Pricing requested: ${opp.name}`, body: `From ${user.name}`, link: `/opportunities/${oppId}?tab=boq` });
    await recomputeOpportunity(tx, oppId);
  });
  refresh(oppId);
  return { ok: true };
}

export async function startPricing(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.pricingRequest.findUnique({ where: { id: requestId } });
  if (!r || (r.assignedToId !== user.id && user.role !== "ADMIN")) return { ok: false, error: "Request not found." };
  if (r.status === "REQUESTED") await db.pricingRequest.update({ where: { id: requestId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  refresh(r.opportunityId);
  return { ok: true };
}

const completePricingSchema = z.object({
  quoteValidTill: z.coerce.date(),
  responseNotes: z.string().max(2000).optional(),
});

export async function completePricing(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.pricingRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || (r.assignedToId !== user.id && user.role !== "ADMIN")) return { ok: false, error: "Request not found." };
  if (r.status === "QUOTED" || r.status === "CANCELLED") return { ok: false, error: "This request is already closed." };
  const parsed = completePricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const missing = await db.opportunityLineItem.count({ where: { opportunityId: r.opportunityId, unitCost: null } });
  if (missing) return { ok: false, error: `${missing} BOQ line(s) still need a unit cost.` };
  await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.pricingRequest.update({
      where: { id: requestId },
      data: { status: "QUOTED", quotedAt: now, startedAt: r.startedAt ?? now, quoteValidTill: parsed.data.quoteValidTill, responseNotes: parsed.data.responseNotes || null },
    });
    await tx.opportunityLineItem.updateMany({ where: { opportunityId: r.opportunityId }, data: { pricingStatus: "QUOTED" } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: r.opportunityId, action: "PRICING_COMPLETED", userId: user.id });
    await notify(tx, [r.opportunity.salesOwnerId, r.opportunity.presalesOwnerId], {
      type: "PRICING_COMPLETE",
      title: `Pricing ready: ${r.opportunity.name}`,
      body: `${user.name} added costs. Set sell prices and generate the quote.`,
      link: `/opportunities/${r.opportunityId}?tab=boq`,
      exclude: user.id,
    });
    await recomputeOpportunity(tx, r.opportunityId);
  });
  refresh(r.opportunityId);
  return { ok: true };
}

// ───────────── BOQ lines ─────────────

const lineSchema = z.object({
  id: z.string().optional(),
  businessUnitId: z.string().nullish(),
  categoryId: z.string().nullish(),
  oemId: z.string().nullish(),
  partNumber: z.string().max(80).nullish(),
  description: z.string().trim().min(2, "Each line needs a description").max(500),
  quantity: z.coerce.number().positive("Quantity must be positive").max(1e7),
  unit: z.string().max(20).default("Nos"),
  recurring: z.boolean().default(false),
  termMonths: z.coerce.number().int().min(1).max(120).nullish(),
  unitCost: z.coerce.number().min(0).nullish(),
  distributor: z.string().max(80).nullish(),
  oemQuoteRef: z.string().max(80).nullish(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).nullish(),
  unitPrice: z.coerce.number().min(0).nullish(),
  notes: z.string().max(500).nullish(),
});
export type BoqLineInput = z.infer<typeof lineSchema>;

export async function saveBoq(oppId: string, rawLines: unknown[]): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  const parsed = z.array(lineSchema).max(200).safeParse(rawLines);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const spec = can.editBoqSpec(user, opp);
  const cost = can.editBoqCost(user);
  const price = can.editBoqPrice(user, opp);
  if (!spec && !cost && !price) return { ok: false, error: "You cannot edit this BOQ." };
  if (["WON", "LOST", "DROPPED"].includes(opp.stage)) return { ok: false, error: "BOQ is locked on closed deals." };

  const existing = await db.opportunityLineItem.findMany({ where: { opportunityId: oppId } });
  const byId = new Map(existing.map((l) => [l.id, l]));
  const incomingIds = new Set(parsed.data.filter((l) => l.id).map((l) => l.id!));
  const toDelete = existing.filter((l) => !incomingIds.has(l.id));
  if (toDelete.length && !spec) return { ok: false, error: "Only presales or the deal owner can remove BOQ lines." };

  const dec = (n: number | null | undefined) => (n === null || n === undefined ? null : new Prisma.Decimal(n));
  let changed = 0;
  await db.$transaction(async (tx) => {
    if (toDelete.length) await tx.opportunityLineItem.deleteMany({ where: { id: { in: toDelete.map((l) => l.id) } } });
    let lineNo = 0;
    for (const l of parsed.data) {
      lineNo++;
      const specData = {
        businessUnitId: l.businessUnitId || null, categoryId: l.categoryId || null, oemId: l.oemId || null,
        partNumber: l.partNumber || null, description: l.description, quantity: new Prisma.Decimal(l.quantity), unit: l.unit,
        recurring: l.recurring, termMonths: l.recurring ? l.termMonths ?? opp.contractTermMonths ?? 12 : null, notes: l.notes || null,
      };
      const costData = {
        unitCost: dec(l.unitCost), distributor: l.distributor || null, oemQuoteRef: l.oemQuoteRef || null, leadTimeDays: l.leadTimeDays ?? null,
      };
      const priceData = { unitPrice: dec(l.unitPrice) };
      const cur = l.id ? byId.get(l.id) : undefined;
      if (!cur) {
        if (!spec) continue;
        await tx.opportunityLineItem.create({
          data: { opportunityId: oppId, lineNo, ...specData, ...(cost ? costData : {}), ...(price ? priceData : {}), createdById: user.id, updatedById: user.id },
        });
        changed++;
      } else {
        const data: Prisma.OpportunityLineItemUpdateInput = { lineNo, updatedById: user.id };
        if (spec) Object.assign(data, specData);
        if (cost) Object.assign(data, costData, { pricingStatus: l.unitCost !== null && l.unitCost !== undefined ? "QUOTED" : "PENDING" });
        if (price) Object.assign(data, priceData);
        await tx.opportunityLineItem.update({ where: { id: cur.id }, data });
        changed++;
      }
    }
    await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "BOQ_UPDATED", userId: user.id, newValue: `${changed} lines saved, ${toDelete.length} removed` });
    await tx.opportunity.update({ where: { id: oppId }, data: { lastActivityAt: new Date() } });
    await recomputeOpportunity(tx, oppId);
  });
  refresh(oppId);
  return { ok: true };
}

/** Set the deal value from the priced BOQ total. */
export async function syncAmountFromBoq(oppId: string): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp || !can.editOpportunity(user, opp)) return { ok: false, error: "Not allowed." };
  const lines = await db.opportunityLineItem.findMany({ where: { opportunityId: oppId } });
  const t = boqTotals(lines);
  if (!t.fullyPriced) return { ok: false, error: "Every BOQ line needs a sell price first." };
  await db.$transaction(async (tx) => {
    const amount = new Prisma.Decimal(Math.round(t.totalPrice));
    const margin = t.marginPct === null ? null : new Prisma.Decimal(Math.round(t.marginPct * 100) / 100);
    await tx.opportunity.update({ where: { id: oppId }, data: { amount, expectedMarginPct: margin, updatedById: user.id } });
    await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: opp, after: { amount, expectedMarginPct: margin }, fields: ["amount", "expectedMarginPct"], userId: user.id });
    await recomputeOpportunity(tx, oppId);
  });
  refresh(oppId);
  return { ok: true };
}

// ───────────── Quotes ─────────────

const quoteSchema = z.object({
  validTill: z.coerce.date(),
  terms: z.string().max(4000).optional(),
});

export async function createQuote(oppId: string, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.createQuote(user, opp)) return { ok: false, error: "Only the deal owner or a manager can issue quotes." };
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const lines = await db.opportunityLineItem.findMany({
    where: { opportunityId: oppId },
    orderBy: { lineNo: "asc" },
    include: { oem: { select: { name: true } } },
  });
  const t = boqTotals(lines);
  if (!t.fullyPriced) return { ok: false, error: "Every BOQ line needs a sell price before quoting." };
  if (!t.fullyCosted) return { ok: false, error: "Pricing from Purchase is incomplete." };
  try {
    const id = await db.$transaction(async (tx) => {
      const last = await tx.quote.findFirst({ where: { opportunityId: oppId }, orderBy: { version: "desc" } });
      await tx.quote.updateMany({ where: { opportunityId: oppId, status: { in: ["DRAFT", "SUBMITTED"] } }, data: { status: "SUPERSEDED" } });
      const code = await nextCode(tx, "QT");
      const q = await tx.quote.create({
        data: {
          code, opportunityId: oppId, version: (last?.version ?? 0) + 1, status: "SUBMITTED", submittedAt: new Date(),
          totalPrice: new Prisma.Decimal(Math.round(t.totalPrice)), totalCost: new Prisma.Decimal(Math.round(t.totalCost)),
          marginPct: new Prisma.Decimal(Math.round((t.marginPct ?? 0) * 100) / 100), validTill: parsed.data.validTill,
          terms: parsed.data.terms || null, createdById: user.id,
          snapshot: lines.map((l) => ({
            lineNo: l.lineNo, oem: l.oem?.name ?? null, partNumber: l.partNumber, description: l.description,
            quantity: toNumber(l.quantity), unit: l.unit, recurring: l.recurring, termMonths: l.termMonths,
            unitPrice: toNumber(l.unitPrice), extended: lineMultiplier(l) * toNumber(l.unitPrice),
          })),
        },
      });
      const amount = new Prisma.Decimal(Math.round(t.totalPrice));
      await tx.opportunity.update({
        where: { id: oppId },
        data: { amount, expectedMarginPct: new Prisma.Decimal(Math.round((t.marginPct ?? 0) * 100) / 100), lastActivityAt: new Date() },
      });
      await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: opp, after: { amount }, fields: ["amount"], userId: user.id });
      await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "QUOTE_ISSUED", userId: user.id, newValue: code });
      if (STAGE_META[opp.stage as StageKey].order < STAGE_META.PROPOSAL.order) {
        await applyStageChange(tx, user, oppId, "PROPOSAL", {});
      }
      await recomputeOpportunity(tx, oppId);
      return q.id;
    });
    refresh(oppId);
    return { ok: true, data: { id } };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}
