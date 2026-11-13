import { z } from "zod";
import { handle } from "@/server/http";
import { myWork } from "@/server/services/metrics";

export const GET = handle({ roles: ["PRESALES", "PURCHASE", "ADMIN"], query: z.object({ user_id: z.string().uuid().optional() }), fn: ({ actor, query }) => myWork(actor, query.user_id) });
