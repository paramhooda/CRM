import { handle } from "@/server/http";
import { aiDraftSchema } from "@/contracts/ai";
import { draft } from "@/server/services/ai";

/** Drafts text for a deal with the assistant (404 AI_OFF when the server has no key). */
export const POST = handle({ body: aiDraftSchema, fn: ({ actor, params, body }) => draft(actor, params.id!, body.kind) });
