"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { accountScope, can, isManager, leadScope } from "@/lib/authz";
import { recordChanges, recordEvent } from "@/lib/audit";
import { nextCode } from "@/lib/sequence";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { leadSchema, zodErrors, type ActionResult } from "@/lib/validation";
import { createEstimateLine } from "@/server/domain/lines";
import { dealTypeFor } from "@/lib/deal-setup";
import { safeAction, UserError } from "@/server/action-error";
import { startOfTodayIST } from "@/lib/format";

const LEAD_FIELDS = ["firstName", "lastName", "company", "title", "email", "phone", "city", "source", "businessUnitId", "requirement", "estimatedValue", "status", "ownerId", "disqualifyReason"];

export const saveLead = safeAction("saveLead", async function saveLead(id: string | null, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
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
  // Owners are active sales people; a manager's edit keeps an owner they did not change
  if (v.ownerId && !(await db.user.findFirst({ where: { id: v.ownerId, active: true, role: { in: ["SALES", "SALES_HEAD"] } }, select: { id: true } }))) {
    const keep = id ? await db.lead.findUnique({ where: { id }, select: { ownerId: true } }) : null;
    if (keep?.ownerId !== v.ownerId) return { ok: false, error: "Choose an active sales person as the owner.", fieldErrors: { ownerId: "Not an active sales user" } };
  }
  // The same person enquiring twice: warn, don't block (a second requirement is a fair new lead)
  const dupe = v.email
    ? (await db.lead.findFirst({ where: { email: { equals: v.email, mode: "insensitive" }, deletedAt: null, status: { notIn: ["CONVERTED", "UNQUALIFIED"] }, ...(id ? { NOT: { id } } : {}) }, select: { code: true } }))?.code
      ?? (await db.contact.findFirst({ where: { email: { equals: v.email, mode: "insensitive" }, deletedAt: null }, select: { firstName: true, lastName: true, account: { select: { name: true } } } }).then((c) => (c ? `${c.firstName} ${c.lastName} at ${c.account.name}` : null)))
    : null;
  const warning = dupe ? `${v.email} already belongs to ${dupe.startsWith("LEAD") ? `open lead ${dupe}` : `contact ${dupe}`}. Check this isn't a duplicate.` : undefined;
  if (id) {
    const before = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(user)] } });
    if (!before) return { ok: false, error: "Lead not found." };
    if (before.status === "CONVERTED") return { ok: false, error: "Converted leads are read-only." };
    await db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { ...data, updatedById: user.id } });
      await recordChanges(tx, { entityType: "Lead", entityId: id, before, after: data, fields: LEAD_FIELDS, userId: user.id });
    });
    revalidatePath("/leads");
    return { ok: true, data: { id }, warning };
  }
  const lead = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, "LEAD");
    const l = await tx.lead.create({ data: { ...data, code, createdById: user.id, updatedById: user.id } });
    await recordEvent(tx, { entityType: "Lead", entityId: l.id, action: "CREATE", userId: user.id, newValue: l.company });
    return l;
  });
  revalidatePath("/leads");
  return { ok: true, data: { id: lead.id }, warning };
});

const convertSchema = z.object({
  accountId: z.string().optional(),
  opportunityName: z.string().trim().min(3).max(160),
  categoryId: z.string().min(1, "Select a category"),
  oemId: z.string().min(1, "Select an OEM"),
  amount: z.coerce.number().positive(),
  expectedCloseDate: z.coerce.date(),
  /** Solution deal (presales prepares the BOQ) or resale; defaults to what the category usually needs */
  presalesRequired: z.preprocess((v) => (v === undefined || v === "" ? undefined : v === true || v === "true" || v === "on"), z.boolean().optional()),
});

