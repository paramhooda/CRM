"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { notify } from "@/lib/notify";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { recordEvent, recordChanges } from "@/lib/audit";
import { recomputeAll } from "@/lib/opportunity-service";
import { PICKLIST_TYPES } from "@/lib/constants";
import { zodErrors, type ActionResult } from "@/lib/validation";
import { safeAction, UserError } from "@/server/action-error";
import { BCRYPT_COST, passwordProblems } from "@/lib/password";
import { sealSecret } from "@/lib/secret-box";
import { emailReady, getEmailSettings, linkBase, putEmailSettings, type EmailSettings } from "@/server/settings";
import { sendMail, sendWith } from "@/server/email";

async function requireAdmin() {
  const user = await requireUser();
  if (!can.admin(user)) throw new UserError("Administrator access required.");
  return user;
}

const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "SALES_HEAD", "SALES", "PRESALES", "PURCHASE"]),
  title: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  password: z.string().max(200).optional(),
  /** Successor for open work when the user is deactivated or changes role */
  handoverToId: z.string().optional(),
  active: z.preprocess((v) => v === undefined ? undefined : v === "on" || v === true || v === "true", z.boolean().optional()),
});

const INVITE_TTL_MS = 72 * 3_600_000;
const OPEN_DEAL = { deletedAt: null, stage: { notIn: ["WON", "LOST", "DROPPED"] as ("WON" | "LOST" | "DROPPED")[] } };
const OPEN_PS = { in: ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as ("REQUESTED" | "IN_PROGRESS" | "NEEDS_INFO")[] };
const OPEN_PQ = { in: ["REQUESTED", "IN_PROGRESS"] as ("REQUESTED" | "IN_PROGRESS")[] };

/** Open work a person holds: deals they own or support, requests with or from them, leads they own */
async function openWorkOf(userId: string, tx: Tx = db) {
  const [deals, supporting, presales, pricing, requested, leads] = await Promise.all([
    tx.opportunity.count({ where: { ...OPEN_DEAL, salesOwnerId: userId } }),
    tx.opportunity.count({ where: { ...OPEN_DEAL, OR: [{ presalesOwnerId: userId }, { purchaseOwnerId: userId }] } }),
    tx.presalesRequest.count({ where: { assignedToId: userId, status: OPEN_PS } }),
    tx.pricingRequest.count({ where: { assignedToId: userId, status: OPEN_PQ } }),
    tx.presalesRequest.count({ where: { requestedById: userId, status: OPEN_PS } }).then(async (n) => n + (await tx.pricingRequest.count({ where: { requestedById: userId, status: OPEN_PQ } }))),
    tx.lead.count({ where: { ownerId: userId, deletedAt: null, status: { notIn: ["CONVERTED", "UNQUALIFIED"] } } }),
  ]);
  return { deals, supporting, presales, pricing, requested, leads, total: deals + supporting + presales + pricing + requested + leads };
}

/** Who can take over someone's work: an active person in the same line of work */
function canSucceed(from: string, to: string) {
  const sales = ["SALES", "SALES_HEAD"];
  return from === to || (sales.includes(from) && sales.includes(to));
}

