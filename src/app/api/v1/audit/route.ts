import { z } from "zod";
import { handle, pagination } from "@/server/http";
import { listAudit } from "@/server/services/audit-log";

const query = pagination.extend({
  entity_type: z.string().max(60).optional(),
  entity_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  action: z.enum(["CREATE", "UPDATE", "DELETE", "RESTORE", "STAGE_CHANGE", "LOGIN", "LOGOUT"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GET = handle({
  roles: ["ADMIN"],
  query,
  fn: ({ actor, query: q }) =>
    listAudit(actor, { entityType: q.entity_type, entityId: q.entity_id, userId: q.user_id, action: q.action, from: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined, to: q.to ? new Date(`${q.to}T23:59:59Z`) : undefined }, q),
});
