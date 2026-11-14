import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, Forbidden, NotFound, ValidationError } from "../errors";
import { recordChanges, recordEvent } from "../audit";
import { assertOwnerInScope, assertPermission, leadWhere, notVisible, ownerInScope } from "../authz/scope";
import { nextCode } from "../sequence";
import { isUniqueViolation } from "../prisma-errors";
import { paged, type Pagination } from "../http";
import type { ConvertLeadInput, LeadInput } from "@/contracts/leads";
import { orderBy } from "./accounts";
import { createDealInTx } from "./deals";
import { defaultNeedsPresales } from "@/domain/lines";

const select = {
  id: true, code: true, companyName: true, contactName: true, contactEmail: true, contactPhone: true, designation: true, estimatedValue: true, notes: true, status: true, disqualifyReason: true,
  convertedAt: true, convertedAccountId: true, convertedContactId: true, convertedDealId: true, createdAt: true, updatedAt: true, deletedAt: true,
  leadSource: { select: { id: true, name: true } },
  industry: { select: { id: true, name: true } },
  segment: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true, colourToken: true } },
  owner: { select: { id: true, fullName: true } },
} satisfies Prisma.LeadSelect;
type Row = Prisma.LeadGetPayload<{ select: typeof select }>;
const out = (r: Row) => ({ ...r, estimatedValue: r.estimatedValue?.toString() ?? null, leadSourceId: r.leadSource.id, industryId: r.industry?.id ?? null, segmentId: r.segment?.id ?? null, businessUnitId: r.businessUnit?.id ?? null, ownerId: r.owner.id });
export type LeadRow = ReturnType<typeof out>;

export type LeadFilters = { q?: string; status?: string; sourceId?: string; ownerId?: string; includeDeleted?: boolean };

