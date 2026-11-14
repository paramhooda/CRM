import { handle } from "@/server/http";
import { dealHistory } from "@/server/services/deals";

export const GET = handle({ fn: ({ actor, params }) => dealHistory(actor, params.id!) });
