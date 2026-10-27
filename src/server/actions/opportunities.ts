"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { can, isManager, opportunityScope } from "@/lib/authz";
import { dealFieldErrors, checkSkip } from "@/lib/stage-rules";
import { loadStageFacts } from "@/server/domain/stage-facts";
import { dealTypeFor, needsBidDate, suggestPresales } from "@/lib/deal-setup";
import type { AccountType, DealType, RevenueModel } from "@prisma/client";
import { recordChanges, recordEvent } from "@/lib/audit";
import { nextCode } from "@/lib/sequence";
import { notify } from "@/lib/notify";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { CLOSED_STAGES, STAGE_META } from "@/lib/constants";
import { applyStageChange, UserError } from "@/server/domain/stage";
import { lineInputSchema, resolveSpec, rollUpDeal, draftLineSchema, createEstimateLine, costFactsLoader, initialCost, type DraftLine } from "@/server/domain/lines";
import { z } from "zod";
import { toNumber } from "@/lib/format";

function parseDraftLines(form: FormData) {
  try {
    const parsed = z.array(draftLineSchema).min(1).max(100).safeParse(JSON.parse(String(form.get("lines") ?? "[]")));
    return parsed.success ? { ok: true as const, lines: parsed.data } : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}
import {
  opportunitySchema,
  stageChangeSchema,
  zodErrors,
  formToObject,
  type ActionResult,
  type OpportunityInput,
} from "@/lib/validation";

const DAY = 86_400_000;
const AUDITED = [
  "name",
  "accountId",
  "primaryContactId",
  "businessUnitId",
  "categoryId",
  "oemId",
  "accountType",
  "revenueModel",
  "dealType",
  "procurementMode",
  "presalesRequired",
  "amount",
  "arrAmount",
  "contractTermMonths",
  "expectedMarginPct",
  "probability",
  "forecastCategory",
  "expectedCloseDate",
  "salesOwnerId",
  "presalesOwnerId",
  "leadSource",
  "competitors",
  "nextStep",
  "nextStepDate",
  "submissionDueDate",
  "dealRegStatus",
  "dealRegNumber",
  "dealRegExpiry",
  "lossReason",
  "poNumber",
  "poDate",
];

/** Header classification and value come from the line items (`Derived`), the rest from the form. */
type Derived = { amount: number; businessUnitId: string; categoryId: string; oemId: string | null };
/** The form input plus everything the person does not type (account type, deal type, revenue model, owner, probability). */
type Resolved = OpportunityInput & {
  accountType: AccountType; dealType: DealType; revenueModel: RevenueModel; salesOwnerId: string; probability: number; presalesRequired: boolean;
};

function toData(v: Resolved, d: Derived) {
  const arrAmount =
    v.revenueModel === "ARR"
      ? (v.arrAmount ?? (v.contractTermMonths ? Math.round(d.amount / (v.contractTermMonths / 12)) : null))
      : null;
  return {
    name: v.name,
    accountId: v.accountId,
    primaryContactId: v.primaryContactId ?? null,
    businessUnitId: d.businessUnitId,
    categoryId: d.categoryId,
    oemId: d.oemId,
    accountType: v.accountType,
    revenueModel: v.revenueModel,
    dealType: v.dealType,
    procurementMode: v.procurementMode,
    presalesRequired: v.presalesRequired,
    amount: new Prisma.Decimal(d.amount),
    arrAmount: arrAmount === null ? null : new Prisma.Decimal(arrAmount),
    contractTermMonths:
      v.revenueModel === "ARR" ? (v.contractTermMonths ?? null) : (v.contractTermMonths ?? null),
    contractStartDate: v.contractStartDate ?? null,
    expectedMarginPct: v.expectedMarginPct === undefined ? null : new Prisma.Decimal(v.expectedMarginPct),
    probability: v.probability,
    forecastCategory: v.forecastCategory,
    expectedCloseDate: v.expectedCloseDate,
    salesOwnerId: v.salesOwnerId,
    presalesOwnerId: v.presalesOwnerId ?? null,
    leadSource: v.leadSource ?? null,
    competitors: v.competitors ?? null,
    nextStep: v.nextStep ?? null,
    nextStepDate: v.nextStepDate ?? null,
    submissionDueDate: v.submissionDueDate ?? null,
    dealRegStatus: v.dealRegStatus,
    dealRegNumber: v.dealRegNumber ?? null,
    dealRegExpiry: v.dealRegExpiry ?? null,
    lossReason: v.lossReason ?? null,
    lossNotes: v.lossNotes ?? null,
    poNumber: v.poNumber ?? null,
    poDate: v.poDate ?? null,
    description: v.description ?? null,
  };
}

async function headerFromFirstLine(tx: Prisma.TransactionClient, d: DraftLine): Promise<Derived> {
  if (d.kind === "estimate") {
    const cat = await tx.category.findUnique({ where: { id: d.categoryId }, select: { businessUnitId: true } });
    if (!cat) throw new UserError("A selected category no longer exists.");
    return { amount: d.value, businessUnitId: cat.businessUnitId, categoryId: d.categoryId, oemId: d.oemId };
  }
  const p = await tx.product.findUnique({ where: { id: d.productId } });
  if (!p || !p.active) throw new UserError("A selected product is no longer in the catalogue.");
  return { amount: 1, businessUnitId: p.businessUnitId, categoryId: p.categoryId, oemId: p.oemId };
}

async function loadEditable(user: CurrentUser, id: string) {
  const opp = await db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] } });
  if (!opp) throw new Error("Opportunity not found or not accessible");
  return opp;
}

