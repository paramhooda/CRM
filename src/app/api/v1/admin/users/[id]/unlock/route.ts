import { handle } from "@/server/http";
import { unlockUser } from "@/server/services/users";

export const POST = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await unlockUser(actor, params.id!, requestId); return { ok: true }; } });
