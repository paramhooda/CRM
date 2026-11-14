import { handle } from "@/server/http";
import { restoreProduct } from "@/server/services/products";

export const POST = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await restoreProduct(actor, params.id!, requestId); return { ok: true }; } });
