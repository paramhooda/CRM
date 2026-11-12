import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { checkEnv } from "@/lib/env";
import { passwordProblems } from "@/lib/password";
import { LOCKOUT, isLocked, lockAfterFailure, safeNext } from "@/lib/lockout";
import { sealSecret, openSecret } from "@/lib/secret-box";
import { isSecureRequest, signSession, verifySession } from "@/lib/session";
// @ts-expect-error plain ESM script without types
import { destructiveProblems } from "../../scripts/check-migrations.mjs";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

const SECRET = "test-Zq8vN3xK7pR2mW9tY4bH6jL1cF5gD0sA";
const env = (over: Record<string, string | undefined> = {}) => ({ SESSION_SECRET: SECRET, DATABASE_URL: "postgresql://x@y/z", ...over });

describe("start-up configuration check", () => {
  it("accepts a sound configuration", () => expect(checkEnv(env()).errors).toEqual([]));
  it("refuses a missing, short, example or repetitive session secret", () => {
    expect(checkEnv(env({ SESSION_SECRET: undefined })).errors[0]).toMatch(/not set/);
    expect(checkEnv(env({ SESSION_SECRET: "short" })).errors[0]).toMatch(/at least 32/);
    expect(checkEnv(env({ SESSION_SECRET: "replace-with-a-long-random-string" })).errors[0]).toMatch(/example value/);
    expect(checkEnv(env({ SESSION_SECRET: "generate-with: openssl rand -base64 48" })).errors[0]).toMatch(/example value/);
    expect(checkEnv(env({ SESSION_SECRET: "a".repeat(40) })).errors[0]).toMatch(/repetitive/);
  });
  it("checks the database URL and switches", () => {
    expect(checkEnv(env({ DATABASE_URL: "mysql://x" })).errors[0]).toMatch(/postgresql/);
    expect(checkEnv(env({ COOKIE_SECURE: "yes" })).errors[0]).toMatch(/COOKIE_SECURE/);
    expect(checkEnv(env({ TRUST_PROXY: "1" })).errors[0]).toMatch(/TRUST_PROXY/);
    expect(checkEnv(env({ APP_URL: "crm.example.com" })).errors[0]).toMatch(/APP_URL/);
  });
  it("warns about demo sign-in in production", () => {
    expect(checkEnv(env({ NODE_ENV: "production", DEMO_LOGINS: "true" })).warnings).toHaveLength(1);
  });
});

describe("password rules", () => {
  it("accepts a strong password", () => expect(passwordProblems("Blue-Ganesh-2049")).toEqual([]));
  it("names each missing requirement", () => {
    expect(passwordProblems("short1A")).toContain("Use at least 10 characters.");
    expect(passwordProblems("alllowercase1")).toContain("Include an uppercase letter.");
    expect(passwordProblems("ALLUPPERCASE1")).toContain("Include a lowercase letter.");
    expect(passwordProblems("NoDigitsHere")).toContain("Include a number.");
  });
  it("rejects common passwords and the user's own name or email", () => {
    expect(passwordProblems("Progression@123")).toContain("This password is too common. Choose another.");
    expect(passwordProblems("Rakesh-Secure-9", { email: "rakesh.pawar@x.com", name: "Rakesh Pawar" }).length).toBeGreaterThan(0);
  });
  it("caps length at bcrypt's 72 bytes", () => expect(passwordProblems("Aa1" + "x".repeat(80))).toContain("Use at most 72 characters."));
});

