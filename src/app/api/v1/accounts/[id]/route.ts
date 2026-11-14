import { handle } from "@/server/http";
import { accountPatchSchema } from "@/contracts/accounts";
import { deleteAccount, getAccount, updateAccount } from "@/server/services/accounts";

export const GET = handle({ fn: ({ actor, params }) => getAccount(actor, params.id!) });
export const PATCH = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: accountPatchSchema, fn: ({ actor, body, params, requestId }) => updateAccount(actor, params.id!, body, requestId) });
export const DELETE = handle({ roles: ["ADMIN", "SALES_HEAD"], fn: async ({ actor, params, requestId }) => { await deleteAccount(actor, params.id!, requestId); return { ok: true }; } });
