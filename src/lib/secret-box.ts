// Encrypt small secrets stored in the database (e.g. the SMTP password) with AES-256-GCM. The key is derived from
// SESSION_SECRET, so a database backup alone does not reveal them. Changing SESSION_SECRET makes stored secrets
// unreadable; the administrator then re-enters them.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key(secret: string) {
  return Buffer.from(hkdfSync("sha256", secret, "progression-crm", "app-settings-v1", 32));
}

export function sealSecret(plain: string, secret = process.env.SESSION_SECRET ?? ""): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** The secret, or null if it can't be read (tampered, or SESSION_SECRET changed). */
export function openSecret(sealed: string, secret = process.env.SESSION_SECRET ?? ""): string | null {
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || body === undefined) return null;
    const d = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