export async function createOpportunity(form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can.createOpportunity(user))
    return { ok: false, error: "You do not have permission to create opportunities." };
  const parsed = opportunitySchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const input = parsed.data;
  // New deals enter the funnel at the top; every later stage is earned through the process
  if (input.stage !== "IDENTIFIED" && input.stage !== "QUALIFIED")
    return { ok: false, error: "New deals start at Identified or Qualified.", fieldErrors: { stage: "Choose Identified or Qualified" } };
  if (input.stage === "QUALIFIED" && !input.primaryContactId)
    return { ok: false, error: "Add the customer contact to create a qualified deal.", fieldErrors: { primaryContactId: "Required for a qualified deal" } };
  const fieldErrors = {
    ...dealFieldErrors(input.stage, { forecastCategory: "", expectedCloseDate: new Date(0), nextStepDate: null }, { forecastCategory: input.forecastCategory, expectedCloseDate: input.expectedCloseDate, nextStepDate: input.nextStepDate ?? null }),
  };
  if (Object.keys(fieldErrors).length) return { ok: false, error: Object.values(fieldErrors)[0]!, fieldErrors };
  const drafts = parseDraftLines(form);
  if (!drafts.ok)
    return {
      ok: false,
      error: "Add at least one line item: a catalogue product, or a quick estimate with OEM, category and value.",
    };
  const account = await db.account.findFirst({ where: { id: input.accountId, deletedAt: null }, select: { accountType: true } });
  if (!account) return { ok: false, error: "Select an account.", fieldErrors: { accountId: "Select an account" } };
  // What the person does not type: account type from the account, deal type allowed for it, revenue model and term
  // from the lines (refined by the roll-up), presales from the categories unless they chose, owner and probability.
  const productCats = await db.product.findMany({
    where: { id: { in: drafts.lines.flatMap((d) => (d.kind === "product" ? [d.productId] : [])) } },
    select: { categoryId: true },
  });
  const categoryIds = [...drafts.lines.flatMap((d) => (d.kind === "estimate" ? [d.categoryId] : [])), ...productCats.map((p) => p.categoryId)];
  const categories = await db.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, needsPresales: true } });
  const recurring = drafts.lines.filter((d) => d.billingFrequency !== "ONE_TIME");
  const v: Resolved = {
    ...input,
    accountType: account.accountType,
    dealType: dealTypeFor(account.accountType, input.dealType),
    revenueModel: recurring.length ? "ARR" : "ONE_TIME",
    contractTermMonths: recurring.length ? Math.max(...recurring.map((d) => d.termMonths ?? 12)) : undefined,
    salesOwnerId: user.role === "SALES" || !input.salesOwnerId ? user.id : input.salesOwnerId,
    probability: STAGE_META[input.stage].probability,
    presalesRequired: input.presalesRequired ?? suggestPresales(categoryIds, categories),
    presalesOwnerId: undefined,
    submissionDueDate: needsBidDate(input.procurementMode) ? input.submissionDueDate : undefined,
  };

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const now = new Date();
      const code = await nextCode(tx, "OPP", now);
      const opp = await tx.opportunity.create({
        data: {
          // Placeholder classification from the first line; rollUpDeal below sets the real primary BU/OEM and value
          ...toData(v, await headerFromFirstLine(tx, drafts.lines[0]!)),
          code,
          stage: v.stage,
          originalCloseDate: v.expectedCloseDate,
          stageEnteredAt: now,
          lastActivityAt: now,
          createdById: user.id,
          updatedById: user.id,
        },
      });
      if (v.primaryContactId) {
        const c = await tx.contact.findUnique({ where: { id: v.primaryContactId }, select: { role: true } });
        await tx.opportunityContact.create({
          data: { opportunityId: opp.id, contactId: v.primaryContactId, role: c?.role ?? "INFLUENCER" },
        });
      }
      const costFacts = await costFactsLoader(tx);
      for (const [i, d] of drafts.lines.entries()) {
        if (d.kind === "estimate") {
          const cat = await tx.category.findUnique({ where: { id: d.categoryId }, select: { businessUnitId: true } });
          if (!cat) throw new UserError("A selected category no longer exists.");
          await createEstimateLine(tx, {
            opportunityId: opp.id, lineNo: i + 1, categoryId: d.categoryId, businessUnitId: cat.businessUnitId, oemId: d.oemId,
            value: d.value, billingFrequency: d.billingFrequency, termMonths: d.termMonths ?? v.contractTermMonths ?? null,
            description: d.description, userId: user.id,
          });
          continue;
        }
        const product = await tx.product.findUnique({ where: { id: d.productId } });
        if (!product || !product.active)
          throw new UserError("A selected product is no longer in the catalogue.");
        const line = lineInputSchema.parse({
          productId: product.id,
          description: product.name,
          quantity: d.quantity,
          unit: product.unit,
          billingFrequency: d.billingFrequency,
          termMonths: d.termMonths ?? v.contractTermMonths ?? product.defaultTermMonths,
          unitPrice: d.unitPrice,
        });
        const spec = await resolveSpec(tx, line, v.contractTermMonths ?? null);
        await tx.opportunityLineItem.create({
          data: {
            opportunityId: opp.id,
            lineNo: i + 1,
            ...spec,
            ...initialCost(await costFacts(spec)),
            unitPrice:
              d.unitPrice === null || d.unitPrice === undefined ? null : new Prisma.Decimal(d.unitPrice),
            createdById: user.id,
            updatedById: user.id,
          },
        });
      }
      await rollUpDeal(tx, opp.id, user.id);
      const created = await tx.opportunity.findUniqueOrThrow({
        where: { id: opp.id },
        select: { amount: true },
      });
      await tx.stageHistory.create({
        data: {
          opportunityId: opp.id,
          toStage: v.stage,
          amount: created.amount,
          changedById: user.id,
          changedAt: now,
        },
      });
      await recordEvent(tx, {
        entityType: "Opportunity",
        entityId: opp.id,
        action: "CREATE",
        userId: user.id,
        newValue: opp.name,
      });
      if (v.salesOwnerId !== user.id) {
        await notify(tx, [v.salesOwnerId], {
          type: "ASSIGNMENT",
          title: `New opportunity assigned: ${opp.name}`,
          body: `Assigned by ${user.name}`,
          link: `/opportunities/${opp.id}`,
        });
      }
      await recomputeOpportunity(tx, opp.id, now);
      return opp.id;
    });
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  return { ok: true, data: { id } };
}

