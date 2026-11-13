import { handle } from "@/server/http";
import { contactPatchSchema } from "@/contracts/accounts";
import { deleteContact, getContact, updateContact } from "@/server/services/contacts";

export const GET = handle({ fn: ({ actor, params }) => getContact(actor, params.id!) });
export const PATCH = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: contactPatchSchema, fn: ({ actor, body, params, requestId }) => updateContact(actor, params.id!, body, requestId) });
export const DELETE = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: async ({ actor, params, requestId }) => { await deleteContact(actor, params.id!, requestId); return { ok: true }; } });
