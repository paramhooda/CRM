"use server";
// The signed-in user's own account (change password) and the "forgot password" flow.
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { SESSION_COOKIE, cookieOptions, isSecureRequest, signSession } from "@/lib/session";
import { BCRYPT_COST, passwordProblems } from "@/lib/password";
import { safeAction } from "@/server/action-error";
import { emailReady, linkBase } from "@/server/settings";
import { sendMail } from "@/server/email";
import { clientIp } from "@/server/client-ip";
import type { ActionResult } from "@/lib/validation";

const RESET_TTL_MS = 30 * 60_000;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Re-issue this browser's cookie after the session version moved, so only other devices are signed out */
async function reissue(user: { id: string; role: string; name: string; sessionVersion: number }) {
  const token = await signSession({ sub: user.id, role: user.role, name: user.name, sv: user.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(isSecureRequest(await headers())));
}

export const changePassword = safeAction("changePassword", async function changePassword(input: { current: string; next: string }): Promise<ActionResult> {
  const me = await requireUser();
  const v = z.object({ current: z.string().min(1, "Enter your current password").max(200), next: z.string().max(200) }).safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0]!.message, fieldErrors: { current: v.error.issues[0]!.message } };
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(v.data.current, user.passwordHash))) return { ok: false, error: "Your current password is not correct.", fieldErrors: { current: "Not correct" } };
  const problems = passwordProblems(v.data.next, user);
  if (problems.length) return { ok: false, error: problems[0]!, fieldErrors: { next: problems[0]! } };
  if (await bcrypt.compare(v.data.next, user.passwordHash)) return { ok: false, error: "Choose a password different from your current one.", fieldErrors: { next: "Same as current" } };
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(v.data.next, BCRYPT_COST), mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  await db.auditLog.create({ data: { entityType: "User", entityId: user.id, action: "PASSWORD_CHANGED", changedById: user.id } });
  await reissue(updated);
  return { ok: true };
});

/** Always answers the same way, so it can't be used to find out which emails have accounts. */
export const requestPasswordReset = safeAction("requestPasswordReset", async function requestPasswordReset(emailRaw: string): Promise<ActionResult> {
  const email = z.string().email().max(200).safeParse(String(emailRaw ?? "").trim().toLowerCase());
  if (!email.success) return { ok: false, error: "Enter your work email." };
  if (!(await emailReady())) return { ok: false, error: "Password reset by email is not set up. Ask an administrator to reset your password." };
  const user = await db.user.findUnique({ where: { email: email.data } });
  if (user?.active) {
    const recent = await db.passwordResetToken.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
    if (recent < 3) {
      const token = randomBytes(32).toString("base64url");
      await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
      await db.auditLog.create({ data: { entityType: "User", entityId: user.id, action: "PASSWORD_RESET_REQUESTED", newValue: (await clientIp()) ?? undefined } });
      await sendMail({
        to: user.email,
        subject: "Reset your Progression CRM password",
        text: [
          `Hi ${user.name.split(" ")[0]},`,
          "",
          "Someone (hopefully you) asked to reset your Progression CRM password. Open this link within 30 minutes to choose a new one:",
          "",
          `${await linkBase()}/reset-password?token=${token}`,
          "",
          "If you didn't ask for this, ignore this email; your password stays the same.",
        ].join("\n"),
      });
    }
  }
  return { ok: true };
});

export const resetPassword = safeAction("resetPassword", async function resetPassword(input: { token: string; next: string }): Promise<ActionResult> {
  const token = String(input?.token ?? "");
  const row = token ? await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } }) : null;
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.active) {
    return { ok: false, error: "This reset link has expired or was already used. Ask for a new one from the sign-in page." };
  }
  const problems = passwordProblems(String(input.next ?? ""), row.user);
  if (problems.length) return { ok: false, error: problems[0]!, fieldErrors: { next: problems[0]! } };
  await db.$transaction([
    db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null, NOT: { id: row.id } } }),
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash: await bcrypt.hash(input.next, BCRYPT_COST), mustChangePassword: false, lockedUntil: null, sessionVersion: { increment: 1 } },
    }),
    db.loginAttempt.deleteMany({ where: { email: row.user.email, ok: false } }),
    db.auditLog.create({ data: { entityType: "User", entityId: row.userId, action: "PASSWORD_RESET_BY_EMAIL", changedById: row.userId } }),
  ]);
  return { ok: true };
});
