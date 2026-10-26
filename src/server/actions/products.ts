"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { recordChanges, recordEvent } from "@/lib/audit";
import { HSN_SAC } from "@/server/domain/lines";
import { zodErrors, type ActionResult } from "@/lib/validation";

const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).max(1e11).optional());

const productSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(3, "SKU is required").max(40).regex(/^[A-Z0-9][A-Z0-9\-_.\/]*$/, "Use letters, numbers, - _ . /"),
    name: z.string().trim().min(3, "Name is required").max(200),
    description: z.string().trim().max(2000).optional(),
    businessUnitId: z.string().min(1, "Select a business unit"),
    categoryId: z.string().min(1, "Select a category"),
    oemId: z.string().min(1, "Select an OEM"),
    productType: z.enum(["HARDWARE", "SOFTWARE_LICENCE", "SUBSCRIPTION", "SERVICE", "SUPPORT_AMC"]),
    unit: z.string().trim().min(1).max(20),
    billingFrequency: z.enum(["ONE_TIME", "MONTHLY", "QUARTERLY", "ANNUAL"]),
    defaultTermMonths: z.preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().int().min(1).max(120).optional()),
    listPrice: optNum,
    standardCost: optNum,
    hsnSac: z.string().trim().regex(HSN_SAC, "HSN/SAC must be 4–8 digits"),
    gstRatePct: z.coerce.number().min(0).max(28),
    active: z.preprocess((v) => v === undefined ? true : v === "on" || v === true || v === "true", z.boolean()),
  })
  .superRefine((v, ctx) => {
    if (v.billingFrequency !== "ONE_TIME" && !v.defaultTermMonths)
      ctx.addIssue({ code: "custom", path: ["defaultTermMonths"], message: "Recurring products need a default term" });
    if (v.listPrice !== undefined && v.standardCost !== undefined && v.standardCost > v.listPrice)
      ctx.addIssue({ code: "custom", path: ["standardCost"], message: "Standard cost is above list price" });
  });

const FIELDS = ["code", "name", "businessUnitId", "categoryId", "oemId", "productType", "unit", "billingFrequency", "defaultTermMonths", "listPrice", "standardCost", "hsnSac", "gstRatePct", "active"];

export async function saveProduct(id: string | null, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can.manageProducts(user)) return { ok: false, error: "Only administrators can change the product catalogue." };
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  const cat = await db.category.findUnique({ where: { id: v.categoryId } });
  if (!cat || cat.businessUnitId !== v.businessUnitId) return { ok: false, error: "Category does not belong to that business unit.", fieldErrors: { categoryId: "Mismatch" } };
  if (await db.oem.count({ where: { id: v.oemId, isPlaceholder: true } }))
    return { ok: false, error: "Catalogue products need a real OEM.", fieldErrors: { oemId: "Choose the OEM" } };
  const dupe = await db.product.findFirst({ where: { code: v.code, ...(id ? { NOT: { id } } : {}) } });
  if (dupe) return { ok: false, error: `SKU ${v.code} already exists.`, fieldErrors: { code: "Duplicate SKU" } };
  const data = {
    ...v,
    description: v.description || null,
    defaultTermMonths: v.billingFrequency === "ONE_TIME" ? null : v.defaultTermMonths ?? null,
    listPrice: v.listPrice === undefined ? null : new Prisma.Decimal(v.listPrice),
    standardCost: v.standardCost === undefined ? null : new Prisma.Decimal(v.standardCost),
    gstRatePct: new Prisma.Decimal(v.gstRatePct),
  };
  const result = await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.product.findUniqueOrThrow({ where: { id } });
      await tx.product.update({ where: { id }, data: { ...data, updatedById: user.id } });
      await recordChanges(tx, { entityType: "Product", entityId: id, before, after: data, fields: FIELDS, userId: user.id });
      return id;
    }
    const p = await tx.product.create({ data: { ...data, createdById: user.id, updatedById: user.id } });
    await recordEvent(tx, { entityType: "Product", entityId: p.id, action: "CREATE", userId: user.id, newValue: `${p.code} ${p.name}` });
    return p.id;
  });
  revalidatePath("/products");
  return { ok: true, data: { id: result } };
}

export async function toggleProduct(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can.manageProducts(user)) return { ok: false, error: "Only administrators can change the product catalogue." };
  const p = await db.product.findUnique({ where: { id } });
  if (!p) return { ok: false, error: "Product not found." };
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { active: !p.active, updatedById: user.id } });
    await recordChanges(tx, { entityType: "Product", entityId: id, before: p, after: { active: !p.active }, fields: ["active"], userId: user.id });
  });
  revalidatePath("/products");
  return { ok: true };
}
