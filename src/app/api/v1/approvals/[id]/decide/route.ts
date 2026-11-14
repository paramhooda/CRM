import { handle } from "@/server/http";
import { decideSchema } from "@/contracts/approvals";
import { decideApproval } from "@/server/services/approvals";

export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], body: decideSchema, fn: ({ actor, body, params, requestId }) => decideApproval(actor, params.id!, body, requestId) });
