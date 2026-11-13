import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { listAudit, type AuditRow } from "@/server/services/audit-log";
import { listUsers } from "@/server/services/users";
import { pagination } from "@/server/http";
import { z } from "zod";
import { PageHeader } from "@/components/crm/page-header";
import { DataTable, type Column } from "@/components/crm/data-table";
import { ExportButton } from "@/components/crm/export-button";
import { AuditFilters } from "./audit-filters";
import { fmtDateTime } from "@/lib/format";
import { ACTION_LABEL, entityLabel, fieldLabel } from "@/lib/labels";
import { parseListQuery, type Query } from "@/lib/url-state";

export const metadata: Metadata = { title: "Audit log" };

const query = pagination.extend({ entity_type: z.string().max(60).optional(), user_id: z.string().uuid().optional(), action: z.enum(["CREATE", "UPDATE", "DELETE", "RESTORE", "STAGE_CHANGE", "LOGIN", "LOGOUT"]).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

const linkFor = (r: AuditRow) => (r.dealId ? `/deals/${r.dealId}` : r.entityType === "account" ? `/accounts/${r.entityId}` : r.entityType === "lead" ? `/leads/${r.entityId}` : null);

export default async function AuditPage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") redirect("/");
  const q = await searchParams;
  const p = parseListQuery(query, q);
  const [result, users] = await Promise.all([
    listAudit(actor, { entityType: p.entity_type, userId: p.user_id, action: p.action, from: p.from ? new Date(`${p.from}T00:00:00Z`) : undefined, to: p.to ? new Date(`${p.to}T23:59:59Z`) : undefined }, p),
    listUsers(actor, true),
  ]);
  const columns: Column<AuditRow>[] = [
    { key: "when", header: "When", cell: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.changedAt)}</span> },
    { key: "who", header: "Who", cell: (r) => r.changedBy?.fullName ?? "System" },
    { key: "action", header: "Action", cell: (r) => ACTION_LABEL[r.action] ?? r.action, hideBelow: "md" },
    { key: "entity", header: "Record", cell: (r) => { const href = linkFor(r); const label = <span>{entityLabel(r.entityType)}<span className="block font-mono text-[11px] text-muted-foreground">{r.entityId.slice(0, 8)}</span></span>; return href ? <Link href={href} className="hover:text-primary">{label}</Link> : label; } },
    { key: "field", header: "Field", cell: (r) => (r.field ? fieldLabel(r.field) : "—"), hideBelow: "md" },
    { key: "old", header: "From", cell: (r) => <span className="block max-w-56 truncate text-xs text-muted-foreground" title={r.oldValue ?? ""}>{r.oldValue ?? "—"}</span>, hideBelow: "lg" },
    { key: "new", header: "To", cell: (r) => <span className="block max-w-56 truncate text-xs" title={r.newValue ?? ""}>{r.newValue ?? "—"}</span> },
  ];
  return (
    <>
      <PageHeader title="Audit log" description="Every change, sign-in and sign-out, with the old and new value." actions={<ExportButton entity="audit" />} />
      <AuditFilters users={users.rows.map((u) => ({ id: u.id, fullName: u.fullName }))} />
      <DataTable columns={columns} rows={result.rows} query={q} pathname="/admin/audit" total={result.total} page={result.page} pages={result.pages} dense empty={{ title: "No entries match" }} />
    </>
  );
}
