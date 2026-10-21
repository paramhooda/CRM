"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { accountScope, can, isManager } from "@/lib/authz";
import { recordChanges, recordEvent } from "@/lib/audit";
import { nextCode } from "@/lib/sequence";
import { accountSchema, contactSchema, zodErrors, type ActionResult } from "@/lib/validation";

const ACCOUNT_FIELDS = ["name", "industry", "segment", "status", "website", "phone", "gstin", "pan", "addressLine", "city", "state", "pincode", "annualRevenueCr", "employees", "ownerId", "description"];

export async function saveAccount(id: string | null, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can.manageAccounts(user)) return { ok: false, error: "You do not have permission to manage accounts." };
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (!isManager(user)) v.ownerId = user.id;
  const data = {
    ...v,
    industry: v.industry ?? null, website: v.website ?? null, phone: v.phone ?? null, gstin: v.gstin ?? null, pan: v.pan ?? null,
    addressLine: v.addressLine ?? null, city: v.city ?? null, state: v.state ?? null, pincode: v.pincode ?? null,
    annualRevenueCr: v.annualRevenueCr === undefined ? null : new Prisma.Decimal(v.annualRevenueCr), employees: v.employees ?? null,
    description: v.description ?? null,
  };
  const dupe = await db.account.findFirst({ where: { name: { equals: v.name, mode: "insensitive" }, deletedAt: null, ...(id ? { NOT: { id } } : {}) } });
  if (dupe) return { ok: false, error: `An account named "${dupe.name}" already exists (${dupe.code}).`, fieldErrors: { name: "Duplicate account name" } };
  if (v.gstin) {
    const g = await db.account.findFirst({ where: { gstin: v.gstin, deletedAt: null, ...(id ? { NOT: { id } } : {}) } });
    if (g) return { ok: false, error: `GSTIN already used by ${g.name}.`, fieldErrors: { gstin: "Duplicate GSTIN" } };
  }
  if (id) {
    const before = await db.account.findFirst({ where: { AND: [{ id }, accountScope(user)] } });
    if (!before) return { ok: false, error: "Account not found." };
    if (!isManager(user) && before.ownerId !== user.id) return { ok: false, error: "Only the account owner or a manager can edit this account." };
    await db.$transaction(async (tx) => {
      await tx.account.update({ where: { id }, data: { ...data, updatedById: user.id } });
      await recordChanges(tx, { entityType: "Account", entityId: id, before, after: data, fields: ACCOUNT_FIELDS, userId: user.id });
    });
    revalidatePath(`/accounts/${id}`);
    return { ok: true, data: { id } };
  }
  const created = await db.$transaction(async (tx) => {
    const code = await nextCode(tx, "ACC");
    const a = await tx.account.create({ data: { ...data, code, accountType: "NEW_LOGO", createdById: user.id, updatedById: user.id } });
    await recordEvent(tx, { entityType: "Account", entityId: a.id, action: "CREATE", userId: user.id, newValue: a.name });
    return a;
  });
  revalidatePath("/accounts");
  return { ok: true, data: { id: created.id } };
}

const CONTACT_FIELDS = ["firstName", "lastName", "title", "department", "email", "phone", "mobile", "role", "isPrimary"];

export async function saveContact(id: string | null, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can.manageAccounts(user)) return { ok: false, error: "You do not have permission to manage contacts." };
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  const acc = await db.account.findFirst({ where: { AND: [{ id: v.accountId }, accountScope(user)] } });
  if (!acc) return { ok: false, error: "Account not found." };
  if (v.email) {
    const dupe = await db.contact.findFirst({ where: { email: { equals: v.email, mode: "insensitive" }, deletedAt: null, ...(id ? { NOT: { id } } : {}) } });
    if (dupe) return { ok: false, error: `${v.email} already belongs to ${dupe.firstName} ${dupe.lastName}.`, fieldErrors: { email: "Duplicate email" } };
  }
  const data = {
    accountId: v.accountId, firstName: v.firstName, lastName: v.lastName, title: v.title ?? null, department: v.department ?? null,
    email: v.email ?? null, phone: v.phone ?? null, mobile: v.mobile ?? null, role: v.role, isPrimary: v.isPrimary,
    linkedin: v.linkedin ?? null, notes: v.notes ?? null,
  };
  const result = await db.$transaction(async (tx) => {
    if (v.isPrimary) await tx.contact.updateMany({ where: { accountId: v.accountId, NOT: id ? { id } : undefined }, data: { isPrimary: false } });
    if (id) {
      const before = await tx.contact.findUniqueOrThrow({ where: { id } });
      await tx.contact.update({ where: { id }, data: { ...data, updatedById: user.id } });
      await recordChanges(tx, { entityType: "Contact", entityId: id, before, after: data, fields: CONTACT_FIELDS, userId: user.id });
      return id;
    }
    const c = await tx.contact.create({ data: { ...data, createdById: user.id, updatedById: user.id } });
    await recordEvent(tx, { entityType: "Contact", entityId: c.id, action: "CREATE", userId: user.id, newValue: `${c.firstName} ${c.lastName}` });
    return c.id;
  });
  revalidatePath(`/accounts/${v.accountId}`);
  revalidatePath("/contacts");
  return { ok: true, data: { id: result } };
}

export async function deleteContact(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can.manageAccounts(user)) return { ok: false, error: "Not allowed." };
  const c = await db.contact.findUnique({ where: { id } });
  if (!c) return { ok: false, error: "Contact not found." };
  await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: { deletedAt: new Date(), isPrimary: false } });
    await recordEvent(tx, { entityType: "Contact", entityId: id, action: "DELETE", userId: user.id });
  });
  revalidatePath(`/accounts/${c.accountId}`);
  revalidatePath("/contacts");
  return { ok: true };
}
