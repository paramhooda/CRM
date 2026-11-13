import { z } from "zod";

export const uuid = z.string().uuid("Not a valid id.");
export const optionalUuid = uuid.nullable().optional();
/** A date as yyyy-mm-dd */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.");
export const money = z.union([z.number(), z.string()]).transform((v) => String(v)).pipe(z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Enter an amount with at most two decimals."));
export const nonNegativeMoney = money.refine((v) => !v.startsWith("-"), "Can't be negative.");
export const trimmed = (max: number, min = 0) => z.string().trim().min(min, min ? "Required." : undefined).max(max, `At most ${max} characters.`);
export const optionalText = (max: number) => z.string().trim().max(max, `At most ${max} characters.`).nullable().optional().transform((v) => (v === "" ? null : v ?? null));
export const boolish = z.union([z.boolean(), z.enum(["true", "false"])]).transform((v) => v === true || v === "true");

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const gstin = z.string().trim().toUpperCase().regex(GSTIN_RE, "Not a valid GSTIN (15 characters, e.g. 27AAACK4019X1Z2).");
export const pincode = z.string().trim().regex(/^\d{6}$/, "A pincode has 6 digits.");
export const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
