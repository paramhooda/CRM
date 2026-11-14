import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { assertPermission } from "../authz/scope";
import { paged, type Pagination } from "../http";

export type AuditFilters = { entityType?: string; entityId?: string; userId?: string; from?: Date; to?: Date; action?: string };

const select = {
  id: true, entityType: true, entityId: true, dealId: true, action: true, field: true, oldValue: true, newValue: true, changedAt: true, requestId: true,
  changedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditRow = Omit<Prisma.AuditLogGetPayload<{ select: typeof select }>, "id"> & { id: string };

const out = (r: Prisma.AuditLogGetPayload<{ select: typeof select }>): AuditRow => ({ ...r, id: r.id.toString() });

export function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  return {
    entityType: f.entityType,
    entityId: f.entityId,
    changedById: f.userId,
    action: f.action as Prisma.AuditLogWhereInput["action"],
    changedAt: f.from || f.to ? { gte: f.from, lte: f.to } : undefined,
  };
}

/** The whole log: admin only. */
export async function listAudit(actor: Actor, f: AuditFilters, p: Pagination) {
  assertPermission(actor, "audit.viewAll");
  const where = auditWhere(f);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, select, orderBy: { changedAt: "desc" }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.auditLog.count({ where }),
  ]);
  return paged(rows.map(out), total, p);
}

export async function allAudit(actor: Actor, f: AuditFilters) {
  assertPermission(actor, "audit.viewAll");
  const rows = await db.auditLog.findMany({ where: auditWhere(f), select, orderBy: { changedAt: "desc" }, take: 10_000 });
  return rows.map(out);
}
