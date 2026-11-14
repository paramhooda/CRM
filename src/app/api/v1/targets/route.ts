import { z } from "zod";
import { handle } from "@/server/http";
import { targetRowsSchema } from "@/contracts/users";
import { listTargets, setTargets } from "@/server/services/users";
import { fiscalYearOf } from "@/domain/fiscal";

export const GET = handle({
  roles: ["ADMIN", "SALES_HEAD", "SALES"], query: z.object({ fiscal_year: z.coerce.number().int().min(2020).max(2100).optional() }),
  fn: ({ actor, query }) => listTargets(actor, query.fiscal_year ?? fiscalYearOf(new Date())),
});
export const PUT = handle({
  roles: ["ADMIN", "SALES_HEAD"], body: targetRowsSchema,
  fn: async ({ actor, body, requestId }) => { await setTargets(actor, body.rows, requestId); return { ok: true }; },
});
