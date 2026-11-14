import { handle } from "@/server/http";
import { approvalRuleSchema } from "@/contracts/approvals";
import { createRule, listRules } from "@/server/services/approvals";

export const GET = handle({ roles: ["ADMIN"], fn: ({ actor }) => listRules(actor) });
export const POST = handle({ roles: ["ADMIN"], body: approvalRuleSchema, fn: ({ actor, body, requestId }) => createRule(actor, body, requestId) });
