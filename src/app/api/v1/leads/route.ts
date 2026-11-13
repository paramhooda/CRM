import { handle, pagination } from "@/server/http";
import { leadListQuery, leadSchema } from "@/contracts/leads";
import { createLead, listLeads } from "@/server/services/leads";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], query: leadListQuery.extend(pagination.shape), fn: ({ actor, query }) => listLeads(actor, { q: query.q, status: query.status, sourceId: query.source, ownerId: query.owner, includeDeleted: query.includeDeleted }, query) });
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: leadSchema, fn: ({ actor, body, requestId }) => createLead(actor, body, requestId) });
