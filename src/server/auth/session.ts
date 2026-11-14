import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";

export const SESSION_COOKIE = "crm_session";
const IDLE_HOURS = 12;
const ABSOLUTE_HOURS = 72;
const SLIDE_EVERY_MIN = 15;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function cookieOptions() {
  const secure = process.env.COOKIE_SECURE === "true";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: ABSOLUTE_HOURS * 3600 };
}

/** Starts a session and returns the cookie token (never stored; only its hash is). */
export async function createSession(userId: string, meta: { ip: string | null; userAgent: string | null }): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.session.create({
    data: {
      tokenHash: hash(token),
      userId,
      expiresAt: new Date(now.getTime() + IDLE_HOURS * 3600_000),
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_HOURS * 3600_000),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return token;
}

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  role: "ADMIN" | "SALES_HEAD" | "SALES" | "PRESALES" | "PURCHASE";
  managerId: string | null;
  mustChangePassword: boolean;
};

/** The user behind a cookie token, if the session is live; slides the idle expiry at most every 15 minutes. */
export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const now = new Date();
  const s = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: { id: true, fullName: true, email: true, role: true, managerId: true, mustChangePassword: true, isActive: true } } },
  });
  if (!s || s.revokedAt || s.expiresAt < now || s.absoluteExpiresAt < now || !s.user.isActive) return null;
  if (now.getTime() - s.lastSeenAt.getTime() > SLIDE_EVERY_MIN * 60_000) {
    const idle = new Date(now.getTime() + IDLE_HOURS * 3600_000);
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: now, expiresAt: idle < s.absoluteExpiresAt ? idle : s.absoluteExpiresAt } });
  }
  const { isActive: _ignored, ...user } = s.user;
  return user;
}

export async function revokeSession(token: string | undefined) {
  if (!token) return;
  await db.session.updateMany({ where: { tokenHash: hash(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Signs the user out everywhere (password or role change, deactivation). */
export async function revokeAllSessions(userId: string, exceptToken?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptToken ? { NOT: { tokenHash: hash(exceptToken) } } : {}) },
    data: { revokedAt: new Date() },
  });
}