/** Move everything open from one person to another, tell the successor, and record it. */
async function handOver(tx: Tx, from: { id: string; name: string }, to: { id: string; name: string }, by: string) {
  const moved = {
    deals: (await tx.opportunity.updateMany({ where: { ...OPEN_DEAL, salesOwnerId: from.id }, data: { salesOwnerId: to.id, version: { increment: 1 } } })).count,
    presalesDeals: (await tx.opportunity.updateMany({ where: { ...OPEN_DEAL, presalesOwnerId: from.id }, data: { presalesOwnerId: to.id } })).count,
    purchaseDeals: (await tx.opportunity.updateMany({ where: { ...OPEN_DEAL, purchaseOwnerId: from.id }, data: { purchaseOwnerId: to.id } })).count,
    presales: (await tx.presalesRequest.updateMany({ where: { assignedToId: from.id, status: OPEN_PS }, data: { assignedToId: to.id, remindedAt: null, escalatedAt: null } })).count,
    pricing: (await tx.pricingRequest.updateMany({ where: { assignedToId: from.id, status: OPEN_PQ }, data: { assignedToId: to.id, remindedAt: null, escalatedAt: null } })).count,
    requested: (await tx.presalesRequest.updateMany({ where: { requestedById: from.id, status: OPEN_PS }, data: { requestedById: to.id } })).count
      + (await tx.pricingRequest.updateMany({ where: { requestedById: from.id, status: OPEN_PQ }, data: { requestedById: to.id } })).count,
    leads: (await tx.lead.updateMany({ where: { ownerId: from.id, deletedAt: null, status: { notIn: ["CONVERTED", "UNQUALIFIED"] } }, data: { ownerId: to.id } })).count,
  };
  const parts = [
    moved.deals && `${moved.deals} deal${moved.deals > 1 ? "s" : ""}`,
    moved.presales + moved.pricing && `${moved.presales + moved.pricing} open request${moved.presales + moved.pricing > 1 ? "s" : ""}`,
    moved.presalesDeals + moved.purchaseDeals && `${moved.presalesDeals + moved.purchaseDeals} deal${moved.presalesDeals + moved.purchaseDeals > 1 ? "s" : ""} they support`,
    moved.leads && `${moved.leads} lead${moved.leads > 1 ? "s" : ""}`,
  ].filter(Boolean).join(", ");
  await recordEvent(tx, { entityType: "User", entityId: from.id, action: "HANDED_OVER", userId: by, newValue: `To ${to.name}: ${parts || "nothing open"}` });
  if (parts) await notify(tx, [to.id], { type: "ASSIGNMENT", title: `${from.name}'s work handed to you`, body: `${parts} now ${parts.includes(",") ? "are" : "is"} yours. Open My work to see the requests.`, link: "/dashboard" });
  return parts;
}

/** Email a new user a link to choose their own password (when email is set up and no password was given) */
async function sendInvite(user: { id: string; name: string; email: string }) {
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + INVITE_TTL_MS) } });
  return sendMail({
    to: user.email,
    subject: "Your Progression CRM account",
    text: [
      `Hi ${user.name.split(" ")[0]},`,
      "",
      "An account has been created for you on Progression CRM. Open this link within 3 days to choose your password:",
      "",
      `${await linkBase()}/reset-password?token=${token}`,
      "",
      `Then sign in at ${await linkBase()}/login with ${user.email}.`,
    ].join("\n"),
  });
}

/**
 * Create or edit a user. A password set here is temporary: the user must choose their own at next sign-in.
 * Resetting the password, changing the role or deactivating signs the user out everywhere.
 */
