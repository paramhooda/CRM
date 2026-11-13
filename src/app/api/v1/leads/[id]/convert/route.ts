import { handle } from "@/server/http";
import { convertLeadSchema } from "@/contracts/leads";
import { convertLead } from "@/server/services/leads";

export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: convertLeadSchema, fn: ({ actor, body, params, requestId }) => convertLead(actor, params.id!, body, requestId) });
