import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { getLead } from "@/server/services/leads";
import { salesPeopleFor } from "@/server/services/people";
import { NotFound } from "@/server/errors";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { StatusPill, BuTag } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { LeadActions } from "./lead-actions";
import { LeadForm } from "../lead-form";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const actor = await requireActor();
  if (!can(actor.role, "leads.write")) redirect("/");
  const { id } = await params;
  const { edit } = await searchParams;
  let l: Awaited<ReturnType<typeof getLead>>;
  try {
    l = await getLead(actor, id);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  if (edit && l.canEdit) {
    const owners = await salesPeopleFor(actor);
    return (
      <>
        <PageHeader title={`Edit ${l.companyName}`} crumbs={[{ href: "/leads", label: "Leads" }, { href: `/leads/${l.id}`, label: l.code }]} />
        <LeadForm leadId={l.id} owners={owners} initial={{ companyName: l.companyName, contactName: l.contactName, contactEmail: l.contactEmail ?? "", contactPhone: l.contactPhone ?? "", designation: l.designation ?? "", leadSourceId: l.leadSourceId, industryId: l.industryId, segmentId: l.segmentId, businessUnitId: l.businessUnitId, estimatedValue: l.estimatedValue ?? "", notes: l.notes ?? "", ownerId: l.ownerId }} />
      </>
    );
  }
  const rows: [string, React.ReactNode][] = [
    ["Contact", <span key="c">{l.contactName}{l.designation ? ` · ${l.designation}` : ""}</span>],
    ["Email", l.contactEmail ?? "—"],
    ["Phone", l.contactPhone ?? "—"],
    ["Source", l.leadSource.name],
    ["Interest", l.businessUnit ? <BuTag key="bu" name={l.businessUnit.name} colourToken={l.businessUnit.colourToken} /> : "—"],
    ["Industry", l.industry?.name ?? "—"],
    ["Segment", l.segment?.name ?? "—"],
    ["Estimated value", <Money key="v" value={l.estimatedValue} />],
    ["Owner", l.owner.fullName],
    ["Captured", fmtDate(l.createdAt, "long")],
  ];
  return (
    <>
      <PageHeader
        title={l.companyName}
        crumbs={[{ href: "/leads", label: "Leads" }]}
        description={<span className="font-mono text-xs">{l.code}</span>}
        meta={<><StatusPill status={l.status} />{l.disqualifyReason && <span className="text-xs text-muted-foreground">Reason: {l.disqualifyReason}</span>}{l.convertedDealId && <Link href={`/deals/${l.convertedDealId}`} className="text-xs text-primary hover:underline">Open the deal →</Link>}</>}
        actions={<LeadActions id={l.id} status={l.status} canEdit={l.canEdit} companyName={l.companyName} contactName={l.contactName} contactEmail={l.contactEmail} contactPhone={l.contactPhone} designation={l.designation} notes={l.notes} canDelete={can(actor.role, "leads.delete") && !l.deletedAt} canRestore={can(actor.role, "records.restore") && !!l.deletedAt} />}
      />
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 rounded-xl border border-border bg-card-tint p-4 text-sm sm:col-span-2 sm:grid-cols-[140px_1fr_140px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {l.notes && <div className="rounded-xl border border-border bg-card p-4 text-sm sm:col-span-2"><div className="mb-1 text-xs text-muted-foreground">Notes</div><p className="whitespace-pre-line">{l.notes}</p></div>}
      </div>
    </>
  );
}
