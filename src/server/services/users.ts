import "server-only";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, NotFound, ValidationError } from "../errors";
import { hashPassword, passwordProblem } from "../auth/password";
import { revokeAllSessions } from "../auth/session";
import { recordChanges, recordEvent } from "../audit";
import { assertPermission, visibleOwnerIds } from "../authz/scope";
import type { CreateUserInput, UpdateUserInput } from "@/contracts/users";
import { teamUserIds } from "@/domain/scope";

const directorySelect = { id: true, fullName: true, email: true, role: true, title: true, managerId: true, isActive: true } as const;

/** Everyone, for pickers and the admin screen. Only admins see inactive people and lock state. */
export async function listUsers(actor: Actor, includeInactive: boolean) {
  const admin = actor.role === "ADMIN";
  const rows = await db.user.findMany({
    where: admin && includeInactive ? {} : { isActive: true },
    select: { ...directorySelect, ...(admin ? { lockedUntil: true, lastLoginAt: true, mustChangePassword: true, createdAt: true } : {}) },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });
  return { rows };
}

export async function createUser(actor: Actor, input: CreateUserInput, requestId: string) {
  assertPermission(actor, "users.manage");
  const problem = passwordProblem(input.temporaryPassword, input.email);
  if (problem) throw new ValidationError(problem, { temporaryPassword: problem });
  if (await db.user.findUnique({ where: { email: input.email } })) throw new Conflict("Someone already has that email.", "DUPLICATE_EMAIL");
  if (input.managerId) await assertManager(input.managerId);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { fullName: input.fullName, email: input.email, role: input.role, managerId: input.managerId ?? null, title: input.title ?? null, mustChangePassword: true },
      select: directorySelect,
    });
    await tx.authIdentity.create({ data: { userId: u.id, provider: "PASSWORD", providerSubject: input.email, passwordHash: await hashPassword(input.temporaryPassword) } });
    await recordEvent(tx, { entityType: "user", entityId: u.id, action: "CREATE", userId: actor.id, requestId, newValue: `${u.fullName} (${u.role})` });
    return u;
  });
  return user;
}

export async function updateUser(actor: Actor, id: string, input: UpdateUserInput, requestId: string) {
  assertPermission(actor, "users.manage");
  const before = await db.user.findUnique({ where: { id }, select: directorySelect });
  if (!before) throw new NotFound();
  if (input.managerId) {
    if (input.managerId === id) throw new ValidationError("Someone can't report to themselves.", { managerId: "Pick someone else." });
    await assertManager(input.managerId);
    const users = await db.user.findMany({ select: { id: true, role: true, managerId: true } });
    if (teamUserIds(users, id).includes(input.managerId)) throw new ValidationError("That would make a reporting loop.", { managerId: "Reports to this person already." });
  }
  if (input.isActive === false && id === actor.id) throw new ValidationError("You can't deactivate yourself.");
  const after = await db.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: { fullName: input.fullName, role: input.role, managerId: input.managerId === undefined ? undefined : input.managerId, title: input.title === undefined ? undefined : input.title, isActive: input.isActive },
      select: directorySelect,
    });
    await recordChanges(tx, { entityType: "user", entityId: id, userId: actor.id, requestId, before, after: u, fields: ["fullName", "role", "managerId", "title", "isActive"] });
    return u;
  });
  if ((input.role && input.role !== before.role) || input.isActive === false) await revokeAllSessions(id);
  return after;
}

export async function resetPassword(actor: Actor, id: string, temporaryPassword: string, requestId: string) {
  assertPermission(actor, "users.manage");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new NotFound();
  const problem = passwordProblem(temporaryPassword, user.email);
  if (problem) throw new ValidationError(problem, { temporaryPassword: problem });
  await db.authIdentity.upsert({
    where: { userId_provider: { userId: id, provider: "PASSWORD" } },
    create: { userId: id, provider: "PASSWORD", providerSubject: user.email, passwordHash: await hashPassword(temporaryPassword) },
    update: { passwordHash: await hashPassword(temporaryPassword) },
  });
  await db.user.update({ where: { id }, data: { mustChangePassword: true, lockedUntil: null } });
  await revokeAllSessions(id);
  await recordEvent(db, { entityType: "user", entityId: id, action: "UPDATE", userId: actor.id, requestId, field: "password", newValue: "reset by admin" });
}

export async function unlockUser(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "users.manage");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new NotFound();
  await db.user.update({ where: { id }, data: { lockedUntil: null } });
  await db.loginAttempt.deleteMany({ where: { email: user.email, succeeded: false } });
  await recordEvent(db, { entityType: "user", entityId: id, action: "UPDATE", userId: actor.id, requestId, field: "locked", oldValue: user.lockedUntil, newValue: null });
}

async function assertManager(managerId: string) {
  const m = await db.user.findUnique({ where: { id: managerId } });
  if (!m || !m.isActive || (m.role !== "SALES_HEAD" && m.role !== "ADMIN")) throw new ValidationError("A manager must be an active Sales Head or Admin.", { managerId: "Pick a Sales Head." });
}

// ── Targets ──

export async function listTargets(actor: Actor, fiscalYear: number) {
  assertPermission(actor, "targets.view");
  const ids = await visibleOwnerIds(actor);
  const rows = await db.salesTarget.findMany({
    where: { fiscalYear, ...(ids === null ? {} : { userId: { in: ids } }), user: { role: "SALES" } },
    select: { userId: true, fiscalYear: true, quarter: true, targetValue: true, user: { select: { fullName: true } } },
    orderBy: [{ user: { fullName: "asc" } }, { quarter: "asc" }],
  });
  return { rows: rows.map((r) => ({ userId: r.userId, userName: r.user.fullName, fiscalYear: r.fiscalYear, quarter: r.quarter, targetValue: r.targetValue.toString() })) };
}

export async function setTargets(actor: Actor, rows: { userId: string; fiscalYear: number; quarter: number; targetValue: string }[], requestId: string) {
  assertPermission(actor, "targets.set");
  const ids = await visibleOwnerIds(actor);
  for (const r of rows) if (ids !== null && !ids.includes(r.userId)) throw new NotFound("That person is not in your team.");
  await db.$transaction(async (tx) => {
    for (const r of rows) {
      const before = await tx.salesTarget.findUnique({ where: { userId_fiscalYear_quarter: { userId: r.userId, fiscalYear: r.fiscalYear, quarter: r.quarter } } });
      const row = await tx.salesTarget.upsert({
        where: { userId_fiscalYear_quarter: { userId: r.userId, fiscalYear: r.fiscalYear, quarter: r.quarter } },
        create: { userId: r.userId, fiscalYear: r.fiscalYear, quarter: r.quarter, targetValue: r.targetValue },
        update: { targetValue: r.targetValue },
      });
      if (!before || before.targetValue.toString() !== row.targetValue.toString())
        await recordEvent(tx, { entityType: "sales_target", entityId: row.id, action: before ? "UPDATE" : "CREATE", userId: actor.id, requestId, field: `FY${r.fiscalYear} Q${r.quarter}`, oldValue: before?.targetValue, newValue: row.targetValue });
    }
  });
}
