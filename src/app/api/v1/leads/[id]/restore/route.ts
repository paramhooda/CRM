import { handle } from "@/server/http";
import { restoreLead } from "@/server/services/leads";

export const POST = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await restoreLead(actor, params.id!, requestId); return { ok: true }; } });
