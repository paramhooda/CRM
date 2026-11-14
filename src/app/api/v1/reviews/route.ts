import { z } from "zod";
import { handle } from "@/server/http";
import { listReviews, markReviewed } from "@/server/services/reviews";
import { optionalText } from "@/contracts/common";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: ({ actor }) => listReviews(actor) });
export const POST = handle({
  roles: ["ADMIN", "SALES_HEAD", "SALES"],
  body: z.object({ scope: z.enum(["rep", "team", "everyone"]), scopeUserId: z.string().uuid().nullable().optional(), sinceDate: z.string().max(20), notes: optionalText(4000) }),
  fn: ({ actor, body, requestId }) => markReviewed(actor, body, requestId),
});
