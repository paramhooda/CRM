import { handle } from "@/server/http";
import { requestListQuery } from "@/contracts/stages";
import { listRequests } from "@/server/services/requests";

export const GET = handle({ query: requestListQuery, fn: ({ actor, query }) => listRequests(actor, "pricing", { status: query.status, mine: query.mine === true || query.mine === "true", dealId: query.deal_id }) });
