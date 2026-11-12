"use server";
import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { SESSION_COOKIE, cookieOptions, isSecureRequest, signSession } from "@/lib/session";
import { LOCKOUT, isLocked, lockAfterFailure, lockedMessage, safeNext } from "@/lib/lockout";
import { clientIp } from "@/server/client-ip";
import { log } from "@/server/log";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password and response
// times don't reveal which accounts exist.
const DUMMY_HASH = "$2b$12$K7ul4kF5z9oJz6tcLUvj9OUoduJy2xzrTC3ky98gpKl0L3YAHcAEC";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const email = parsed.data.email.toLowerCase().trim();
  const ip = await clientIp();
  const now = new Date();
  const since = new Date(now.getTime() - LOCKOUT.windowMs);

  try {
    if (ip) {
      const fromIp = await db.loginAttempt.count({ where: { ip, ok: false, createdAt: { gte: since } } });
      if (fromIp >= LOCKOUT.maxFailuresPerIp) return { error: "Too many failed sign-ins from your network. Wait 15 minutes and try again." };
    }

    const user = await db.user.findUnique({ where: { email } });
    if (user && isLocked(user.lockedUntil, now)) return { error: lockedMessage(user.lockedUntil!) };

    const match = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !match || !user.active) {
      await db.loginAttempt.create({ data: { email, ip, ok: false } });
      if (user) {
        await db.auditLog.create({ data: { entityType: "User", entityId: user.id, action: "LOGIN_FAILED", newValue: ip ?? undefined } });
        const failures = await db.loginAttempt.count({ where: { email, ok: false, createdAt: { gte: since } } });
        const until = lockAfterFailure(failures, now);
        if (until && user.active) {
          await db.user.update({ where: { id: user.id }, data: { lockedUntil: until } });
          await db.auditLog.create({ data: { entityType: "User", entityId: user.id, action: "LOCKED", newValue: `${failures} wrong passwords` } });
          log.warn("account locked", { userId: user.id, failures, ip });
          return { error: lockedMessage(until) };
        }
      }
      return { error: "Invalid email or password." };
    }

    await db.$transaction([
      db.loginAttempt.create({ data: { email, ip, ok: true } }),
      db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - LOCKOUT.keepDays * 86_400_000) } } }),
      db.user.update({ where: { id: user.id }, data: { lastLoginAt: now, lockedUntil: null } }),
      db.auditLog.create({ data: { entityType: "User", entityId: user.id, action: "LOGIN", changedById: user.id, newValue: ip ?? undefined } }),
    ]);
    const token = await signSession({ sub: user.id, role: user.role, name: user.name, sv: user.sessionVersion });
    (await cookies()).set(SESSION_COOKIE, token, cookieOptions(isSecureRequest(await headers())));
    if (user.mustChangePassword) redirect("/account/password");
  } catch (e) {
    unstable_rethrow(e);
    log.error("sign-in failed", { error: e instanceof Error ? e.message : String(e) });
    return { error: "Sign-in is not available right now. Try again in a minute." };
  }
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
