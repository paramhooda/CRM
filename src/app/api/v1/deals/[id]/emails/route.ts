import { handle } from "@/server/http";
import { sendDealEmailSchema } from "@/contracts/emails";
import { listEmails, sendDealEmail } from "@/server/services/emails";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: ({ actor, params }) => listEmails(actor, params.id!) });
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: sendDealEmailSchema, fn: ({ actor, params, body, requestId }) => sendDealEmail(actor, params.id!, body, requestId) });
