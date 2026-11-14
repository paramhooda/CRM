import { handle } from "@/server/http";
import { pricingRequestSchema } from "@/contracts/stages";
import { createRequest } from "@/server/services/requests";

export const POST = handle({ body: pricingRequestSchema, fn: ({ actor, body, params, requestId }) => createRequest(actor, "pricing", params.id!, body, requestId) });
