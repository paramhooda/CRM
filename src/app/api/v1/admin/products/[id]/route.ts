import { handle } from "@/server/http";
import { productPatchSchema } from "@/contracts/lookups";
import { deleteProduct, updateProduct } from "@/server/services/products";

export const PATCH = handle({ roles: ["ADMIN"], body: productPatchSchema, fn: ({ actor, body, params, requestId }) => updateProduct(actor, params.id!, body, requestId) });
export const DELETE = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await deleteProduct(actor, params.id!, requestId); return { ok: true }; } });
