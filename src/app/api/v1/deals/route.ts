import { handle, pagination } from "@/server/http";
import { createDealSchema, dealListQuery } from "@/contracts/deals";
import { createDeal, listDeals } from "@/server/services/deals";

export const GET = handle({ query: dealListQuery.extend(pagination.shape), fn: ({ actor, query }) => listDeals(actor, query, query) });
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: createDealSchema, fn: ({ actor, body, requestId }) => createDeal(actor, body, requestId) });