describe("sign-in lockout", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  it("locks on the tenth failure, for 15 minutes", () => {
    expect(lockAfterFailure(LOCKOUT.maxFailures - 1, now)).toBeNull();
    expect(lockAfterFailure(LOCKOUT.maxFailures, now)?.getTime()).toBe(now.getTime() + 15 * 60_000);
  });
  it("is locked only until the time passes", () => {
    expect(isLocked(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLocked(new Date(now.getTime() - 1000), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
  it("only follows links back into the CRM after sign-in", () => {
    expect(safeNext("/opportunities/abc?tab=boq")).toBe("/opportunities/abc?tab=boq");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, "/x\r\nSet-Cookie: a"]) expect(safeNext(bad)).toBe("/dashboard");
  });
});

describe("sessions", () => {
  it("carry the session version, so a password change signs other devices out", async () => {
    process.env.SESSION_SECRET = SECRET;
    const token = await signSession({ sub: "u1", role: "SALES", name: "A", sv: 3 });
    expect((await verifySession(token))?.sv).toBe(3);
    expect(await verifySession(token + "x")).toBeNull();
  });
  it("mark cookies Secure automatically when opened over HTTPS", () => {
    const h = (proto?: string) => ({ get: (n: string) => (n === "x-forwarded-proto" ? proto ?? null : null) });
    expect(isSecureRequest(h("https"), {})).toBe(true);
    expect(isSecureRequest(h("http"), {})).toBe(false);
    expect(isSecureRequest(h(), {})).toBe(false);
    expect(isSecureRequest(h(), { APP_URL: "https://crm.example.com" })).toBe(true);
    expect(isSecureRequest(h("https"), { COOKIE_SECURE: "false" })).toBe(false);
    expect(isSecureRequest(h("http"), { COOKIE_SECURE: "true" })).toBe(true);
  });
});

describe("stored secrets", () => {
  it("round-trip, and can't be read with another key or after tampering", () => {
    const sealed = sealSecret("smtp-pass", SECRET);
    expect(sealed).not.toContain("smtp-pass");
    expect(openSecret(sealed, SECRET)).toBe("smtp-pass");
    expect(openSecret(sealed, SECRET + "x")).toBeNull();
    expect(openSecret(sealed.slice(0, -2) + "AA", SECRET)).toBeNull();
    expect(openSecret("garbage", SECRET)).toBeNull();
  });
});

describe("error messages", () => {
  it("turn database conditions into plain language", async () => {
    const { knownErrorMessage, toActionError } = await import("@/server/action-error");
    const { UserError } = await import("@/server/domain/errors");
    const known = (code: string) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6" });
    expect(knownErrorMessage(new UserError("Do X first."))).toBe("Do X first.");
    expect(knownErrorMessage(known("P2002"))).toMatch(/already exists/);
    expect(knownErrorMessage(known("P2025"))).toMatch(/changed or removed by someone else/);
    expect(knownErrorMessage(known("P2034"))).toMatch(/busy/);
    expect(knownErrorMessage(new Error("boom"))).toBeNull();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = toActionError(new Error("boom"), "test");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/reference: [A-Z0-9]{6}/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("migration safety check", () => {
  it("flags data-losing SQL", () => {
    expect(destructiveProblems('ALTER TABLE "User" DROP COLUMN "x";')).toEqual(["drops a column"]);
    expect(destructiveProblems('ALTER TABLE "A" RENAME COLUMN "a" TO "b";')).toHaveLength(1);
    expect(destructiveProblems('ALTER TABLE "A" ALTER COLUMN "a" SET DATA TYPE INTEGER;')).toHaveLength(1);
    expect(destructiveProblems('DROP TABLE "A";')).toEqual(["drops a table"]);
  });
  it("allows additive SQL, comments, and explicitly intended drops", () => {
    expect(destructiveProblems('ALTER TABLE "A" ADD COLUMN "b" INTEGER NOT NULL DEFAULT 0;\nCREATE TABLE "C" ("id" TEXT);')).toEqual([]);
    expect(destructiveProblems('-- we never DROP TABLE here\nSELECT 1;')).toEqual([]);
    expect(destructiveProblems('-- destructive-ok: column unused since 1.3\nALTER TABLE "A" DROP COLUMN "old";')).toEqual([]);
  });
});
