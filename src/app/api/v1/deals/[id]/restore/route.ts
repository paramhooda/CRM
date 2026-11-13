import { handle } from "@/server/http";
import { restoreDeal } from "@/server/services/deals";

export const POST = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await restoreDeal(actor, params.id!, requestId); return { ok: true }; } });
