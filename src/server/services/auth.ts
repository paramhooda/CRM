import "server-only";
import { db } from "../db";
import { AppError, RateLimited, ValidationError } from "../errors";
import { hashPassword, passwordProblem, verifyPassword } from "../auth/password";
import { createSession, revokeAllSessions, revokeSession } from "../auth/session";
import { recordEvent } from "../audit";
import { ipBlocked, isLocked, lockUntil, windowStart } from "@/domain/rate-limit";

const LOCKED_MESSAGE = "Too many failed sign-ins. The account is locked for 15 minutes.";
const WRONG = "The email or password is not right.";

/** Signs a user in. Wrong email and wrong password look the same from outside; lockouts are per account and per address. */
export async function login(input: { email: string; password: string }, meta: { ip: string | null; userAgent: string | null }) {
  const now = new Date();
  const since = windowStart(now);
  if (meta.ip) {
    const ipFailures = await db.loginAttempt.count({ where: { ip: meta.ip, succeeded: false, attemptedAt: { gte: since } } });
    if (ipBlocked(ipFailures)) throw new RateLimited();
  }
  const user = await db.user.findUnique({ where: { email: input.email }, include: { identities: { where: { provider: "PASSWORD" } } } });
  const record = (succeeded: boolean) => db.loginAttempt.create({ data: { email: input.email, ip: meta.ip, succeeded, attemptedAt: now } });

  if (user && isLocked(user.lockedUntil, now)) {
    await record(false);
    throw new AppError(423, "LOCKED", LOCKED_MESSAGE);
  }
  const good = await verifyPassword(input.password, user?.identities[0]?.passwordHash);
  if (!user || !user.isActive || !good) {
    await record(false);
    if (user) {
      const failures = await db.loginAttempt.count({ where: { email: input.email, succeeded: false, attemptedAt: { gte: since } } });
      const until = lockUntil(failures, now);
      if (until) {
        await db.user.update({ where: { id: user.id }, data: { lockedUntil: until } });
        await recordEvent(db, { entityType: "user", entityId: user.id, action: "LOGIN", userId: null, field: "locked", newValue: until });
        throw new AppError(423, "LOCKED", LOCKED_MESSAGE);
      }
    }
    throw new AppError(401, "BAD_CREDENTIALS", WRONG);
  }
  await record(true);
  const token = await createSession(user.id, meta);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: now, lockedUntil: null } });
  await db.authIdentity.update({ where: { id: user.identities[0]!.id }, data: { lastUsedAt: now } });
  await recordEvent(db, { entityType: "user", entityId: user.id, action: "LOGIN", userId: user.id });
  // Keep the attempts table small
  await db.loginAttempt.deleteMany({ where: { attemptedAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } });
  return { token, mustChangePassword: user.mustChangePassword };
}

export async function logout(token: string | undefined, userId: string) {
  await revokeSession(token);
  await recordEvent(db, { entityType: "user", entityId: userId, action: "LOGOUT", userId });
}

export async function changePassword(userId: string, email: string, input: { currentPassword: string; newPassword: string }, keepToken: string | undefined) {
  const identity = await db.authIdentity.findUnique({ where: { userId_provider: { userId, provider: "PASSWORD" } } });
  if (!identity || !(await verifyPassword(input.currentPassword, identity.passwordHash))) throw new ValidationError("The current password is not right.", { currentPassword: "Not right." });
  const problem = passwordProblem(input.newPassword, email);
  if (problem) throw new ValidationError(problem, { newPassword: problem });
  await db.authIdentity.update({ where: { id: identity.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await db.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
  await revokeAllSessions(userId, keepToken);
  await recordEvent(db, { entityType: "user", entityId: userId, action: "UPDATE", userId, field: "password", newValue: "changed" });
}
