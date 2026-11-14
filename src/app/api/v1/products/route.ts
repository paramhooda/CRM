import { z } from "zod";
import { handle } from "@/server/http";
import { listProducts } from "@/server/services/products";
import { boolish } from "@/contracts/common";

export const GET = handle({
  query: z.object({ q: z.string().max(100).optional(), bu: z.string().uuid().optional(), sub_bu: z.string().uuid().optional(), oem: z.string().uuid().optional(), includeInactive: boolish.optional(), includeDeleted: boolish.optional() }),
  fn: ({ actor, query }) => listProducts(actor, { q: query.q, businessUnitId: query.bu, subBusinessUnitId: query.sub_bu, oemId: query.oem, includeInactive: query.includeInactive, includeDeleted: query.includeDeleted }),
});
