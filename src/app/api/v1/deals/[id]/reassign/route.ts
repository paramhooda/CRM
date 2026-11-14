import { handle } from "@/server/http";
import { reassignSchema } from "@/contracts/deals";
import { reassignDeal } from "@/server/services/deals";

export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: reassignSchema, fn: ({ actor, body, params, requestId }) => reassignDeal(actor, params.id!, body, requestId) });
