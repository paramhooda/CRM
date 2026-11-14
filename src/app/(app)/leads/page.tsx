import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { listLeads, type LeadRow } from "@/server/services/leads";
import { salesPeopleFor } from "@/server/services/people";
import { pagination } from "@/server/http";
import { leadListQuery } from "@/contracts/leads";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { DataTable, type Column } from "@/components/crm/data-table";
import { ExportButton } from "@/components/crm/export-button";
import { StatusPill, BuTag } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { Button } from "@/components/ui/button";
import { LeadFilters } from "./lead-filters";
import { fmtDate } from "@/lib/format";
import { parseListQuery, type Query } from "@/lib/url-state";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor();
  if (!can(actor.role, "leads.write")) redirect("/");
  const q = await searchParams;
  const query = parseListQuery(leadListQuery.extend(pagination.shape), q);
  const [result, owners] = await Promise.all([listLeads(actor, { q: query.q, status: query.status, sourceId: query.source, ownerId: query.owner, includeDeleted: query.includeDeleted }, query), salesPeopleFor(actor)]);
  const columns: Column<LeadRow>[] = [
    { key: "company", header: "Company", sort: "company", cell: (r) => <span>{r.companyName}{r.deletedAt && <span className="ml-2 text-xs text-destructive">(deleted)</span>}</span> },
    { key: "contact", header: "Contact", cell: (r) => <span>{r.contactName}<span className="block text-xs text-muted-foreground">{r.designation ?? r.contactEmail ?? ""}</span></span>, hideBelow: "md" },
    { key: "status", header: "Status", sort: "status", cell: (r) => <StatusPill status={r.status} /> },
    { key: "source", header: "Source", cell: (r) => r.leadSource.name, hideBelow: "lg" },
    { key: "bu", header: "Interest", cell: (r) => (r.businessUnit ? <BuTag name={r.businessUnit.name} colourToken={r.businessUnit.colourToken} /> : "—"), hideBelow: "md" },
    { key: "value", header: "Est. value", sort: "estimatedValue", align: "right", cell: (r) => <Money value={r.estimatedValue} /> },
    { key: "owner", header: "Owner", sort: "owner", cell: (r) => r.owner.fullName, hideBelow: "sm" },
    { key: "created", header: "Created", sort: "createdAt", cell: (r) => fmtDate(r.createdAt), hideBelow: "lg" },
  ];
  return (
    <>
      <PageHeader title="Leads" description="Enquiries to qualify and convert." actions={<><ExportButton entity="leads" /><Button asChild size="sm"><Link href="/leads/new"><Plus /> New lead</Link></Button></>} />
      <LeadFilters owners={owners} showDeleted={actor.role === "ADMIN"} />
      <DataTable columns={columns} rows={result.rows} query={q} pathname="/leads" total={result.total} page={result.page} pages={result.pages} rowHref={(r) => `/leads/${r.id}`} empty={{ title: "No leads match", description: "Capture an enquiry to get started.", action: <Button asChild size="sm"><Link href="/leads/new"><Plus /> New lead</Link></Button> }} />
    </>
  );
}
