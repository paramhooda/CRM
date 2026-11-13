import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, Forbidden, NotFound, ValidationError } from "../errors";
import { recordChanges, recordEvent } from "../audit";
import { accountWhere, assertOwnerInScope, assertPermission, dealWhere, notVisible, ownerInScope } from "../authz/scope";
import { nextCode } from "../sequence";
import { isUniqueViolation } from "../prisma-errors";
import type { Pagination } from "../http";
import { paged } from "../http";
import type { AccountInput } from "@/contracts/accounts";
import { STAGE_META } from "@/domain/stages";

const listSelect = {
  id: true, code: true, name: true, gstin: true, city: true, state: true, createdAt: true, updatedAt: true, deletedAt: true,
  industry: { select: { id: true, name: true } },
  segment: { select: { id: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  _count: { select: { contacts: { where: { deletedAt: null } }, deals: { where: { deletedAt: null, stage: { in: ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD"] } } } } },
} satisfies Prisma.AccountSelect;

export type AccountListRow = Prisma.AccountGetPayload<{ select: typeof listSelect }>;

export type AccountFilters = { q?: string; industryId?: string; segmentId?: string; ownerId?: string; includeDeleted?: boolean };

export function accountListWhere(f: AccountFilters): Prisma.AccountWhereInput {
  return {
    industryId: f.industryId,
    segmentId: f.segmentId,
    ownerId: f.ownerId,
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { gstin: { contains: f.q.toUpperCase() } }, { city: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
}

const SORTS: Record<string, (d: "asc" | "desc") => Prisma.AccountOrderByWithRelationInput> = {
  name: (d) => ({ name: d }),
  code: (d) => ({ code: d }),
  city: (d) => ({ city: d }),
  owner: (d) => ({ owner: { fullName: d } }),
  updatedAt: (d) => ({ updatedAt: d }),
  createdAt: (d) => ({ createdAt: d }),
};

export function orderBy<T>(sorts: Record<string, (d: "asc" | "desc") => T>, sort: string | undefined, fallback: T): T {
  if (!sort) return fallback;
  const [field, dir] = sort.split(":") as [string, "asc" | "desc"];
  return sorts[field]?.(dir) ?? fallback;
}

export async function listAccounts(actor: Actor, f: AccountFilters, p: Pagination) {
  const where: Prisma.AccountWhereInput = { AND: [await accountWhere(actor, { includeDeleted: f.includeDeleted }), accountListWhere(f)] };
  const [rows, total] = await Promise.all([
    db.account.findMany({ where, select: listSelect, orderBy: orderBy(SORTS, p.sort, { name: "asc" }), skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.account.count({ where }),
  ]);
  return paged(rows, total, p);
}

/** Every row matching the filters (for CSV), capped. */
export async function allAccounts(actor: Actor, f: AccountFilters, sort?: string) {
  const where: Prisma.AccountWhereInput = { AND: [await accountWhere(actor, { includeDeleted: f.includeDeleted }), accountListWhere(f)] };
  return db.account.findMany({ where, select: listSelect, orderBy: orderBy(SORTS, sort, { name: "asc" }), take: 10_000 });
}

export async function getAccount(actor: Actor, id: string) {
  const account = await db.account.findFirst({
    where: { id, ...(await accountWhere(actor, { includeDeleted: true })) },
    include: {
      industry: { select: { id: true, name: true } },
      segment: { select: { id: true, name: true } },
      owner: { select: { id: true, fullName: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true, email: true, phone: true, mobile: true, designation: true, department: true, isPrimary: true } },
    },
  });
  if (!account) notVisible("That account");
  const deals = await db.deal.findMany({
    where: { accountId: id, ...(await dealWhere(actor)) },
    select: { id: true, code: true, name: true, stage: true, dealValue: true, expectedCloseDate: true, forecastCategory: true, owner: { select: { id: true, fullName: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const sales = actor.role !== "PRESALES" && actor.role !== "PURCHASE";
  return {
    ...account,
    canEdit: await canEditAccount(actor, account),
    deals: deals.map((d) => ({ ...d, stageLabel: STAGE_META[d.stage].label, dealValue: sales ? d.dealValue.toString() : null, forecastCategory: sales ? d.forecastCategory : null })),
  };
}

async function canEditAccount(actor: Actor, account: { ownerId: string; deletedAt: Date | null }) {
  if (account.deletedAt) return false;
  if (actor.role === "ADMIN") return true;
  if (actor.role === "SALES") return account.ownerId === actor.id;
  if (actor.role === "SALES_HEAD") return ownerInScope(actor, account.ownerId);
  return false;
}

async function assertNameFree(name: string, exceptId?: string) {
  const dup = await db.account.findFirst({ where: { name: { equals: name, mode: "insensitive" }, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { code: true } });
  if (dup) throw new Conflict(`An account with this name already exists (${dup.code}).`, "DUPLICATE_NAME");
}

async function assertRefs(input: Partial<AccountInput>) {
  if (input.industryId && !(await db.industry.findUnique({ where: { id: input.industryId } }))) throw new ValidationError("Pick an industry.", { industryId: "Pick an industry." });
  if (input.segmentId && !(await db.segment.findUnique({ where: { id: input.segmentId } }))) throw new ValidationError("Pick a segment.", { segmentId: "Pick a segment." });
}

export async function createAccount(actor: Actor, input: AccountInput, requestId: string) {
  assertPermission(actor, "accounts.write");
  const ownerId = input.ownerId ?? actor.id;
  if (ownerId !== actor.id) await assertOwnerInScope(actor, ownerId);
  await assertRefs(input);
  await assertNameFree(input.name);
  try {
    return await db.$transaction(async (tx) => {
      const code = await nextCode(tx, "ACC");
      const a = await tx.account.create({ data: { ...input, ownerId, code, createdById: actor.id }, select: listSelect });
      await recordEvent(tx, { entityType: "account", entityId: a.id, action: "CREATE", userId: actor.id, requestId, newValue: `${code} ${a.name}` });
      return a;
    });
  } catch (e) {
    if (isUniqueViolation(e, "gstin")) throw new Conflict("Another account already has this GSTIN.", "DUPLICATE_GSTIN");
    throw e;
  }
}

export async function updateAccount(actor: Actor, id: string, input: Partial<AccountInput>, requestId: string) {
  const before = await db.account.findFirst({ where: { id, ...(await accountWhere(actor)) } });
  if (!before) notVisible("That account");
  if (!(await canEditAccount(actor, before))) throw new Forbidden("Only the account owner or their manager can change it.");
  if (input.ownerId && input.ownerId !== before.ownerId) {
    assertPermission(actor, "accounts.delete"); // managers reassign
    await assertOwnerInScope(actor, input.ownerId);
  }
  await assertRefs(input);
  if (input.name) await assertNameFree(input.name, id);
  try {
    return await db.$transaction(async (tx) => {
      const { ownerId: newOwner, ...rest } = input;
      const data: Prisma.AccountUncheckedUpdateInput = { ...rest, ...(newOwner ? { ownerId: newOwner } : {}) };
      const a = await tx.account.update({ where: { id }, data, select: listSelect });
      await recordChanges(tx, { entityType: "account", entityId: id, userId: actor.id, requestId, before, after: input as Record<string, unknown>, fields: Object.keys(input) as never });
      return a;
    });
  } catch (e) {
    if (isUniqueViolation(e, "gstin")) throw new Conflict("Another account already has this GSTIN.", "DUPLICATE_GSTIN");
    throw e;
  }
}

export async function deleteAccount(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "accounts.delete");
  const a = await db.account.findFirst({ where: { id, ...(await accountWhere(actor)) }, include: { _count: { select: { deals: { where: { deletedAt: null } } } } } });
  if (!a) notVisible("That account");
  if (a._count.deals > 0) throw new Conflict(`This account has ${a._count.deals} deal${a._count.deals > 1 ? "s" : ""}. Delete or move them first.`, "HAS_DEALS");
  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
    await recordEvent(tx, { entityType: "account", entityId: id, action: "DELETE", userId: actor.id, requestId, oldValue: a.name });
  });
}

export async function restoreAccount(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "records.restore");
  const a = await db.account.findUnique({ where: { id } });
  if (!a || !a.deletedAt) throw new NotFound();
  await assertNameFree(a.name, id);
  await db.$transaction(async (tx) => {
    await tx.account.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
    await recordEvent(tx, { entityType: "account", entityId: id, action: "RESTORE", userId: actor.id, requestId, newValue: a.name });
  });
}
