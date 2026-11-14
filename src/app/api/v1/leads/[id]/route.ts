import { handle } from "@/server/http";
import { leadPatchSchema } from "@/contracts/leads";
import { deleteLead, getLead, updateLead } from "@/server/services/leads";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: ({ actor, params }) => getLead(actor, params.id!) });
export const PATCH = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: leadPatchSchema, fn: ({ actor, body, params, requestId }) => updateLead(actor, params.id!, body, requestId) });
export const DELETE = handle({ roles: ["ADMIN", "SALES_HEAD"], fn: async ({ actor, params, requestId }) => { await deleteLead(actor, params.id!, requestId); return { ok: true }; } });
