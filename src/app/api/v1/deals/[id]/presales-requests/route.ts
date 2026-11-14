import { handle } from "@/server/http";
import { presalesRequestSchema } from "@/contracts/stages";
import { createRequest } from "@/server/services/requests";

export const POST = handle({ body: presalesRequestSchema, fn: ({ actor, body, params, requestId }) => createRequest(actor, "presales", params.id!, body, requestId) });
