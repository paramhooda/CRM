// Settings an administrator changes in the app (Admin → Email & system). Read fresh each time (one small row), so a
// change applies at once in every app process.
import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

export const emailSettingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(200),
  port: z.coerce.number().int().min(1).max(65535),
  /** tls: encrypted from the start (usually port 465); starttls: upgrade after connecting (usually 587); none: plain */
  security: z.enum(["tls", "starttls", "none"]),
  user: z.string().trim().max(200),
  /** Encrypted with src/lib/secret-box.ts; never sent to the browser */
  passwordSealed: z.string().max(2000).optional(),
  fromName: z.string().trim().max(100),
  fromEmail: z.string().trim().max(200),
  /** The address people open the CRM at, for links in emails. Never taken from the request (it could be forged). */
  appUrl: z.string().trim().max(200).default(""),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export const EMAIL_DEFAULTS: EmailSettings = { enabled: false, host: "", port: 587, security: "starttls", user: "", fromName: "Progression CRM", fromEmail: "", appUrl: "" };

export async function getEmailSettings(): Promise<EmailSettings> {
  const row = await db.systemSetting.findUnique({ where: { key: "email" } });
  let raw: unknown = {};
  try { raw = row ? JSON.parse(row.value) : {}; } catch { /* unreadable: treat as not set up */ }
  const parsed = emailSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMAIL_DEFAULTS;
}

export async function putEmailSettings(value: EmailSettings) {
  const json = JSON.stringify(value);
  await db.systemSetting.upsert({ where: { key: "email" }, create: { key: "email", value: json }, update: { value: json } });
}

export async function emailReady() {
  const s = await getEmailSettings();
  return s.enabled && !!s.host && !!s.fromEmail && !!(process.env.APP_URL || s.appUrl);
}

/** Base address for links in emails: APP_URL if set, else the one saved with the email settings. */
export async function linkBase() {
  const s = await getEmailSettings();
  return (process.env.APP_URL || s.appUrl || "").replace(/\/$/, "");
}
