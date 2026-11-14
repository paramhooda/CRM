import { z } from "zod";
import { email, gstin, optionalText, pincode, trimmed } from "./common";

/** Admin-set configuration, one JSON value per key. Secrets (`password`, `apiKey`) are write-only over the API. */
export const SETTING_KEYS = ["company", "mail", "alerts", "ai"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const companySchema = z.object({
  name: trimmed(120),
  addressLine: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  pincode: pincode.nullable().optional().or(z.literal("").transform(() => null)),
  gstin: gstin.nullable().optional().or(z.literal("").transform(() => null)),
  phone: optionalText(40),
  email: email.nullable().optional().or(z.literal("").transform(() => null)),
  website: optionalText(120),
  /** Printed under the lines of every quote: validity, delivery, payment terms. */
  quoteTerms: optionalText(2000),
});

export const mailSchema = z.object({
  host: optionalText(200),
  port: z.number().int().min(1).max(65535).default(587),
  /** TLS from the first byte (465); otherwise STARTTLS is used when the server offers it. */
  secure: z.boolean().default(false),
  user: optionalText(200),
  /** Write-only: omitted keeps the stored password, an empty string clears it. */
  password: z.string().max(500).optional(),
});

/** Every alert starts off; the owner switches on what matches the process. */
export const alertsSchema = z.object({
  /** Home tiles and BU rows turn amber when expected GM is below this; null = off. */
  gmAmberBelowPct: z.number().min(0).max(100).nullable().default(null),
  /** Pipeline review flags a deal with no change for this many days; null = off. */
  quietDays: z.number().int().min(1).max(365).nullable().default(null),
  stuck: z.boolean().default(false),
  closeDatePassed: z.boolean().default(false),
  commitWithoutProposal: z.boolean().default(false),
  noNextStep: z.boolean().default(false),
});

export const aiSchema = z.object({
  /** Write-only: omitted keeps the stored key, an empty string clears it. */
  apiKey: z.string().max(300).optional(),
  model: trimmed(80).default("gpt-4o-mini"),
});

export const SETTING_SCHEMAS = { company: companySchema, mail: mailSchema, alerts: alertsSchema, ai: aiSchema } as const;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
export type AlertConfig = z.infer<typeof alertsSchema>;

export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  company: { name: "Progression", addressLine: null, city: null, state: null, pincode: null, gstin: null, phone: null, email: null, website: null, quoteTerms: "Prices are in INR and exclusive of GST, which is extra as applicable. Delivery and payment terms as agreed." },
  mail: { host: null, port: 587, secure: false, user: null },
  alerts: { gmAmberBelowPct: null, quietDays: null, stuck: false, closeDatePassed: false, commitWithoutProposal: false, noNextStep: false },
  ai: { model: "gpt-4o-mini" },
};

/** Which fields of a key are secrets: never returned, redacted in the audit log. */
export const SECRET_FIELDS: Partial<Record<SettingKey, string[]>> = { mail: ["password"], ai: ["apiKey"] };
