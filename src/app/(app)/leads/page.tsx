import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { accountScope, can, isManager, leadScope } from "@/lib/authz";
import { db } from "@/lib/db";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, StatTile } from "@/components/crm/page";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/crm/badges";
import { SearchBox } from "@/components/filters/search-box";
import { Pills } from "@/components/filters/pills";
import { LeadDialog, ConvertLeadDialog } from "@/components/leads/lead-dialogs";
import { LEAD_STATUS_LABEL, type Tone } from "@/lib/constants";
import { inr, toNumber, relativeDays } from "@/lib/format";

export const metadata = { title: "Leads" };
const TONE: Record<string, Tone> = { NEW: "blue", CONTACTED: "violet", QUALIFIED: "green", UNQUALIFIED: "slate", CONVERTED: "aqua" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  if (!can.manageLeads(user)) redirect("/dashboard");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const ci = { contains: q, mode: "insensitive" as const };
  const [leads, all, options, accounts] = await Promise.all([
    db.lead.findMany({
      where: { AND: [leadScope(user), status ? { status: status as never } : { status: { not: "CONVERTED" } }, q ? { OR: [{ company: ci }, { firstName: ci }, { lastName: ci }, { email: ci }] } : {}] },
      orderBy: { createdAt: "desc" },
      include: { owner: { select: { name: true } }, businessUnit: { select: { name: true } } },
    }),
    db.lead.groupBy({ by: ["status"], where: leadScope(user), _count: true, _sum: { estimatedValue: true } }),
    getOptions(),
    db.account.findMany({ where: accountScope(user), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const count = (s: string) => all.find((a) => a.status === s)?._count ?? 0;
  const total = all.reduce((a, x) => a + x._count, 0);
  const openValue = all.filter((a) => ["NEW", "CONTACTED", "QUALIFIED"].includes(a.status)).reduce((a, x) => a + toNumber(x._sum.estimatedValue), 0);
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return (
    <>
      <PageHeader
        title="Leads"
        description="Capture, qualify and convert enquiries into opportunities"
        actions={<LeadDialog sources={options.leadSources} bus={options.bus} owners={options.sales} canReassign={isManager(user)} currentUserId={user.id} />}
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Suspense><SearchBox placeholder="Search company or person" /></Suspense>
          <Pills param="status" sp={sp} path="/leads" allLabel="Open leads" options={Object.entries(LEAD_STATUS_LABEL).map(([value, label]) => ({ value, label, count: count(value) }))} />
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Open leads" value={count("NEW") + count("CONTACTED") + count("QUALIFIED")} sub={`${inr(openValue)} estimated`} accent="var(--s1)" />
          <StatTile label="Qualified, ready to convert" value={count("QUALIFIED")} accent="var(--s3)" />
          <StatTile label="Converted" value={count("CONVERTED")} sub={total ? `${Math.round((count("CONVERTED") / total) * 100)}% conversion` : undefined} accent="var(--s6)" />
          <StatTile label="Disqualified" value={count("UNQUALIFIED")} />
        </div>
        <div className="rounded-xl border border-border bg-surface">
          <Table>
            <THead><tr><TH>Lead</TH><TH>Company</TH><TH>Interest</TH><TH className="text-right">Est. value</TH><TH>Source</TH><TH>Status</TH><TH>Owner</TH><TH>Age</TH><TH /></tr></THead>
            <TBody>
              {leads.map((l) => (
                <TR key={l.id}>
                  <TD><p className="font-medium">{l.firstName} {l.lastName}</p><p className="text-xs text-ink-3">{l.code} · {l.title}</p></TD>
                  <TD><p>{l.company}</p><p className="text-xs text-ink-3">{l.city}</p></TD>
                  <TD className="max-w-[240px]"><p className="text-xs">{l.businessUnit?.name ?? "—"}</p><p className="truncate text-xs text-ink-3">{l.requirement}</p></TD>
                  <TD className="text-right tabular">{l.estimatedValue ? inr(l.estimatedValue) : "—"}</TD>
                  <TD className="text-xs">{l.source}</TD>
                  <TD><Badge tone={TONE[l.status]}>{LEAD_STATUS_LABEL[l.status]}</Badge>{l.disqualifyReason && <p className="mt-0.5 text-[11px] text-ink-3">{l.disqualifyReason}</p>}</TD>
                  <TD><PersonCell name={l.owner.name} /></TD>
                  <TD className="text-xs text-ink-2">{relativeDays(l.createdAt)}</TD>
                  <TD className="text-right">
                    {l.status === "CONVERTED" ? (
                      l.convertedOpportunityId && <Link href={`/opportunities/${l.convertedOpportunityId}`} className="text-xs text-primary hover:underline">View deal</Link>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <LeadDialog
                          id={l.id}
                          initial={{ firstName: l.firstName, lastName: l.lastName, company: l.company, title: s(l.title), email: s(l.email), phone: s(l.phone), city: s(l.city), source: s(l.source), businessUnitId: s(l.businessUnitId), estimatedValue: l.estimatedValue ? String(toNumber(l.estimatedValue)) : "", status: l.status, ownerId: l.ownerId, requirement: s(l.requirement), disqualifyReason: s(l.disqualifyReason) }}
                          sources={options.leadSources} bus={options.bus} owners={options.sales} canReassign={isManager(user)} currentUserId={user.id}
                        />
                        {l.status !== "UNQUALIFIED" && (
                          <ConvertLeadDialog id={l.id} company={l.company} requirement={l.requirement} estimatedValue={l.estimatedValue ? toNumber(l.estimatedValue) : null} buId={l.businessUnitId} accounts={accounts} categories={options.categories} oems={options.oems} />
                        )}
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
              {leads.length === 0 && <tr><td colSpan={9} className="py-12 text-center text-sm text-ink-3">No leads here.</td></tr>}
            </TBody>
          </Table>
        </div>
      </PageBody>
    </>
  );
}
