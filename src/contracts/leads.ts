import { z } from "zod";
import { boolish, email, isoDate, nonNegativeMoney, optionalText, optionalUuid, trimmed, uuid } from "./common";
import { accountSchema } from "./accounts";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED"] as const;

export const leadSchema = z.object({
  companyName: trimmed(160, 2),
  contactName: trimmed(120, 2),
  contactEmail: email.nullable().optional().or(z.literal("").transform(() => null)),
  contactPhone: optionalText(30),
  designation: optionalText(120),
  leadSourceId: uuid,
  industryId: optionalUuid,
  segmentId: optionalUuid,
  businessUnitId: optionalUuid,
  estimatedValue: nonNegativeMoney.nullable().optional(),
  notes: optionalText(4000),
  ownerId: optionalUuid,
});
export type LeadInput = z.infer<typeof leadSchema>;

export const leadPatchSchema = leadSchema.partial().extend({ status: z.enum(["NEW", "CONTACTED", "QUALIFIED"]).optional() });

export const disqualifySchema = z.object({ reason: trimmed(500, 3) });

export const convertLeadSchema = z.object({
  account: z.union([z.object({ existingId: uuid }), z.object({ create: accountSchema })]),
  contact: z.union([z.object({ existingId: uuid }), z.object({ create: z.object({ firstName: trimmed(80, 1), lastName: trimmed(80, 1), email: email.nullable().optional().or(z.literal("").transform(() => null)), phone: optionalText(30), designation: optionalText(120) }) })]),
  deal: z.object({
    name: trimmed(160, 3),
    expectedCloseDate: isoDate,
    forecastCategory: z.enum(["COMMIT", "UPSIDE", "PIPELINE"]).default("PIPELINE"),
    needsPresales: z.boolean().optional(),
    description: optionalText(4000),
  }),
});
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;

export const leadListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: uuid.optional(),
  owner: uuid.optional(),
  includeDeleted: boolish.optional(),
});
