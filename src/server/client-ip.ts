import "server-only";
import { headers } from "next/headers";

/**
 * The browser's address, for sign-in limits and the audit trail. Only trusted when a reverse proxy we control sets
 * it (TRUST_PROXY=true, e.g. the optional HTTPS proxy); otherwise anyone could fake it, so it is ignored.
 */
export async function clientIp(): Promise<string | null> {
  if ((process.env.TRUST_PROXY ?? "false").toLowerCase() !== "true") return null;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",").pop()?.trim() || h.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : null;
}
