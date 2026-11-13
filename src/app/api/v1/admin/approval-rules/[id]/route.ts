import { handle } from "@/server/http";
import { approvalRuleSchema } from "@/contracts/approvals";
import { deleteRule, updateRule } from "@/server/services/approvals";

export const PATCH = handle({ roles: ["ADMIN"], body: approvalRuleSchema, fn: ({ actor, body, params, requestId }) => updateRule(actor, params.id!, body, requestId) });
export const DELETE = handle({ roles: ["ADMIN"], fn: async ({ actor, params, requestId }) => { await deleteRule(actor, params.id!, requestId); return { ok: true }; } });
