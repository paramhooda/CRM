import { handle } from "@/server/http";
import { requestActionSchema } from "@/contracts/stages";
import { actOnRequest } from "@/server/services/requests";

export const PATCH = handle({ body: requestActionSchema, fn: ({ actor, body, params, requestId }) => actOnRequest(actor, "pricing", params.id!, body, requestId) });