export const saveUser = safeAction("saveUser", async function saveUser(id: string | null, input: Record<string, unknown>): Promise<ActionResult<{ invited?: boolean }>> {
  const admin = await requireAdmin();
  const parsed = userSchema.safeParse({ ...input, password: input.password || undefined });
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (v.password) {
    const problems = passwordProblems(v.password, { email: v.email, name: v.name });
    if (problems.length) return { ok: false, error: problems[0]!, fieldErrors: { password: problems[0]! } };
  }
  const dupe = await db.user.findFirst({ where: { email: v.email, ...(id ? { NOT: { id } } : {}) } });
  if (dupe) return { ok: false, error: "A user with this email already exists.", fieldErrors: { email: "Already in use" } };
  if (id) {
    if (id === admin.id && (v.role !== "ADMIN" || v.active === false)) return { ok: false, error: "You cannot remove your own admin access." };
    const before = await db.user.findUniqueOrThrow({ where: { id } });
    const active = v.active ?? before.active;
    const signOut = !!v.password || v.role !== before.role || (before.active && !active);
    // Leaving, or moving to another job, with work still open: it must go to someone, not sit with nobody
    const leaving = (before.active && !active) || v.role !== before.role;
    let successor: { id: string; name: string; role: string } | null = null;
    if (leaving) {
      const work = await openWorkOf(id);
      if (work.total) {
        if (!v.handoverToId) return { ok: false, error: `${before.name} still has open work (${work.total} item${work.total > 1 ? "s" : ""}). Choose who takes it over.`, fieldErrors: { handoverToId: "Choose who takes over" } };
        successor = await db.user.findFirst({ where: { id: v.handoverToId, active: true, NOT: { id } }, select: { id: true, name: true, role: true } });
        if (!successor || !canSucceed(before.role, successor.role)) return { ok: false, error: `Hand over to an active ${before.role === "PRESALES" ? "presales engineer" : before.role === "PURCHASE" ? "purchase person" : "sales person"}.`, fieldErrors: { handoverToId: "Not a suitable person" } };
      }
    }
    const data = {
      name: v.name, email: v.email, role: v.role, title: v.title || null, phone: v.phone || null, active,
      ...(v.password ? { passwordHash: await bcrypt.hash(v.password, BCRYPT_COST), mustChangePassword: id !== admin.id, lockedUntil: null } : {}),
      ...(signOut ? { sessionVersion: { increment: 1 } } : {}),
    };
    let handed = "";
    await db.$transaction(async (tx) => {
      if (successor) handed = await handOver(tx, before, successor, admin.id);
      await tx.user.update({ where: { id }, data });
      await recordChanges(tx, { entityType: "User", entityId: id, before, after: { ...data, sessionVersion: undefined }, fields: ["name", "email", "role", "title", "active"], userId: admin.id });
      if (v.password) await recordEvent(tx, { entityType: "User", entityId: id, action: "PASSWORD_RESET", userId: admin.id });
    });
    revalidatePath("/admin");
    const notes = [signOut && id !== admin.id ? `${v.name} was signed out of all devices.` : "", handed && successor ? `${handed} moved to ${successor.name}.` : ""].filter(Boolean);
    return { ok: true, ...(notes.length ? { warning: notes.join(" ") } : {}) };
  }
  const invite = !v.password;
  if (invite && !(await emailReady())) return { ok: false, error: "Set a temporary password. (Or set up email in Settings → Email to send an invitation link instead.)", fieldErrors: { password: "Required" } };
  const u = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: v.name, email: v.email, role: v.role, title: v.title || null, phone: v.phone || null,
        // Invited users have no usable password until they follow the link
        passwordHash: await bcrypt.hash(v.password ?? randomBytes(24).toString("base64url"), BCRYPT_COST),
        mustChangePassword: !invite,
      },
    });
    await recordEvent(tx, { entityType: "User", entityId: created.id, action: "CREATE", userId: admin.id, newValue: `${created.email} (${created.role})` });
    return created;
  });
  revalidatePath("/admin");
  if (invite) {
    const sent = await sendInvite(u);
    return sent ? { ok: true, data: { invited: true } } : { ok: true, warning: "The user was created but the invitation email could not be sent. Set a temporary password for them instead." };
  }
  return { ok: true };
});

/** Lift a lockout after repeated wrong passwords */
export const unlockUser = safeAction("unlockUser", async function unlockUser(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const u = await db.user.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    db.user.update({ where: { id }, data: { lockedUntil: null } }),
    db.loginAttempt.deleteMany({ where: { email: u.email, ok: false } }),
    db.auditLog.create({ data: { entityType: "User", entityId: id, action: "UNLOCKED", changedById: admin.id } }),
  ]);
  revalidatePath("/admin");
  return { ok: true };
});

const emailInput = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(200),
  port: z.coerce.number().int().min(1, "Port 1–65535").max(65535, "Port 1–65535"),
  security: z.enum(["tls", "starttls", "none"]),
  user: z.string().trim().max(200),
  /** Empty keeps the saved password */
  password: z.string().max(500).optional(),
  clearPassword: z.boolean().optional(),
  fromName: z.string().trim().max(100),
  fromEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  appUrl: z.union([z.literal(""), z.string().trim().regex(/^https?:\/\/[^\s/]+(:\d+)?\/?$/, "Like https://crm.yourcompany.com or http://10.0.0.5")]),
});

