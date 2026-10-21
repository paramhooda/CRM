// Stateless signed session (HS256 JWT in an HttpOnly cookie). Edge-safe: used by middleware and server.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "crm_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 10; // 10 hours, one working day

export type SessionPayload = { sub: string; role: string; name: string };

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer("progression-crm")
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: "progression-crm", algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: String(payload.role), name: String(payload.name) };
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
