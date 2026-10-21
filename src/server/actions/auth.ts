"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/session";

// Simple in-process throttle against password guessing: 8 failures per email+ip per 10 minutes.
const failures = new Map<string, { count: number; until: number }>();
const WINDOW = 10 * 60_000;

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const email = parsed.data.email.toLowerCase().trim();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${email}|${ip}`;
  const f = failures.get(key);
  if (f && f.count >= 8 && f.until > Date.now()) {
    return { error: "Too many failed attempts. Try again in a few minutes." };
  }

  const user = await db.user.findUnique({ where: { email } });
  const ok = user && user.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok || !user) {
    const cur = f && f.until > Date.now() ? f : { count: 0, until: Date.now() + WINDOW };
    failures.set(key, { count: cur.count + 1, until: cur.until });
    return { error: "Invalid email or password." };
  }
  failures.delete(key);

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({ data: { entityType: "User", entityId: user.id, action: "LOGIN", changedById: user.id } });
  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions());

  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
