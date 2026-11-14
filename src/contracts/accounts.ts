import { z } from "zod";
import { boolish, email, gstin, optionalText, optionalUuid, pincode, trimmed } from "./common";

export const accountSchema = z.object({
  name: trimmed(160, 2),
  gstin: gstin.nullable().optional().or(z.literal("").transform(() => null)),
  industryId: optionalUuid,
  segmentId: optionalUuid,
  website: optionalText(200),
  phone: optionalText(30),
  addressLine: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  pincode: pincode.nullable().optional().or(z.literal("").transform(() => null)),
  ownerId: optionalUuid,
  notes: optionalText(2000),
});
export type AccountInput = z.infer<typeof accountSchema>;
export const accountPatchSchema = accountSchema.partial();

export const accountListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  industry: z.string().uuid().optional(),
  segment: z.string().uuid().optional(),
  owner: z.string().uuid().optional(),
  includeDeleted: boolish.optional(),
});

export const contactSchema = z.object({
  accountId: z.string().uuid(),
  firstName: trimmed(80, 1),
  lastName: trimmed(80, 1),
  email: email.nullable().optional().or(z.literal("").transform(() => null)),
  phone: optionalText(30),
  mobile: optionalText(30),
  designation: optionalText(120),
  department: optionalText(120),
  isPrimary: z.boolean().optional(),
  notes: optionalText(2000),
});
export type ContactInput = z.infer<typeof contactSchema>;
export const contactPatchSchema = contactSchema.partial().omit({ accountId: true });

export const contactListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  account_id: z.string().uuid().optional(),
  includeDeleted: boolish.optional(),
});