type Merged = { error: { error: string; fieldErrors?: Record<string, string> } } | { settings: EmailSettings };
async function mergedEmailSettings(input: unknown): Promise<Merged> {
  const p = emailInput.safeParse(input);
  if (!p.success) return { error: zodErrors(p.error) };
  const v = p.data;
  if (v.enabled && (!v.host || !v.fromEmail)) return { error: { error: "Enter the SMTP server and the From address to turn email on.", fieldErrors: {} } };
  if (v.enabled && !v.appUrl && !process.env.APP_URL) return { error: { error: "Enter the CRM web address so links in emails work.", fieldErrors: { appUrl: "Required" } } };
  const cur = await getEmailSettings();
  const passwordSealed = v.clearPassword ? undefined : v.password ? sealSecret(v.password) : cur.passwordSealed;
  const settings: EmailSettings = { enabled: v.enabled, host: v.host, port: v.port, security: v.security, user: v.user, passwordSealed, fromName: v.fromName, fromEmail: v.fromEmail, appUrl: v.appUrl.replace(/\/$/, "") };
  return { settings };
}

export const saveEmailSettings = safeAction("saveEmailSettings", async function saveEmailSettings(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const m = await mergedEmailSettings(input);
  if ("error" in m) return { ok: false, ...m.error };
  await putEmailSettings(m.settings);
  await db.auditLog.create({ data: { entityType: "Settings", entityId: "email", action: "UPDATE", newValue: m.settings.enabled ? `on · ${m.settings.host}:${m.settings.port}` : "off", changedById: admin.id } });
  revalidatePath("/admin");
  return { ok: true };
});

