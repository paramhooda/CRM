import { z } from "zod";
import { trimmed } from "./common";

export const LOOKUP_TYPES = ["business-units", "sub-business-units", "oems", "lead-sources", "segments", "industries", "loss-reasons", "document-kinds", "sales-methods"] as const;
export type LookupType = (typeof LOOKUP_TYPES)[number];

export const LOOKUP_LABEL: Record<LookupType, string> = {
  "business-units": "Business units",
  "sub-business-units": "Sub BUs",
  oems: "OEMs",
  "lead-sources": "Lead sources",
  segments: "Customer segments",
  industries: "Industries",
  "loss-reasons": "Loss reasons",
  "document-kinds": "Document kinds",
  "sales-methods": "Sales methods",
};

const base = {
  name: trimmed(80, 1),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
};

/** Extra fields per lookup type. */
export const lookupExtras: Record<LookupType, z.ZodObject<z.ZodRawShape>> = {
  "business-units": z.object({ code: trimmed(8, 2).optional(), colourToken: z.enum(["bu-iti", "bu-cloud", "bu-services", "bu-cyber"]).optional() }),
  "sub-business-units": z.object({ businessUnitId: z.string().uuid().optional(), needsPresales: z.boolean().optional() }),
  oems: z.object({ isOwnIp: z.boolean().optional() }),
  "lead-sources": z.object({}),
  segments: z.object({}),
  industries: z.object({}),
  "loss-reasons": z.object({ appliesTo: z.enum(["LOST", "DROPPED", "BOTH"]).optional() }),
  "document-kinds": z.object({ restrictedToSales: z.boolean().optional(), requiredAtWon: z.boolean().optional() }),
  "sales-methods": z.object({}),
};

export const createLookupSchema = (type: LookupType) => z.object(base).extend(lookupExtras[type].shape);
export const updateLookupSchema = (type: LookupType) => z.object({ ...base, name: base.name.optional() }).extend(lookupExtras[type].shape);

export const productSchema = z.object({
  name: trimmed(160, 2),
  businessUnitId: z.string().uuid(),
  subBusinessUnitId: z.string().uuid(),
  oemId: z.string().uuid(),
  unit: trimmed(20, 1).default("Nos"),
  revenueModel: z.enum(["ONE_TIME", "ARR"]).default("ONE_TIME"),
  defaultTermMonths: z.number().int().min(1).max(120).nullable().optional(),
  listPrice: z.union([z.number(), z.string()]).transform(String).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/)).nullable().optional(),
  standardCost: z.union([z.number(), z.string()]).transform(String).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/)).nullable().optional(),
  hsnSac: z.string().trim().max(10).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;
export const productPatchSchema = productSchema.partial();
