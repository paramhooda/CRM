import { handle } from "@/server/http";
import { deleteDocument } from "@/server/services/documents";

export const DELETE = handle({ fn: async ({ actor, params, requestId }) => { await deleteDocument(actor, params.id!, requestId); return { ok: true }; } });
