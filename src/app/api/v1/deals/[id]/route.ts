import { handle } from "@/server/http";
import { patchDealSchema } from "@/contracts/deals";
import { deleteDeal, getDeal, updateDeal } from "@/server/services/deals";

export const GET = handle({ fn: ({ actor, params }) => getDeal(actor, params.id!) });
export const PATCH = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: patchDealSchema, fn: ({ actor, body, params, requestId }) => updateDeal(actor, params.id!, body, requestId) });
export const DELETE = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: async ({ actor, params, requestId }) => { await deleteDeal(actor, params.id!, requestId); return { ok: true }; } });
