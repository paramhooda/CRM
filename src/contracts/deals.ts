import { z } from "zod";
import { boolish, isoDate, nonNegativeMoney, optionalText, optionalUuid, trimmed, uuid } from "./common";

export const FORECASTS = ["COMMIT", "UPSIDE", "PIPELINE"] as const;
export const STAGES = ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD", "CLOSED_WON", "CLOSED_LOST", "DROPPED"] as const;

const quantity = z.union([z.number(), z.string()]).transform(String).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a quantity.")).refine((v) => Number(v) > 0, "Quantity must be more than zero.");

export const lineInputSchema = z.object({
  id: uuid.optional(),
  productId: optionalUuid,
  description: trimmed(300, 1).optional().default(""),
  businessUnitId: uuid.optional(),
  subBusinessUnitId: uuid.optional(),
  oemId: uuid.optional(),
  quantity: quantity.optional(),
  unit: trimmed(20, 1).optional(),
  revenueModel: z.enum(["ONE_TIME", "ARR"]).optional(),
  termMonths: z.number().int().min(1).max(120).nullable().optional(),
  unitSalesPrice: nonNegativeMoney.nullable().optional(),
  unitPurchaseCost: nonNegativeMoney.nullable().optional(),
  salesMethodId: optionalUuid,
});
export type LineInput = z.infer<typeof lineInputSchema>;

export const createDealSchema = z.object({
  name: trimmed(160, 3),
  accountId: uuid,
  primaryContactId: optionalUuid,
  ownerId: optionalUuid,
  expectedCloseDate: isoDate,
  forecastCategory: z.enum(FORECASTS).default("PIPELINE"),
  needsPresales: z.boolean().optional(),
  leadSourceId: optionalUuid,
  description: optionalText(4000),
  nextStep: optionalText(300),
  nextStepDate: isoDate.nullable().optional(),
  lines: z.array(lineInputSchema).max(50).optional(),
});
export type CreateDealInput = z.infer<typeof createDealSchema>;

export const patchDealSchema = z.object({
  version: z.number().int().min(1),
  name: trimmed(160, 3).optional(),
  primaryContactId: optionalUuid,
  expectedCloseDate: isoDate.optional(),
  forecastCategory: z.enum(FORECASTS).optional(),
  needsPresales: z.boolean().optional(),
  leadSourceId: optionalUuid,
  description: optionalText(4000),
  nextStep: optionalText(300),
  nextStepDate: isoDate.nullable().optional(),
});
export type PatchDealInput = z.infer<typeof patchDealSchema>;

export const linesPatchSchema = z.object({
  version: z.number().int().min(1),
  upserts: z.array(lineInputSchema).max(50).default([]),
  deleteIds: z.array(uuid).max(50).default([]),
});
export type LinesPatchInput = z.infer<typeof linesPatchSchema>;

export const reassignSchema = z.object({ ownerId: uuid.optional(), presalesOwnerId: uuid.nullable().optional() });

export const dealListQuery = z.object({
  stage: z.union([z.enum(STAGES), z.array(z.enum(STAGES))]).optional(),
  bu: uuid.optional(),
  sub_bu: uuid.optional(),
  oem: uuid.optional(),
  owner: uuid.optional(),
  forecast: z.enum(FORECASTS).optional(),
  period: z.string().max(40).optional(),
  q: z.string().trim().max(100).optional(),
  account_id: uuid.optional(),
  open: boolish.optional(),
  includeDeleted: boolish.optional(),
});
export type DealListQuery = z.infer<typeof dealListQuery>;
