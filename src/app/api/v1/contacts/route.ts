import { handle, pagination } from "@/server/http";
import { contactListQuery, contactSchema } from "@/contracts/accounts";
import { createContact, listContacts } from "@/server/services/contacts";

export const GET = handle({
  query: contactListQuery.extend(pagination.shape),
  fn: ({ actor, query }) => listContacts(actor, { q: query.q, accountId: query.account_id, includeDeleted: query.includeDeleted }, query),
});
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: contactSchema, fn: ({ actor, body, requestId }) => createContact(actor, body, requestId) });
