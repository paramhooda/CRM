import { handle } from "@/server/http";
import { disqualifySchema } from "@/contracts/leads";
import { disqualifyLead } from "@/server/services/leads";

export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: disqualifySchema, fn: ({ actor, body, params, requestId }) => disqualifyLead(actor, params.id!, body.reason, requestId) });
