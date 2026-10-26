"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { recordEvent, recordChanges } from "@/lib/audit";
import { recomputeAll } from "@/lib/opportunity-service";
import { PICKLIST_TYPES } from "@/lib/constants";
import { zodErrors, type ActionResult } from "@/lib/validation";

async function requireAdmin() {
  const user = await requireUser();
  if (!can.admin(user)) throw new Error("Administrator access required");
  return user;
}

const password = z
  .string()
  .min(10, "At least 10 characters")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/\d/, "Include a number");

const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "SALES_HEAD", "SALES", "PRESALES", "PURCHASE"]),
  title: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  password: password.optional(),
  active: z.preprocess((v) => v === undefined ? undefined : v === "on" || v === true || v === "true", z.boolean().optional()),
});

export async function saveUser(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = userSchema.safeParse({ ...input, password: input.password || undefined });
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  const dupe = await db.user.findFirst({ where: { email: v.email, ...(id ? { NOT: { id } } : {}) } });
  if (dupe) return { ok: false, error: "A user with this email already exists.", fieldErrors: { email: "Already in use" } };
  if (id) {
    if (id === admin.id && (v.role !== "ADMIN" || v.active === false)) return { ok: false, error: "You cannot remove your own admin access." };
    const before = await db.user.findUniqueOrThrow({ where: { id } });
    const data = { name: v.name, email: v.email, role: v.role, title: v.title || null, phone: v.phone || null, active: v.active ?? before.active, ...(v.password ? { passwordHash: await bcrypt.hash(v.password, 10) } : {}) };
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      await recordChanges(tx, { entityType: "User", entityId: id, before, after: data, fields: ["name", "email", "role", "title", "active"], userId: admin.id });
      if (v.password) await recordEvent(tx, { entityType: "User", entityId: id, action: "PASSWORD_RESET", userId: admin.id });
    });
  } else {
    if (!v.password) return { ok: false, error: "Set an initial password.", fieldErrors: { password: "Required" } };
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { name: v.name, email: v.email, role: v.role, title: v.title || null, phone: v.phone || null, passwordHash: await bcrypt.hash(v.password!, 10) } });
      await recordEvent(tx, { entityType: "User", entityId: u.id, action: "CREATE", userId: admin.id, newValue: `${u.email} (${u.role})` });
    });
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function addPicklistValue(type: string, value: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const v = value.trim();
  if (!v || v.length > 80) return { ok: false, error: "Enter a value (max 80 characters)." };
  if (type === "OEM") {
    if (await db.oem.findUnique({ where: { name: v } })) return { ok: false, error: "Already exists." };
    const max = await db.oem.aggregate({ _max: { sortOrder: true } });
    await db.oem.create({ data: { name: v, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  } else if (type.startsWith("CATEGORY:")) {
    const buId = type.slice(9);
    if (await db.category.findFirst({ where: { businessUnitId: buId, name: v } })) return { ok: false, error: "Already exists." };
    const max = await db.category.aggregate({ where: { businessUnitId: buId }, _max: { sortOrder: true } });
    await db.category.create({ data: { name: v, businessUnitId: buId, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  } else if (type in PICKLIST_TYPES) {
    if (await db.picklistValue.findFirst({ where: { type, value: v } })) return { ok: false, error: "Already exists." };
    const max = await db.picklistValue.aggregate({ where: { type }, _max: { sortOrder: true } });
    await db.picklistValue.create({ data: { type, value: v, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  } else return { ok: false, error: "Unknown picklist." };
  await db.auditLog.create({ data: { entityType: "Picklist", entityId: type, action: "ADD", newValue: v, changedById: admin.id } });
  revalidatePath("/admin");
  return { ok: true };
}

export async function togglePicklistValue(kind: "OEM" | "CATEGORY" | "VALUE", id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (kind === "OEM") {
    const o = await db.oem.findUniqueOrThrow({ where: { id } });
    if (o.isPlaceholder) return { ok: false, error: "\"To be decided\" is a system value used on early estimates and cannot be switched off." };
    await db.oem.update({ where: { id }, data: { active: !o.active } });
  } else if (kind === "CATEGORY") {
    const c = await db.category.findUniqueOrThrow({ where: { id } });
    await db.category.update({ where: { id }, data: { active: !c.active } });
  } else {
    const p = await db.picklistValue.findUniqueOrThrow({ where: { id } });
    await db.picklistValue.update({ where: { id }, data: { active: !p.active } });
  }
  await db.auditLog.create({ data: { entityType: "Picklist", entityId: id, action: "TOGGLE", changedById: admin.id } });
  revalidatePath("/admin");
  return { ok: true };
}

export async function saveTargets(fiscalYear: number, rows: { userId: string; quarter: number; amount: number }[]): Promise<ActionResult> {
  const user = await requireUser();
  if (!can.manageTargets(user)) return { ok: false, error: "Not allowed." };
  const parsed = z.array(z.object({ userId: z.string(), quarter: z.number().int().min(1).max(4), amount: z.number().min(0).max(1e11) })).max(400).safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Invalid target values." };
  await db.$transaction(async (tx) => {
    for (const r of parsed.data) {
      await tx.salesTarget.upsert({
        where: { userId_fiscalYear_quarter: { userId: r.userId, fiscalYear, quarter: r.quarter } },
        create: { userId: r.userId, fiscalYear, quarter: r.quarter, targetAmount: new Prisma.Decimal(r.amount) },
        update: { targetAmount: new Prisma.Decimal(r.amount) },
      });
    }
    await recordEvent(tx, { entityType: "SalesTarget", entityId: String(fiscalYear), action: "UPDATE", userId: user.id, newValue: `${parsed.data.length} cells` });
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function runRecompute(): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();
  const count = await recomputeAll(db);
  revalidatePath("/", "layout");
  return { ok: true, data: { count } };
}
