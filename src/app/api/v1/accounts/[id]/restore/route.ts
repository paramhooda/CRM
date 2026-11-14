import { handle } from "@/server/http";
import { restoreAccount } from "@/server/services/accounts";

export const POST = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await restoreAccount(actor, params.id!, requestId); return { ok: true }; } });
