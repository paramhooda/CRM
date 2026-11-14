import { handle, pagination } from "@/server/http";
import { accountListQuery, accountSchema } from "@/contracts/accounts";
import { createAccount, listAccounts } from "@/server/services/accounts";

export const GET = handle({
  query: accountListQuery.extend(pagination.shape),
  fn: ({ actor, query }) => listAccounts(actor, { q: query.q, industryId: query.industry, segmentId: query.segment, ownerId: query.owner, includeDeleted: query.includeDeleted }, query),
});
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: accountSchema, fn: ({ actor, body, requestId }) => createAccount(actor, body, requestId) });
