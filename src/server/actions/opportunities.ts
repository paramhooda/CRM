"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { can, opportunityScope } from "@/lib/authz";
import { recordChanges, recordEvent } from "@/lib/audit";
import { nextCode } from "@/lib/sequence";
import { notify } from "@/lib/notify";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { CLOSED_STAGES } from "@/lib/constants";
import { applyStageChange, UserError } from "@/server/domain/stage";
import {
  opportunitySchema, stageChangeSchema, zodErrors, formToObject, type ActionResult, type OpportunityInput,
} from "@/lib/validation";

const DAY = 86_400_000;
const AUDITED = [
  "name", "accountId", "primaryContactId", "businessUnitId", "categoryId", "oemId", "accountType", "revenueModel", "dealType",
  "procurementMode", "amount", "arrAmount", "contractTermMonths", "expectedMarginPct", "probability", "forecastCategory",
  "expectedCloseDate", "salesOwnerId", "presalesOwnerId", "leadSource", "competitors", "nextStep", "nextStepDate",
  "submissionDueDate", "dealRegStatus", "dealRegNumber", "dealRegExpiry", "lossReason", "poNumber", "poDate",
];

function toData(v: OpportunityInput) {
  const arrAmount =
    v.revenueModel === "ARR"
      ? v.arrAmount ?? (v.contractTermMonths ? Math.round(v.amount / (v.contractTermMonths / 12)) : null)
      : null;
  return {
    name: v.name,
    accountId: v.accountId,
    primaryContactId: v.primaryContactId ?? null,
    businessUnitId: v.businessUnitId,
    categoryId: v.categoryId,
    oemId: v.oemId ?? null,
    accountType: v.accountType,
    revenueModel: v.revenueModel,
    dealType: v.dealType,
    procurementMode: v.procurementMode,
    amount: new Prisma.Decimal(v.amount),
    arrAmount: arrAmount === null ? null : new Prisma.Decimal(arrAmount),
    contractTermMonths: v.revenueModel === "ARR" ? v.contractTermMonths ?? null : v.contractTermMonths ?? null,
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

async function loadEditable(user: CurrentUser, id: string) {
  const opp = await db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] } });
  if (!opp) throw new Error("Opportunity not found or not accessible");
  return opp;
}

export async function createOpportunity(form: FormData): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can.createOpportunity(user)) return { ok: false, error: "You do not have permission to create opportunities." };
  const parsed = opportunitySchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (user.role === "SALES" && v.salesOwnerId !== user.id) v.salesOwnerId = user.id;
  if (CLOSED_STAGES.includes(v.stage)) return { ok: false, error: "Create the deal in an open stage, then close it." };

  const id = await db.$transaction(async (tx) => {
    const now = new Date();
    const code = await nextCode(tx, "OPP", now);
    const opp = await tx.opportunity.create({
      data: {
        ...toData(v),
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
      await tx.opportunityContact.create({ data: { opportunityId: opp.id, contactId: v.primaryContactId, role: c?.role ?? "INFLUENCER" } });
    }
    await tx.stageHistory.create({
      data: { opportunityId: opp.id, toStage: v.stage, amount: opp.amount, changedById: user.id, changedAt: now },
    });
    await recordEvent(tx, { entityType: "Opportunity", entityId: opp.id, action: "CREATE", userId: user.id, newValue: opp.name });
    if (v.salesOwnerId !== user.id) {
      await notify(tx, [v.salesOwnerId], { type: "ASSIGNMENT", title: `New opportunity assigned: ${opp.name}`, body: `Assigned by ${user.name}`, link: `/opportunities/${opp.id}` });
    }
    await recomputeOpportunity(tx, opp.id, now);
    return opp.id;
  });
  revalidatePath("/opportunities");
  revalidatePath("/dashboard");
  return { ok: true, data: { id } };
}

export async function updateOpportunity(id: string, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const before = await loadEditable(user, id).catch(() => null);
  if (!before) return { ok: false, error: "Opportunity not found." };
  if (!can.editOpportunity(user, before)) return { ok: false, error: "You do not have permission to edit this opportunity." };
  const parsed = opportunitySchema.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (!can.reassignOpportunity(user)) v.salesOwnerId = before.salesOwnerId;

  let warning: string | undefined;
  await db.$transaction(async (tx) => {
    const data = toData(v);
    const now = new Date();
    // Slip tracking: pushing the close date out counts as a slip.
    let slip = before.closeDateSlipCount;
    if (data.expectedCloseDate.getTime() - before.expectedCloseDate.getTime() > DAY) slip++;
    await tx.opportunity.update({
      where: { id },
      data: { ...data, closeDateSlipCount: slip, updatedById: user.id },
    });
    await recordChanges(tx, {
      entityType: "Opportunity", entityId: id, before, after: { ...before, ...data }, fields: AUDITED, userId: user.id, at: now,
    });
    if (v.primaryContactId) {
      const exists = await tx.opportunityContact.findUnique({ where: { opportunityId_contactId: { opportunityId: id, contactId: v.primaryContactId } } });
      if (!exists) {
        const c = await tx.contact.findUnique({ where: { id: v.primaryContactId }, select: { role: true } });
        await tx.opportunityContact.create({ data: { opportunityId: id, contactId: v.primaryContactId, role: c?.role ?? "INFLUENCER" } });
      }
    }
    if (v.salesOwnerId !== before.salesOwnerId) {
      await notify(tx, [v.salesOwnerId], { type: "ASSIGNMENT", title: `Opportunity reassigned to you: ${v.name}`, body: `By ${user.name}`, link: `/opportunities/${id}`, exclude: user.id });
    }
    if (v.stage !== before.stage) {
      const r = await applyStageChange(tx, user, id, v.stage, { lossReason: v.lossReason, lossNotes: v.lossNotes, poNumber: v.poNumber, poDate: v.poDate }, { keepProbability: true, keepForecast: true });
      warning = r.warning;
    }
    await recomputeOpportunity(tx, id, now);
  });
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, warning };
}



export async function changeStage(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await loadEditable(user, id).catch(() => null);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.editOpportunity(user, opp)) return { ok: false, error: "Only the deal owner or a manager can change the stage." };
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

export async function setOpportunityContacts(id: string, contacts: { contactId: string; role: string }[]): Promise<ActionResult> {
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
    await recordEvent(tx, { entityType: "Opportunity", entityId: id, action: "CONTACTS", userId: user.id, newValue: String(contacts.length) });
    await recomputeOpportunity(tx, id);
  });
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}
