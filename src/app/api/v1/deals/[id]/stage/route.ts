import { handle } from "@/server/http";
import { stageMoveSchema } from "@/contracts/stages";
import { moveStage } from "@/server/services/stages";

export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: stageMoveSchema, fn: ({ actor, body, params, requestId }) => moveStage(actor, params.id!, body, requestId) });
