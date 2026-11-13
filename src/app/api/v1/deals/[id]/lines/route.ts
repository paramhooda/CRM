import { handle } from "@/server/http";
import { linesPatchSchema } from "@/contracts/deals";
import { saveLines } from "@/server/services/deals";

export const PATCH = handle({ body: linesPatchSchema, fn: ({ actor, body, params, requestId }) => saveLines(actor, params.id!, body, requestId) });
