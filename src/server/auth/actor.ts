import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { resolveSession, SESSION_COOKIE, type SessionUser } from "./session";
import { Unauthorized } from "../errors";

export type Actor = SessionUser;

/** The signed-in user for this request, or null. Resolved once per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
});

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new Unauthorized();
  return a;
}
