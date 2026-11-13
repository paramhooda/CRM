import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, NotFound, ValidationError } from "../errors";
import { recordChanges, recordEvent } from "../audit";
import { assertPermission } from "../authz/scope";
import { nextCode } from "../sequence";
import type { ProductInput } from "@/contracts/lookups";

const select = {
  id: true, code: true, name: true, unit: true, revenueModel: true, defaultTermMonths: true, listPrice: true, standardCost: true, hsnSac: true, isActive: true, deletedAt: true,
  businessUnit: { select: { id: true, name: true } },
  subBusinessUnit: { select: { id: true, name: true } },
  oem: { select: { id: true, name: true, isOwnIp: true } },
} satisfies Prisma.ProductSelect;

const out = (p: Prisma.ProductGetPayload<{ select: typeof select }>) => ({
  ...p,
  listPrice: p.listPrice?.toString() ?? null,
  standardCost: p.standardCost?.toString() ?? null,
  businessUnitId: p.businessUnit.id,
  subBusinessUnitId: p.subBusinessUnit.id,
  oemId: p.oem.id,
});

export type ProductRow = ReturnType<typeof out>;

export async function listProducts(actor: Actor, f: { q?: string; businessUnitId?: string; subBusinessUnitId?: string; oemId?: string; includeInactive?: boolean; includeDeleted?: boolean }) {
  const admin = actor.role === "ADMIN";
  const where: Prisma.ProductWhereInput = {
    deletedAt: admin && f.includeDeleted ? undefined : null,
    isActive: admin && f.includeInactive ? undefined : true,
    businessUnitId: f.businessUnitId,
    subBusinessUnitId: f.subBusinessUnitId,
    oemId: f.oemId,
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const rows = await db.product.findMany({ where, select, orderBy: [{ businessUnit: { sortOrder: "asc" } }, { subBusinessUnit: { sortOrder: "asc" } }, { name: "asc" }], take: 500 });
  return { rows: rows.map(out) };
}

async function checkRefs(input: Partial<ProductInput>) {
  if (input.subBusinessUnitId) {
    const sub = await db.subBusinessUnit.findUnique({ where: { id: input.subBusinessUnitId } });
    if (!sub) throw new ValidationError("Pick a Sub BU.", { subBusinessUnitId: "Pick a Sub BU." });
    if (input.businessUnitId && sub.businessUnitId !== input.businessUnitId) throw new ValidationError("That Sub BU is not in the chosen business unit.", { subBusinessUnitId: "Not in this business unit." });
  }
  if (input.oemId && !(await db.oem.findUnique({ where: { id: input.oemId } }))) throw new ValidationError("Pick an OEM.", { oemId: "Pick an OEM." });
  if (input.revenueModel === "ARR" && input.defaultTermMonths === null) throw new ValidationError("ARR products need a default term.", { defaultTermMonths: "Required for ARR." });
}

export async function createProduct(actor: Actor, input: ProductInput, requestId: string) {
  assertPermission(actor, "products.manage");
  await checkRefs(input);
  if (await db.product.findFirst({ where: { oemId: input.oemId, name: input.name } })) throw new Conflict("That OEM already has a product with this name.", "DUPLICATE");
  const row = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, "PRD");
    const p = await tx.product.create({ data: { ...input, code, createdById: actor.id, defaultTermMonths: input.revenueModel === "ARR" ? input.defaultTermMonths : null }, select });
    await recordEvent(tx, { entityType: "product", entityId: p.id, action: "CREATE", userId: actor.id, requestId, newValue: `${code} ${p.name}` });
    return p;
  });
  return out(row);
}

export async function updateProduct(actor: Actor, id: string, input: Partial<ProductInput>, requestId: string) {
  assertPermission(actor, "products.manage");
  const before = await db.product.findUnique({ where: { id }, select });
  if (!before || before.deletedAt) throw new NotFound();
  await checkRefs({ ...input, businessUnitId: input.businessUnitId ?? before.businessUnit.id });
  if (input.name && (await db.product.findFirst({ where: { oemId: input.oemId ?? before.oem.id, name: input.name, NOT: { id } } }))) throw new Conflict("That OEM already has a product with this name.", "DUPLICATE");
  const after = await db.$transaction(async (tx) => {
    const p = await tx.product.update({ where: { id }, data: input, select });
    await recordChanges(tx, { entityType: "product", entityId: id, userId: actor.id, requestId, before: out(before), after: out(p), fields: Object.keys(input) as (keyof ProductRow)[] });
    return p;
  });
  return out(after);
}

export async function deleteProduct(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "products.manage");
  const p = await db.product.findUnique({ where: { id } });
  if (!p || p.deletedAt) throw new NotFound();
  await db.product.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
  await recordEvent(db, { entityType: "product", entityId: id, action: "DELETE", userId: actor.id, requestId, oldValue: p.name });
}

export async function restoreProduct(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "records.restore");
  const p = await db.product.findUnique({ where: { id } });
  if (!p || !p.deletedAt) throw new NotFound();
  await db.product.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  await recordEvent(db, { entityType: "product", entityId: id, action: "RESTORE", userId: actor.id, requestId, newValue: p.name });
}
