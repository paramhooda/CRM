import { handle } from "@/server/http";
import { productSchema } from "@/contracts/lookups";
import { createProduct } from "@/server/services/products";

export const POST = handle({ roles: ["ADMIN"], body: productSchema, fn: ({ actor, body, requestId }) => createProduct(actor, body, requestId) });
