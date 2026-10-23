"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, isManager, leadScope } from "@/lib/authz";
import { recordChanges, recordEvent } from "@/lib/audit";
import { nextCode } from "@/lib/sequence";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { leadSchema, zodErrors, type ActionResult } from "@/lib/validation";
import { createEstimateLine } from "@/server/domain/lines";

const LEAD_FIELDS = ["firstName", "lastName", "company", "title", "email", "phone", "city", "source", "businessUnitId", "requirement", "estimatedValue", "status", "ownerId", "disqualifyReason"];

export async function saveLead(id: string | null, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can.manageLeads(user)) return { ok: false, error: "Not allowed." };
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (!isManager(user)) v.ownerId = user.id;
  if (v.status === "UNQUALIFIED" && !v.disqualifyReason) return { ok: false, error: "Give a reason for disqualifying.", fieldErrors: { disqualifyReason: "Required" } };
  if (v.status === "CONVERTED") return { ok: false, error: "Use Convert to turn a lead into an opportunity." };
  const data = {
    ...v,
    title: v.title ?? null, email: v.email ?? null, phone: v.phone ?? null, city: v.city ?? null, source: v.source ?? null,
    businessUnitId: v.businessUnitId ?? null, requirement: v.requirement ?? null, disqualifyReason: v.disqualifyReason ?? null,
    estimatedValue: v.estimatedValue === undefined ? null : new Prisma.Decimal(v.estimatedValue),
  };
  if (id) {
    const before = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(user)] } });
    if (!before) return { ok: false, error: "Lead not found." };
    if (before.status === "CONVERTED") return { ok: false, error: "Converted leads are read-only." };
    await db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { ...data, updatedById: user.id } });
      await recordChanges(tx, { entityType: "Lead", entityId: id, before, after: data, fields: LEAD_FIELDS, userId: user.id });
    });
    revalidatePath("/leads");
    return { ok: true, data: { id } };
  }
  const lead = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, "LEAD");
    const l = await tx.lead.create({ data: { ...data, code, createdById: user.id, updatedById: user.id } });
    await recordEvent(tx, { entityType: "Lead", entityId: l.id, action: "CREATE", userId: user.id, newValue: l.company });
    return l;
  });
  revalidatePath("/leads");
  return { ok: true, data: { id: lead.id } };
}

const convertSchema = z.object({
  accountId: z.string().optional(),
  opportunityName: z.string().trim().min(3).max(160),
  categoryId: z.string().min(1, "Select a category"),
  oemId: z.string().min(1, "Select an OEM"),
  amount: z.coerce.number().positive(),
  expectedCloseDate: z.coerce.date(),
});

/** Convert a qualified lead: creates (or reuses) the account, the contact and an opportunity in Qualified stage. */
export async function convertLead(id: string, input: Record<string, unknown>): Promise<ActionResult<{ opportunityId: string }>> {
  const user = await requireUser();
  if (!can.manageLeads(user)) return { ok: false, error: "Not allowed." };
  const lead = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(user)] } });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status === "CONVERTED") return { ok: false, error: "Lead is already converted." };
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  const cat = await db.category.findUnique({ where: { id: v.categoryId } });
  if (!cat) return { ok: false, error: "Category not found." };

  const oppId = await db.$transaction(async (tx) => {
    const now = new Date();
    let accountId = v.accountId || null;
    if (!accountId) {
      const existing = await tx.account.findFirst({ where: { name: { equals: lead.company, mode: "insensitive" }, deletedAt: null } });
      if (existing) accountId = existing.id;
      else {
        const acc = await tx.account.create({
          data: { code: await nextCode(tx, "ACC"), name: lead.company, city: lead.city, ownerId: lead.ownerId, status: "PROSPECT", accountType: "NEW_LOGO", createdById: user.id },
        });
        await recordEvent(tx, { entityType: "Account", entityId: acc.id, action: "CREATE", userId: user.id, newValue: `${acc.name} (from lead ${lead.code})` });
        accountId = acc.id;
      }
    }
    const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
    const contact = await tx.contact.create({
      data: {
        accountId, firstName: lead.firstName, lastName: lead.lastName, title: lead.title, email: lead.email, phone: lead.phone,
        role: "DECISION_MAKER", isPrimary: !(await tx.contact.count({ where: { accountId, deletedAt: null } })), createdById: user.id,
      },
    });
    const opp = await tx.opportunity.create({
      data: {
        code: await nextCode(tx, "OPP"), name: v.opportunityName, accountId, primaryContactId: contact.id, businessUnitId: cat.businessUnitId,
        categoryId: cat.id, oemId: v.oemId, accountType: account.accountType, amount: new Prisma.Decimal(v.amount), stage: "QUALIFIED", probability: 20,
        forecastCategory: "PIPELINE", expectedCloseDate: v.expectedCloseDate, originalCloseDate: v.expectedCloseDate, stageEnteredAt: now,
        lastActivityAt: now, salesOwnerId: lead.ownerId, leadSource: lead.source, description: lead.requirement, createdById: user.id,
        nextStep: "Discovery workshop with customer", nextStepDate: new Date(now.getTime() + 7 * 86_400_000),
      },
    });
    await tx.opportunityContact.create({ data: { opportunityId: opp.id, contactId: contact.id, role: "DECISION_MAKER" } });
    // OEM lives on line items: start with one estimate line that presales later replaces with catalogue products
    await createEstimateLine(tx, { opportunityId: opp.id, lineNo: 1, categoryId: cat.id, businessUnitId: cat.businessUnitId, oemId: v.oemId, value: v.amount, billingFrequency: "ONE_TIME", termMonths: null, userId: user.id });
    await tx.stageHistory.create({ data: { opportunityId: opp.id, toStage: "QUALIFIED", amount: opp.amount, changedById: user.id } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: opp.id, action: "CREATE", userId: user.id, newValue: `${opp.name} (from lead ${lead.code})` });
    await tx.lead.update({ where: { id }, data: { status: "CONVERTED", convertedAt: now, convertedAccountId: accountId, convertedOpportunityId: opp.id } });
    await recordEvent(tx, { entityType: "Lead", entityId: id, action: "CONVERTED", userId: user.id, newValue: opp.code });
    await recomputeOpportunity(tx, opp.id);
    return opp.id;
  });
  revalidatePath("/leads");
  revalidatePath("/opportunities");
  return { ok: true, data: { opportunityId: oppId } };
}
