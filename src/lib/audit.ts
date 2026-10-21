import type { Tx } from "./db";
import { toNumber } from "./format";

function stringify(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toNumber" in v) return String(toNumber(v));
  if (Array.isArray(v)) return v.join(",");
  return String(v);
}

/** Write one AuditLog row per changed field. Returns the list of changed field names. */
export async function recordChanges(
  tx: Tx,
  args: {
    entityType: string;
    entityId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    fields: string[];
    userId: string;
    at?: Date;
  },
): Promise<string[]> {
  const rows = [];
  for (const f of args.fields) {
    const o = stringify(args.before[f]);
    const n = stringify(args.after[f]);
    if (f.endsWith("Date") || f.endsWith("At")) {
      // compare dates at day precision to avoid noise from time components
      if ((o ?? "").slice(0, 10) === (n ?? "").slice(0, 10)) continue;
    } else if (o === n) continue;
    rows.push({
      entityType: args.entityType,
      entityId: args.entityId,
      action: "UPDATE",
      field: f,
      oldValue: o,
      newValue: n,
      changedById: args.userId,
      changedAt: args.at ?? new Date(),
    });
  }
  if (rows.length) await tx.auditLog.createMany({ data: rows });
  return rows.map((r) => r.field);
}

export async function recordEvent(
  tx: Tx,
  args: { entityType: string; entityId: string; action: string; userId: string; newValue?: string; at?: Date },
) {
  await tx.auditLog.create({
    data: {
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.action,
      newValue: args.newValue ?? null,
      changedById: args.userId,
      changedAt: args.at ?? new Date(),
    },
  });
}