/** Convert a qualified lead: creates (or reuses) the account, the contact and an opportunity in Qualified stage. */
export const convertLead = safeAction("convertLead", async function convertLead(id: string, input: Record<string, unknown>): Promise<ActionResult<{ opportunityId: string }>> {
  const user = await requireUser();
  if (!can.manageLeads(user)) return { ok: false, error: "Not allowed." };
  const lead = await db.lead.findFirst({ where: { AND: [{ id }, leadScope(user)] } });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status === "CONVERTED") return { ok: false, error: "Lead is already converted." };
  if (lead.status === "UNQUALIFIED") return { ok: false, error: "This lead was disqualified. Reopen it (edit its status) before converting." };
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (v.expectedCloseDate < startOfTodayIST()) return { ok: false, error: "The expected close date can't be in the past.", fieldErrors: { expectedCloseDate: "In the past" } };
  const cat = await db.category.findUnique({ where: { id: v.categoryId } });
  if (!cat || !cat.active) return { ok: false, error: "That category is no longer in use. Pick another.", fieldErrors: { categoryId: "Not active" } };
  const oem = await db.oem.findUnique({ where: { id: v.oemId } });
  if (!oem || !oem.active) return { ok: false, error: "That OEM is no longer in use. Pick another (or To be decided).", fieldErrors: { oemId: "Not active" } };
  // A lead owned by someone who left goes to whoever converts it
  const ownerActive = await db.user.findFirst({ where: { id: lead.ownerId, active: true, role: { in: ["SALES", "SALES_HEAD"] } }, select: { id: true } });
  const ownerId = ownerActive ? lead.ownerId : user.id;
  if (v.accountId && !(await db.account.findFirst({ where: { AND: [{ id: v.accountId }, accountScope(user)] }, select: { id: true } }))) {
    return { ok: false, error: "Account not found, or it isn't one you can see." };
  }

  const oppId = await db.$transaction(async (tx) => {
    const now = new Date();
    // Claim the lead first: two people converting it at once get one deal, not two
    const claimed = await tx.lead.updateMany({ where: { id, status: { notIn: ["CONVERTED", "UNQUALIFIED"] } }, data: { status: "CONVERTED", convertedAt: now } });
    if (!claimed.count) throw new UserError("This lead was just converted by someone else. Reload the page.");
    let accountId = v.accountId || null;
    if (!accountId) {
      // Same company name: reuse it if it's one this person can see; never quietly attach to someone else's account
      const existing = await tx.account.findFirst({ where: { name: { equals: lead.company, mode: "insensitive" }, deletedAt: null } });
      if (existing) {
        const visible = await tx.account.findFirst({ where: { AND: [{ id: existing.id }, accountScope(user)] }, select: { id: true } });
        if (!visible) throw new UserError(`An account named "${existing.name}" (${existing.code}) already exists and belongs to someone else. Ask a sales manager to convert this lead, or to give you that account.`);
        accountId = existing.id;
      } else {
        const acc = await tx.account.create({
          data: { code: await nextCode(tx, "ACC"), name: lead.company, city: lead.city, ownerId, status: "PROSPECT", accountType: "NEW_LOGO", createdById: user.id },
        });
        await recordEvent(tx, { entityType: "Account", entityId: acc.id, action: "CREATE", userId: user.id, newValue: `${acc.name} (from lead ${lead.code})` });
        accountId = acc.id;
      }
    }
    const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
    // The person may already be a contact: reuse them on this account; never create a second contact with their email
    const known = lead.email ? await tx.contact.findFirst({ where: { email: { equals: lead.email, mode: "insensitive" }, deletedAt: null }, include: { account: { select: { name: true } } } }) : null;
    if (known && known.accountId !== accountId)
      throw new UserError(`${lead.email} is already a contact at ${known.account.name}. Convert into that account, or correct the email on the lead.`);
    const contact = known ?? await tx.contact.create({
      data: {
        accountId, firstName: lead.firstName, lastName: lead.lastName, title: lead.title, email: lead.email, phone: lead.phone,
        role: "DECISION_MAKER", isPrimary: !(await tx.contact.count({ where: { accountId, deletedAt: null } })), createdById: user.id,
      },
    });
    const opp = await tx.opportunity.create({
      data: {
        code: await nextCode(tx, "OPP"), name: v.opportunityName, accountId, primaryContactId: contact.id, businessUnitId: cat.businessUnitId,
        categoryId: cat.id, oemId: v.oemId, accountType: account.accountType, dealType: dealTypeFor(account.accountType),
        presalesRequired: v.presalesRequired ?? cat.needsPresales, amount: new Prisma.Decimal(v.amount), stage: "QUALIFIED", probability: 20,
        forecastCategory: "PIPELINE", expectedCloseDate: v.expectedCloseDate, originalCloseDate: v.expectedCloseDate, stageEnteredAt: now,
        lastActivityAt: now, salesOwnerId: ownerId, leadSource: lead.source, description: lead.requirement, createdById: user.id,
        nextStep: "Discovery workshop with customer", nextStepDate: new Date(now.getTime() + 7 * 86_400_000),
      },
    });
    await tx.opportunityContact.create({ data: { opportunityId: opp.id, contactId: contact.id, role: contact.role ?? "DECISION_MAKER" } });
    // OEM lives on line items: start with one estimate line that presales later replaces with catalogue products
    await createEstimateLine(tx, { opportunityId: opp.id, lineNo: 1, categoryId: cat.id, businessUnitId: cat.businessUnitId, oemId: v.oemId, value: v.amount, billingFrequency: "ONE_TIME", termMonths: null, userId: user.id });
    await tx.stageHistory.create({ data: { opportunityId: opp.id, toStage: "QUALIFIED", amount: opp.amount, changedById: user.id } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: opp.id, action: "CREATE", userId: user.id, newValue: `${opp.name} (from lead ${lead.code})` });
    await tx.lead.update({ where: { id }, data: { convertedAccountId: accountId, convertedOpportunityId: opp.id } });
    await recordEvent(tx, { entityType: "Lead", entityId: id, action: "CONVERTED", userId: user.id, newValue: opp.code });
    await recomputeOpportunity(tx, opp.id);
    return opp.id;
  });
  revalidatePath("/leads");
  revalidatePath("/opportunities");
  return { ok: true, data: { opportunityId: oppId } };
});