export async function updateOpportunity(id: string, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const before = await loadEditable(user, id).catch(() => null);
  if (!before) return { ok: false, error: "Opportunity not found." };
  if (!can.editOpportunity(user, before))
    return { ok: false, error: "You do not have permission to edit this opportunity." };
  if (CLOSED_STAGES.includes(before.stage as never) && !isManager(user))
    return { ok: false, error: "Closed deals are read-only. Ask a sales manager if something needs correcting." };
  // The stage is never edited here: it moves through the stage bar and the workflow, under the process rules
  const parsed = opportunitySchema.safeParse({ ...formToObject(form), stage: before.stage });
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const input = parsed.data;
  const fieldErrors = dealFieldErrors(before.stage as never, before, { forecastCategory: input.forecastCategory, expectedCloseDate: input.expectedCloseDate, nextStepDate: input.nextStepDate ?? null });
  if (Object.keys(fieldErrors).length) return { ok: false, error: Object.values(fieldErrors)[0]!, fieldErrors };
  const accountType =
    input.accountId === before.accountId
      ? before.accountType
      : (await db.account.findFirst({ where: { id: input.accountId, deletedAt: null }, select: { accountType: true } }))?.accountType;
  if (!accountType) return { ok: false, error: "Select an account.", fieldErrors: { accountId: "Select an account" } };
  const presalesRequired = input.presalesRequired ?? before.presalesRequired;
  // Before qualification the path is just a choice. After that, presales comes in through "Involve presales" on the
  // deal, which assigns an engineer and a due date
  if (presalesRequired && !before.presalesRequired && before.stage !== "IDENTIFIED")
    return { ok: false, error: "To bring presales in, use Involve presales on the deal page. It assigns an engineer and a due date.", fieldErrors: { presalesRequired: "Use Involve presales on the deal page" } };
  if (!presalesRequired && before.presalesRequired) {
    const open = await db.presalesRequest.count({ where: { opportunityId: id, status: { in: ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] } } });
    if (open) return { ok: false, error: "Presales is working on this deal. Cancel the BOQ request before switching to a resale deal.", fieldErrors: { presalesRequired: "Presales is working on it" } };
  }
  // Revenue model, term, ARR and contract dates come from the lines and the won PO; probability follows the stage
  const v: Resolved = {
    ...input,
    accountType,
    dealType: dealTypeFor(accountType, input.dealType ?? before.dealType),
    revenueModel: before.revenueModel,
    contractTermMonths: before.contractTermMonths ?? undefined,
    arrAmount: before.arrAmount === null ? undefined : toNumber(before.arrAmount),
    contractStartDate: before.contractStartDate ?? undefined,
    expectedMarginPct: input.expectedMarginPct ?? (before.expectedMarginPct === null ? undefined : toNumber(before.expectedMarginPct)),
    salesOwnerId: can.reassignOpportunity(user) && input.salesOwnerId ? input.salesOwnerId : before.salesOwnerId,
    presalesOwnerId: before.presalesOwnerId ?? undefined,
    probability: before.probability,
    presalesRequired,
    submissionDueDate: needsBidDate(input.procurementMode) ? input.submissionDueDate : undefined,
  };
  // Value and primary classification roll up from the line items (edited on the Line items tab)
  const derived: Derived = {
    amount: toNumber(before.amount),
    businessUnitId: before.businessUnitId,
    categoryId: before.categoryId,
    oemId: before.oemId,
  };

  await db.$transaction(async (tx) => {
    const data = toData(v, derived);
    const now = new Date();
    // Slip tracking: pushing the close date out counts as a slip.
    let slip = before.closeDateSlipCount;
    if (data.expectedCloseDate.getTime() - before.expectedCloseDate.getTime() > DAY) slip++;
    await tx.opportunity.update({
      where: { id },
      data: { ...data, closeDateSlipCount: slip, updatedById: user.id },
    });
    await recordChanges(tx, {
      entityType: "Opportunity",
      entityId: id,
      before,
      after: { ...before, ...data },
      fields: AUDITED,
      userId: user.id,
      at: now,
    });
    if (v.primaryContactId) {
      const exists = await tx.opportunityContact.findUnique({
        where: { opportunityId_contactId: { opportunityId: id, contactId: v.primaryContactId } },
      });
      if (!exists) {
        const c = await tx.contact.findUnique({ where: { id: v.primaryContactId }, select: { role: true } });
        await tx.opportunityContact.create({
          data: { opportunityId: id, contactId: v.primaryContactId, role: c?.role ?? "INFLUENCER" },
        });
      }
    }
    if (v.salesOwnerId !== before.salesOwnerId) {
      await notify(tx, [v.salesOwnerId], {
        type: "ASSIGNMENT",
        title: `Opportunity reassigned to you: ${v.name}`,
        body: `By ${user.name}`,
        link: `/opportunities/${id}`,
        exclude: user.id,
      });
    }
    await recomputeOpportunity(tx, id, now);
  });
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function changeStage(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await loadEditable(user, id).catch(() => null);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.editOpportunity(user, opp))
    return { ok: false, error: "Only the deal owner or a manager can change the stage." };
  const parsed = stageChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  try {
    const r = await db.$transaction(async (tx) => {
      const res = await applyStageChange(tx, user, id, parsed.data.stage, parsed.data);
      await recomputeOpportunity(tx, id);
      return res;
    });
    revalidatePath(`/opportunities/${id}`);
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
    return { ok: true, warning: r.warning };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Skip the stage the deal is in (today only BOQ: presales turned out not to be needed). The deal becomes a resale
 * deal, any open BOQ request is cancelled with the reason, and the deal moves to Pricing.
 */
export async function skipStage(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await loadEditable(user, id).catch(() => null);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  const note = String(input.note ?? "").trim();
  if (note.length < 3) return { ok: false, error: "Give a reason for skipping this stage.", fieldErrors: { note: "Give a reason" } };
  try {
    await db.$transaction(async (tx) => {
      const facts = (await loadStageFacts(tx, [id])).get(id)!;
      const skip = checkSkip(facts, { canEdit: can.editOpportunity(user, opp), isManager: isManager(user) });
      if (!skip.allowed || !skip.to) throw new UserError(skip.reason ?? "This stage cannot be skipped.");
      const open = await tx.presalesRequest.findMany({ where: { opportunityId: id, status: { in: ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] } } });
      for (const r of open) {
        await tx.presalesRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelReason: `BOQ skipped: ${note}` } });
        await notify(tx, [r.assignedToId], { type: "WORKFLOW", title: `BOQ no longer needed: ${opp.name}`, body: `${user.name}: ${note}`, link: `/opportunities/${id}`, exclude: user.id });
      }
      await tx.opportunity.update({ where: { id }, data: { presalesRequired: false, updatedById: user.id } });
      await recordChanges(tx, { entityType: "Opportunity", entityId: id, before: opp, after: { presalesRequired: false }, fields: ["presalesRequired"], userId: user.id });
      await applyStageChange(tx, user, id, skip.to, { note: `Skipped ${STAGE_META[facts.stage].label}: ${note}` }, { keepForecast: true, source: "system" });
      await recomputeOpportunity(tx, id);
    });
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function deleteOpportunity(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can.deleteRecords(user)) return { ok: false, error: "Only managers can delete opportunities." };
  await db.$transaction(async (tx) => {
    await tx.opportunity.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: id, action: "DELETE", userId: user.id });
  });
  revalidatePath("/opportunities");
  return { ok: true };
}

export async function setOpportunityContacts(
  id: string,
  contacts: { contactId: string; role: string }[],
): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await loadEditable(user, id).catch(() => null);
  if (!opp || !can.editOpportunity(user, opp)) return { ok: false, error: "Not allowed." };
  await db.$transaction(async (tx) => {
    await tx.opportunityContact.deleteMany({ where: { opportunityId: id } });
    if (contacts.length) {
      await tx.opportunityContact.createMany({
        data: contacts.map((c) => ({ opportunityId: id, contactId: c.contactId, role: c.role as never })),
      });
    }
    await recordEvent(tx, {
      entityType: "Opportunity",
      entityId: id,
      action: "CONTACTS",
      userId: user.id,
      newValue: String(contacts.length),
    });
    await recomputeOpportunity(tx, id);
  });
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}
