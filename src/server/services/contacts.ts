import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, Forbidden, NotFound } from "../errors";
import { recordChanges, recordEvent } from "../audit";
import { accountWhere, assertPermission, contactWhere, notVisible, ownerInScope } from "../authz/scope";
import { isUniqueViolation } from "../prisma-errors";
import { paged, type Pagination } from "../http";
import type { ContactInput } from "@/contracts/accounts";
import { orderBy } from "./accounts";

const select = {
  id: true, firstName: true, lastName: true, email: true, phone: true, mobile: true, designation: true, department: true, isPrimary: true, notes: true, createdAt: true, updatedAt: true, deletedAt: true,
  account: { select: { id: true, code: true, name: true, ownerId: true } },
} satisfies Prisma.ContactSelect;
export type ContactRow = Prisma.ContactGetPayload<{ select: typeof select }>;

export type ContactFilters = { q?: string; accountId?: string; includeDeleted?: boolean };

export function contactListWhere(f: ContactFilters): Prisma.ContactWhereInput {
  return {
    accountId: f.accountId,
    ...(f.q ? { OR: [{ firstName: { contains: f.q, mode: "insensitive" } }, { lastName: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q.toLowerCase() } }, { account: { name: { contains: f.q, mode: "insensitive" } } }] } : {}),
  };
}

const SORTS: Record<string, (d: "asc" | "desc") => Prisma.ContactOrderByWithRelationInput> = {
  name: (d) => ({ lastName: d }),
  account: (d) => ({ account: { name: d } }),
  updatedAt: (d) => ({ updatedAt: d }),
};

export async function listContacts(actor: Actor, f: ContactFilters, p: Pagination) {
  const where: Prisma.ContactWhereInput = { AND: [await contactWhere(actor, { includeDeleted: f.includeDeleted }), contactListWhere(f)] };
  const [rows, total] = await Promise.all([
    db.contact.findMany({ where, select, orderBy: orderBy(SORTS, p.sort, { lastName: "asc" }), skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.contact.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function allContacts(actor: Actor, f: ContactFilters, sort?: string) {
  const where: Prisma.ContactWhereInput = { AND: [await contactWhere(actor, { includeDeleted: f.includeDeleted }), contactListWhere(f)] };
  return db.contact.findMany({ where, select, orderBy: orderBy(SORTS, sort, { lastName: "asc" }), take: 10_000 });
}

export async function getContact(actor: Actor, id: string) {
  const c = await db.contact.findFirst({ where: { id, ...(await contactWhere(actor, { includeDeleted: true })) }, select });
  if (!c) notVisible("That contact");
  return { ...c, canEdit: await canEditForAccount(actor, c.account.ownerId) && !c.deletedAt };
}

async function canEditForAccount(actor: Actor, accountOwnerId: string) {
  if (actor.role === "ADMIN") return true;
  if (actor.role === "SALES") return accountOwnerId === actor.id;
  if (actor.role === "SALES_HEAD") return ownerInScope(actor, accountOwnerId);
  return false;
}

async function editableAccount(actor: Actor, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, ...(await accountWhere(actor)) }, select: { id: true, ownerId: true } });
  if (!account) notVisible("That account");
  if (!(await canEditForAccount(actor, account.ownerId))) throw new Forbidden("Only the account owner or their manager can change its contacts.");
  return account;
}

export async function createContact(actor: Actor, input: ContactInput, requestId: string) {
  assertPermission(actor, "accounts.write");
  await editableAccount(actor, input.accountId);
  try {
    return await db.$transaction(async (tx) => {
      if (input.isPrimary) await tx.contact.updateMany({ where: { accountId: input.accountId, isPrimary: true }, data: { isPrimary: false } });
      const c = await tx.contact.create({ data: { ...input, createdById: actor.id }, select });
      await recordEvent(tx, { entityType: "contact", entityId: c.id, action: "CREATE", userId: actor.id, requestId, newValue: `${c.firstName} ${c.lastName} at ${c.account.name}` });
      return c;
    });
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new Conflict("A contact with this email already exists.", "DUPLICATE_EMAIL");
    throw e;
  }
}

export async function updateContact(actor: Actor, id: string, input: Partial<Omit<ContactInput, "accountId">>, requestId: string) {
  const before = await db.contact.findFirst({ where: { id, ...(await contactWhere(actor)) }, select });
  if (!before) notVisible("That contact");
  await editableAccount(actor, before.account.id);
  try {
    return await db.$transaction(async (tx) => {
      if (input.isPrimary) await tx.contact.updateMany({ where: { accountId: before.account.id, isPrimary: true, NOT: { id } }, data: { isPrimary: false } });
      const data: Prisma.ContactUncheckedUpdateInput = { ...input };
      const c = await tx.contact.update({ where: { id }, data, select });
      await recordChanges(tx, { entityType: "contact", entityId: id, userId: actor.id, requestId, before, after: input as Record<string, unknown>, fields: Object.keys(input) as never });
      return c;
    });
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new Conflict("A contact with this email already exists.", "DUPLICATE_EMAIL");
    throw e;
  }
}

export async function deleteContact(actor: Actor, id: string, requestId: string) {
  const c = await db.contact.findFirst({ where: { id, ...(await contactWhere(actor)) }, select });
  if (!c) notVisible("That contact");
  await editableAccount(actor, c.account.id);
  await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id, isPrimary: false } });
    await tx.deal.updateMany({ where: { primaryContactId: id, deletedAt: null, stage: { in: ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD"] } }, data: { primaryContactId: null } });
    await recordEvent(tx, { entityType: "contact", entityId: id, action: "DELETE", userId: actor.id, requestId, oldValue: `${c.firstName} ${c.lastName}` });
  });
}

export async function restoreContact(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "records.restore");
  const c = await db.contact.findUnique({ where: { id }, select });
  if (!c || !c.deletedAt) throw new NotFound();
  await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
    await recordEvent(tx, { entityType: "contact", entityId: id, action: "RESTORE", userId: actor.id, requestId, newValue: `${c.firstName} ${c.lastName}` });
  });
}