/** Send a test message with the settings as entered (saved or not) and report the server's answer */
export const sendTestEmail = safeAction("sendTestEmail", async function sendTestEmail(input: unknown, to: string): Promise<ActionResult> {
  await requireAdmin();
  const m = await mergedEmailSettings({ ...(input as object), enabled: true });
  if ("error" in m) return { ok: false, ...m.error };
  const addr = z.string().email().safeParse(to);
  if (!addr.success) return { ok: false, error: "Enter the address to send the test to." };
  try {
    await sendWith(m.settings, { to: addr.data, subject: "Progression CRM test email", text: "Email from Progression CRM is working. Password reset links and invitations will be sent from this address." });
  } catch (e) {
    return { ok: false, error: `The mail server refused: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400) };
  }
  return { ok: true };
});

export const addPicklistValue = safeAction("addPicklistValue", async function addPicklistValue(type: string, value: string): Promise<ActionResult> {
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
});

/**
 * Category "needs presales" (solution vs resale default) and "rate card" (own-brand lines in it take the catalogue's
 * standard cost; today Cloud, NOC and SOC); OEM "runs deal registration" and "own brand" (costed from the rate card or
 * by presales instead of purchase). Both apply to lines added from now on.
 */
export const togglePicklistFlag = safeAction("togglePicklistFlag", async function togglePicklistFlag(kind: "OEM" | "CATEGORY", id: string, flag: string = "dealRegistration"): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (kind === "OEM" && flag !== "dealRegistration" && flag !== "ownBrand") return { ok: false, error: "Unknown flag." };
  if (kind === "CATEGORY" && flag !== "needsPresales" && flag !== "rateCard" && flag !== "dealRegistration") return { ok: false, error: "Unknown flag." };
  if (kind === "OEM") {
    const o = await db.oem.findUniqueOrThrow({ where: { id } });
    if (o.isPlaceholder) return { ok: false, error: "\"To be decided\" is a placeholder and cannot carry flags." };
    if (flag === "ownBrand") await db.oem.update({ where: { id }, data: { ownBrand: !o.ownBrand } });
    else await db.oem.update({ where: { id }, data: { dealRegistration: !o.dealRegistration } });
  } else {
    const c = await db.category.findUniqueOrThrow({ where: { id } });
    if (flag === "rateCard") await db.category.update({ where: { id }, data: { rateCard: !c.rateCard } });
    else await db.category.update({ where: { id }, data: { needsPresales: !c.needsPresales } });
  }
  await db.auditLog.create({ data: { entityType: "Picklist", entityId: id, action: "FLAG", field: kind === "OEM" || flag === "rateCard" ? flag : "needsPresales", changedById: admin.id } });
  revalidatePath("/admin");
  return { ok: true };
});

export const togglePicklistValue = safeAction("togglePicklistValue", async function togglePicklistValue(kind: "OEM" | "CATEGORY" | "VALUE", id: string): Promise<ActionResult> {
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
});

export const saveTargets = safeAction("saveTargets", async function saveTargets(fiscalYear: number, rows: { userId: string; quarter: number; amount: number }[]): Promise<ActionResult> {
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
});

export const runRecompute = safeAction("runRecompute", async function runRecompute(): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();
  const count = await recomputeAll(db);
  revalidatePath("/", "layout");
  return { ok: true, data: { count } };
});

// ───────────── Price approval rules ─────────────

const approvalRuleSchema = z
  .object({
    name: z.string().trim().min(2, "Name the rule").max(80),
    active: z.boolean().default(true),
    gmBelowPct: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(-100).max(100).nullable()),
    rateCardDiscount: z.boolean().default(false),
    minDealValue: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().min(0).max(1e12).nullable()),
    businessUnitIds: z.array(z.string()).max(50).default([]),
    steps: z
      .array(z.object({ kind: z.enum(["OWNER_MANAGER", "ROLE", "USER"]), role: z.enum(["SALES_HEAD", "ADMIN"]).nullish(), userId: z.string().nullish() }))
      .min(1, "Add at least one approver")
      .max(6),
  })
  .refine((r) => r.gmBelowPct !== null || r.rateCardDiscount || r.minDealValue !== null, { path: ["conditions"], message: "Choose at least one condition" })
  .refine((r) => r.steps.every((s) => (s.kind === "ROLE" ? !!s.role : s.kind === "USER" ? !!s.userId : true)), { path: ["steps"], message: "Pick the role or person for each approver" });

/** Create or change a price approval rule. Requests already raised keep the steps they were given. */
export const saveApprovalRule = safeAction("saveApprovalRule", async function saveApprovalRule(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = approvalRuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  // Named approvers see every deal: sales heads and admins only
  const named = v.steps.filter((s) => s.kind === "USER").map((s) => s.userId!);
  if (named.length) {
    const ok = await db.user.count({ where: { id: { in: named }, active: true, role: { in: ["SALES_HEAD", "ADMIN"] } } });
    if (ok !== new Set(named).size) return { ok: false, error: "A named approver must be an active sales head or admin.", fieldErrors: { steps: "Pick a sales head or admin" } };
  }
  if (v.businessUnitIds.length && (await db.businessUnit.count({ where: { id: { in: v.businessUnitIds } } })) !== new Set(v.businessUnitIds).size)
    return { ok: false, error: "A chosen business unit no longer exists." };
  const data = {
    name: v.name, active: v.active, rateCardDiscount: v.rateCardDiscount, businessUnitIds: v.businessUnitIds,
    gmBelowPct: v.gmBelowPct === null ? null : new Prisma.Decimal(v.gmBelowPct), minDealValue: v.minDealValue === null ? null : new Prisma.Decimal(v.minDealValue),
  };
  const steps = v.steps.map((s, i) => ({ position: i, kind: s.kind, role: s.kind === "ROLE" ? s.role! : null, userId: s.kind === "USER" ? s.userId! : null }));
  const saved = await db.$transaction(async (tx) => {
    const r = id
      ? await tx.approvalRule.update({ where: { id }, data: { ...data, steps: { deleteMany: {}, create: steps } } })
      : await tx.approvalRule.create({ data: { ...data, createdById: admin.id, sortOrder: (await tx.approvalRule.count()) + 1, steps: { create: steps } } });
    await recordEvent(tx, { entityType: "ApprovalRule", entityId: r.id, action: id ? "UPDATE" : "CREATE", userId: admin.id, newValue: v.name });
    return r;
  });
  revalidatePath("/admin");
  return { ok: true, data: { id: saved.id } };
});

/** Remove a rule. Requests already raised keep their steps. */
export const deleteApprovalRule = safeAction("deleteApprovalRule", async function deleteApprovalRule(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await db.approvalRule.findUnique({ where: { id }, select: { name: true } });
  if (!r) return { ok: false, error: "Rule not found." };
  await db.$transaction(async (tx) => {
    await tx.approvalRule.delete({ where: { id } });
    await recordEvent(tx, { entityType: "ApprovalRule", entityId: id, action: "DELETE", userId: admin.id, oldValue: r.name });
  });
  revalidatePath("/admin");
  return { ok: true };
});
