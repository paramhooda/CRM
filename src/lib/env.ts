// Start-up configuration check (pure, unit-tested). The server refuses to start with a clear message instead of
// failing later in confusing ways, e.g. everyone silently signed out because the session secret is missing.

/** Placeholders shipped in examples. A secret equal to one of these would let anyone forge a session. */
const PLACEHOLDER_SECRETS = ["replace-with-a-long-random-string", "change-me", "changeme", "secret"];
export const EXAMPLE_SECRET_HINT = "generate-with: openssl rand -base64 48";

export type EnvCheck = { errors: string[]; warnings: string[] };

export function checkEnv(env: Record<string, string | undefined>): EnvCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const secret = env.SESSION_SECRET ?? "";
  if (!secret) errors.push("SESSION_SECRET is not set. Generate one with: openssl rand -base64 48");
  else if (PLACEHOLDER_SECRETS.includes(secret) || secret.includes("generate-with")) errors.push("SESSION_SECRET is still the example value. Generate one with: openssl rand -base64 48");
  else if (secret.length < 32) errors.push(`SESSION_SECRET is ${secret.length} characters; it needs at least 32. Generate one with: openssl rand -base64 48`);
  else if (new Set(secret).size < 10) errors.push("SESSION_SECRET is too repetitive. Generate one with: openssl rand -base64 48");

  const url = env.DATABASE_URL ?? "";
  if (!url) errors.push("DATABASE_URL is not set.");
  else if (!/^postgres(ql)?:\/\//.test(url)) errors.push("DATABASE_URL must start with postgresql://");

  const cookie = (env.COOKIE_SECURE ?? "auto").toLowerCase();
  if (!["auto", "true", "false"].includes(cookie)) errors.push(`COOKIE_SECURE must be auto, true or false (got "${env.COOKIE_SECURE}").`);
  const proxy = (env.TRUST_PROXY ?? "false").toLowerCase();
  if (!["true", "false"].includes(proxy)) errors.push(`TRUST_PROXY must be true or false (got "${env.TRUST_PROXY}").`);
  if (env.APP_URL && !/^https?:\/\/[^/]+/.test(env.APP_URL)) errors.push(`APP_URL must look like https://crm.example.com (got "${env.APP_URL}").`);

  if (env.NODE_ENV === "production" && env.DEMO_LOGINS === "true") {
    warnings.push("DEMO_LOGINS is on: the sign-in page lists demo users. Turn it off for real use.");
  }
  return { errors, warnings };
}

