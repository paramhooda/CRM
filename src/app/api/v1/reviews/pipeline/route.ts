import { z } from "zod";
import { handle } from "@/server/http";
import { pipelineReview } from "@/server/services/reviews";

export const GET = handle({
  roles: ["ADMIN", "SALES_HEAD", "SALES"],
  query: z.object({ scope: z.enum(["rep", "team", "everyone"]).default("everyone"), scope_user_id: z.string().uuid().optional(), since: z.string().max(20).default("last") }),
  fn: ({ actor, query }) => pipelineReview(actor, { scope: query.scope, scopeUserId: query.scope_user_id ?? null, since: query.since }),
});