function listWhere(f: LeadFilters): Prisma.LeadWhereInput {
  return {
    status: f.status as Prisma.LeadWhereInput["status"],
    leadSourceId: f.sourceId,
    ownerId: f.ownerId,
    ...(f.q ? { OR: [{ companyName: { contains: f.q, mode: "insensitive" } }, { contactName: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { contactEmail: { contains: f.q.toLowerCase() } }] } : {}),
  };
}
const SORTS: Record<string, (d: "asc" | "desc") => Prisma.LeadOrderByWithRelationInput> = {
  company: (d) => ({ companyName: d }),
  status: (d) => ({ status: d }),
  owner: (d) => ({ owner: { fullName: d } }),
  estimatedValue: (d) => ({ estimatedValue: d }),
  updatedAt: (d) => ({ updatedAt: d }),
  createdAt: (d) => ({ createdAt: d }),
};

export async function listLeads(actor: Actor, f: LeadFilters, p: Pagination) {
  const where: Prisma.LeadWhereInput = { AND: [await leadWhere(actor, { includeDeleted: f.includeDeleted }), listWhere(f)] };
  const [rows, total] = await Promise.all([
    db.lead.findMany({ where, select, orderBy: orderBy(SORTS, p.sort, { createdAt: "desc" }), skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.lead.count({ where }),
  ]);
  return paged(rows.map(out), total, p);
}

export async function allLeads(actor: Actor, f: LeadFilters, sort?: string) {
  const where: Prisma.LeadWhereInput = { AND: [await leadWhere(actor, { includeDeleted: f.includeDeleted }), listWhere(f)] };
  return (await db.lead.findMany({ where, select, orderBy: orderBy(SORTS, sort, { createdAt: "desc" }), take: 10_000 })).map(out);
}

async function visible(actor: Actor, id: string, includeDeleted = false) {
  const lead = await db.lead.findFirst({ where: { id, ...(await leadWhere(actor, { includeDeleted })) }, select });
  if (!lead) notVisible("That lead");
  return lead;
}

async function canEdit(actor: Actor, lead: { owner: { id: string }; deletedAt: Date | null }) {
  if (lead.deletedAt) return false;
  if (actor.role === "ADMIN") return true;
  if (actor.role === "SALES") return lead.owner.id === actor.id;
  if (actor.role === "SALES_HEAD") return ownerInScope(actor, lead.owner.id);
  return false;
}

export async function getLead(actor: Actor, id: string) {
  const lead = await visible(actor, id, true);
  return { ...out(lead), canEdit: (await canEdit(actor, lead)) && lead.status !== "CONVERTED" && lead.status !== "DISQUALIFIED" };
}

async function assertRefs(input: Partial<LeadInput>) {
  if (input.leadSourceId && !(await db.leadSource.findUnique({ where: { id: input.leadSourceId } }))) throw new ValidationError("Pick a lead source.", { leadSourceId: "Pick a lead source." });
  if (input.industryId && !(await db.industry.findUnique({ where: { id: input.industryId } }))) throw new ValidationError("Pick an industry.", { industryId: "Pick an industry." });
  if (input.segmentId && !(await db.segment.findUnique({ where: { id: input.segmentId } }))) throw new ValidationError("Pick a segment.", { segmentId: "Pick a segment." });
  if (input.businessUnitId && !(await db.businessUnit.findUnique({ where: { id: input.businessUnitId } }))) throw new ValidationError("Pick a business unit.", { businessUnitId: "Pick a business unit." });
}

export async function createLead(actor: Actor, input: LeadInput, requestId: string) {
  assertPermission(actor, "leads.write");
  const ownerId = input.ownerId ?? actor.id;
  if (ownerId !== actor.id) await assertOwnerInScope(actor, ownerId);
  await assertRefs(input);
  return db.$transaction(async (tx) => {
    const code = await nextCode(tx, "LEAD");
    const l = await tx.lead.create({ data: { ...input, ownerId, code, createdById: actor.id }, select });
    await recordEvent(tx, { entityType: "lead", entityId: l.id, action: "CREATE", userId: actor.id, requestId, newValue: `${code} ${l.companyName}` });
    return out(l);
  });
}

export async function updateLead(actor: Actor, id: string, input: Partial<LeadInput> & { status?: "NEW" | "CONTACTED" | "QUALIFIED" }, requestId: string) {
  const before = await visible(actor, id);
  if (!(await canEdit(actor, before))) throw new Forbidden("Only the lead owner or their manager can change it.");
  if (before.status === "CONVERTED" || before.status === "DISQUALIFIED") throw new Conflict("This lead is closed.", "CLOSED");
  if (input.ownerId && input.ownerId !== before.owner.id) {
    assertPermission(actor, "leads.delete");
    await assertOwnerInScope(actor, input.ownerId);
  }
  await assertRefs(input);
  const { ownerId: newOwner, ...rest } = input;
  const data: Prisma.LeadUncheckedUpdateInput = { ...rest, ...(newOwner ? { ownerId: newOwner } : {}) };
  return db.$transaction(async (tx) => {
    const l = await tx.lead.update({ where: { id }, data, select });
    await recordChanges(tx, { entityType: "lead", entityId: id, userId: actor.id, requestId, before: out(before), after: out(l), fields: Object.keys(input) as (keyof LeadRow)[] });
    return out(l);
  });
}

export async function disqualifyLead(actor: Actor, id: string, reason: string, requestId: string) {
  const before = await visible(actor, id);
  if (!(await canEdit(actor, before))) throw new Forbidden("Only the lead owner or their manager can change it.");
  if (before.status === "CONVERTED") throw new Conflict("This lead has been converted.", "CLOSED");
  return db.$transaction(async (tx) => {
    const l = await tx.lead.update({ where: { id }, data: { status: "DISQUALIFIED", disqualifyReason: reason }, select });
    await recordChanges(tx, { entityType: "lead", entityId: id, userId: actor.id, requestId, before, after: l, fields: ["status", "disqualifyReason"] });
    return out(l);
  });
}

/** Converts once: an account (picked or created), a contact (picked or created) and a deal at Qualified, in one transaction. */
export async function convertLead(actor: Actor, id: string, input: ConvertLeadInput, requestId: string) {
  const lead = await visible(actor, id);
  if (!(await canEdit(actor, lead))) throw new Forbidden("Only the lead owner or their manager can convert it.");
  if (lead.status === "CONVERTED") throw new Conflict("This lead has already been converted.", "ALREADY_CONVERTED");
  if (lead.status === "DISQUALIFIED") throw new Conflict("A disqualified lead can't be converted.", "CLOSED");
  const ownerId = lead.owner.id;
  const subs = await db.subBusinessUnit.findMany({ select: { id: true, needsPresales: true } });
  try {
    const result = await db.$transaction(async (tx) => {
      let accountId: string;
      if ("existingId" in input.account) {
        const a = await tx.account.findFirst({ where: { id: input.account.existingId, deletedAt: null } });
        if (!a) throw new ValidationError("Pick an account.", { "account.existingId": "Pick an account." });
        if (!(await ownerInScope(actor, a.ownerId))) throw new ValidationError("That account belongs to someone outside your team.", { "account.existingId": "Not in your team." });
        accountId = a.id;
      } else {
        const dup = await tx.account.findFirst({ where: { name: { equals: input.account.create.name, mode: "insensitive" }, deletedAt: null }, select: { code: true } });
        if (dup) throw new Conflict(`An account with this name already exists (${dup.code}). Pick it instead.`, "DUPLICATE_NAME");
        const code = await nextCode(tx, "ACC");
        const { ownerId: _o, ...rest } = input.account.create;
        const a = await tx.account.create({ data: { ...rest, code, ownerId, createdById: actor.id } });
        await recordEvent(tx, { entityType: "account", entityId: a.id, action: "CREATE", userId: actor.id, requestId, newValue: `${code} ${a.name} (from lead ${lead.code})` });
        accountId = a.id;
      }
      let contactId: string;
      if ("existingId" in input.contact) {
        const c = await tx.contact.findFirst({ where: { id: input.contact.existingId, accountId, deletedAt: null } });
        if (!c) throw new ValidationError("The contact must belong to the account.", { "contact.existingId": "Not at this account." });
        contactId = c.id;
      } else {
        const c = await tx.contact.create({ data: { ...input.contact.create, accountId, isPrimary: !(await tx.contact.findFirst({ where: { accountId, isPrimary: true, deletedAt: null } })), createdById: actor.id } });
        await recordEvent(tx, { entityType: "contact", entityId: c.id, action: "CREATE", userId: actor.id, requestId, newValue: `${c.firstName} ${c.lastName} (from lead ${lead.code})` });
        contactId = c.id;
      }
      const dealId = await createDealInTx(tx, actor.id, {
        name: input.deal.name, accountId, primaryContactId: contactId, ownerId, expectedCloseDate: input.deal.expectedCloseDate, forecastCategory: input.deal.forecastCategory,
        needsPresales: input.deal.needsPresales ?? defaultNeedsPresales([], subs), leadSourceId: lead.leadSource.id, description: input.deal.description ?? lead.notes ?? null, nextStep: null, nextStepDate: null, lines: [], note: `Converted from lead ${lead.code}`,
      }, requestId);
      const l = await tx.lead.update({ where: { id }, data: { status: "CONVERTED", convertedAt: new Date(), convertedAccountId: accountId, convertedContactId: contactId, convertedDealId: dealId }, select });
      await recordChanges(tx, { entityType: "lead", entityId: id, userId: actor.id, requestId, before: lead, after: l, fields: ["status", "convertedDealId"] });
      return { lead: out(l), accountId, contactId, dealId };
    });
    return result;
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new Conflict("A contact with this email already exists. Pick the existing contact.", "DUPLICATE_EMAIL");
    if (isUniqueViolation(e, "gstin")) throw new Conflict("Another account already has this GSTIN.", "DUPLICATE_GSTIN");
    throw e;
  }
}

export async function deleteLead(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "leads.delete");
  const lead = await visible(actor, id);
  await db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
    await recordEvent(tx, { entityType: "lead", entityId: id, action: "DELETE", userId: actor.id, requestId, oldValue: lead.companyName });
  });
}

export async function restoreLead(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "records.restore");
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || !lead.deletedAt) throw new NotFound();
  await db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
    await recordEvent(tx, { entityType: "lead", entityId: id, action: "RESTORE", userId: actor.id, requestId, newValue: lead.companyName });
  });
}
