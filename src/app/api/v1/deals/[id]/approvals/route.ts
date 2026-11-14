import { handle } from "@/server/http";
import { listDealApprovals, requestApproval } from "@/server/services/approvals";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: ({ actor, params }) => listDealApprovals(actor, params.id!) });
export const POST = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], fn: ({ actor, params, requestId }) => requestApproval(actor, params.id!, requestId) });
