import "server-only";
import type { Tx } from "./db";
import type { AuditAction } from "@/generated/prisma/enums";

type Prismaish = Pick<Tx, "auditLog">;

/** How a value is written into the audit log: dates as ISO (date-only fields as yyyy-mm-dd), decimals as text. */
export function auditValue(v: unknown, field?: string): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return field && /Date$/.test(field) ? v.toISOString().slice(0, 10) : v.toISOString();
  const s = String(v);
  // Amounts arrive as "700000", "700000.00" or Decimal objects: store one canonical form so comparisons hold
  if (/^-?\d+\.\d+$/.test(s)) return s.replace(/\.?0+$/, "");
  return s;
}

export type AuditEvent = {
  entityType: string;
  entityId: string;
  dealId?: string | null;
  action: AuditAction;
  userId: string | null;
  requestId?: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
};

export async function recordEvent(tx: Prismaish, e: AuditEvent) {
  await tx.auditLog.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      dealId: e.dealId ?? null,
      action: e.action,
      field: e.field ?? null,
      oldValue: auditValue(e.oldValue, e.field),
      newValue: auditValue(e.newValue, e.field),
      changedById: e.userId,
      requestId: e.requestId ?? null,
    },
  });
}

/** One UPDATE row per field whose value changed between `before` and `after`. */
export async function recordChanges<T extends object>(
  tx: Prismaish,
  e: Omit<AuditEvent, "action" | "field" | "oldValue" | "newValue"> & { before: T; after: Partial<T>; fields?: (keyof T & string)[] },
): Promise<string[]> {
  const fields = e.fields ?? (Object.keys(e.after) as (keyof T & string)[]);
  const changed: string[] = [];
  for (const f of fields) {
    if (!(f in e.after)) continue;
    const o = auditValue(e.before[f], f);
    const n = auditValue(e.after[f], f);
    if (o === n) continue;
    changed.push(f);
    await tx.auditLog.create({
      data: { entityType: e.entityType, entityId: e.entityId, dealId: e.dealId ?? null, action: "UPDATE", field: f, oldValue: o, newValue: n, changedById: e.userId, requestId: e.requestId ?? null },
    });
  }
  return changed;
}
