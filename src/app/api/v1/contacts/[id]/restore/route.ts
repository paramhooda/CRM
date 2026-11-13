import { handle } from "@/server/http";
import { restoreContact } from "@/server/services/contacts";

export const POST = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await restoreContact(actor, params.id!, requestId); return { ok: true }; } });
