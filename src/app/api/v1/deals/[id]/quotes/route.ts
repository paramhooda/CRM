import { handle } from "@/server/http";
import { createQuoteSchema } from "@/contracts/quotes";
import { createQuote, listQuotes } from "@/server/services/quotes";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: ({ actor, params }) => listQuotes(actor, params.id!) });
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: createQuoteSchema, fn: ({ actor, params, body, requestId }) => createQuote(actor, params.id!, body, requestId) });
