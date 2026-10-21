import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ClipboardList, Calculator, ArrowRight, AlertOctagon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isManager, opportunityScope } from "@/lib/authz";
import { db } from "@/lib/db";
import { PageHeader, PageBody, StatTile, EmptyState } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonCell } from "@/components/crm/badges";
import { Pills } from "@/components/filters/pills";
import { inr, fmtDate, relativeDays, toNumber } from "@/lib/format";
import { PRESALES_STATUS_LABEL, PRICING_STATUS_LABEL, type Tone } from "@/lib/constants";

export const metadata = { title: "Requests" };
const OPEN = ["REQUESTED", "IN_PROGRESS"] as const;
const TONE: Record<string, Tone> = { REQUESTED: "blue", IN_PROGRESS: "violet", BOQ_SUBMITTED: "green", QUOTED: "green", CANCELLED: "slate" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "closed" ? "closed" : "open";
  const now = new Date();
  const statusFilter = view === "open" ? { in: [...OPEN] } : { notIn: [...OPEN] };
  const presalesWhere: Prisma.PresalesRequestWhereInput =
    user.role === "PRESALES" ? { assignedToId: user.id } : user.role === "PURCHASE" ? { id: "none" } : isManager(user) ? {} : { opportunity: opportunityScope(user) };
  const pricingWhere: Prisma.PricingRequestWhereInput =
    user.role === "PURCHASE" ? { assignedToId: user.id } : user.role === "PRESALES" ? { requestedById: user.id } : isManager(user) ? {} : { opportunity: opportunityScope(user) };
  const oppSel = { select: { id: true, name: true, code: true, amount: true, stage: true, account: { select: { name: true } }, salesOwner: { select: { name: true } } } } as const;
  const [presales, pricing, presalesAll, pricingAll] = await Promise.all([
    db.presalesRequest.findMany({
      where: { ...presalesWhere, status: statusFilter as never },
      orderBy: view === "open" ? { dueDate: "asc" } : { updatedAt: "desc" },
      take: 100,
      include: { opportunity: oppSel, requestedBy: { select: { name: true } }, assignedTo: { select: { id: true, name: true } } },
    }),
    db.pricingRequest.findMany({
      where: { ...pricingWhere, status: statusFilter as never },
      orderBy: view === "open" ? { dueDate: "asc" } : { updatedAt: "desc" },
      take: 100,
      include: { opportunity: { select: { ...oppSel.select, _count: { select: { lineItems: true } } } }, requestedBy: { select: { name: true } }, assignedTo: { select: { id: true, name: true } } },
    }),
    isManager(user) ? db.presalesRequest.findMany({ where: { status: { in: [...OPEN] } }, select: { assignedTo: { select: { id: true, name: true } }, dueDate: true } }) : Promise.resolve([]),
    isManager(user) ? db.pricingRequest.findMany({ where: { status: { in: [...OPEN] } }, select: { assignedTo: { select: { id: true, name: true } }, dueDate: true } }) : Promise.resolve([]),
  ]);

  // Turnaround (submitted - created) for completed requests in the last 90 days
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const [doneP, doneQ] = await Promise.all([
    db.presalesRequest.findMany({ where: { ...presalesWhere, status: "BOQ_SUBMITTED", submittedAt: { gte: since } }, select: { createdAt: true, submittedAt: true } }),
    db.pricingRequest.findMany({ where: { ...pricingWhere, status: "QUOTED", quotedAt: { gte: since } }, select: { createdAt: true, quotedAt: true } }),
  ]);
  const avg = (xs: { a: Date; b: Date | null }[]) => (xs.length ? xs.reduce((s, x) => s + ((x.b ?? x.a).getTime() - x.a.getTime()) / 86_400_000, 0) / xs.length : null);
  const avgBoq = avg(doneP.map((x) => ({ a: x.createdAt, b: x.submittedAt })));
  const avgPrice = avg(doneQ.map((x) => ({ a: x.createdAt, b: x.quotedAt })));

  const showPresales = user.role !== "PURCHASE";
  const showPricing = user.role !== "PRESALES" || pricing.length > 0;
  const overdueP = presales.filter((r) => view === "open" && r.dueDate < now).length;
  const overdueQ = pricing.filter((r) => view === "open" && r.dueDate < now).length;

  const workload = (rows: { assignedTo: { id: string; name: string }; dueDate: Date }[]) => {
    const m = new Map<string, { name: string; open: number; overdue: number }>();
    for (const r of rows) {
      const x = m.get(r.assignedTo.id) ?? { name: r.assignedTo.name, open: 0, overdue: 0 };
      x.open++;
      if (r.dueDate < now) x.overdue++;
      m.set(r.assignedTo.id, x);
    }
    return [...m.values()].sort((a, b) => b.open - a.open);
  };

  return (
    <>
      <PageHeader
        title={user.role === "PRESALES" ? "BOQ requests" : user.role === "PURCHASE" ? "Pricing requests" : "Presales & pricing requests"}
        description={user.role === "PRESALES" ? "Deals where sales has pulled you in to design the solution and prepare the BOQ" : user.role === "PURCHASE" ? "BOQs waiting for OEM / distributor pricing" : "Track BOQ and pricing turnaround on your deals"}
      >
        <div className="mt-4"><Pills param="view" sp={sp} path="/requests" allLabel="Open" options={[{ value: "closed", label: "Completed" }]} /></div>
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {showPresales && <StatTile label="Open BOQ requests" value={view === "open" ? presales.length : "—"} sub={overdueP ? `${overdueP} overdue` : "None overdue"} accent="var(--s7)" />}
          {showPresales && <StatTile label="Avg BOQ turnaround" value={avgBoq === null ? "—" : `${avgBoq.toFixed(1)} days`} sub="Last 90 days · SLA 7 days" />}
          {showPricing && <StatTile label="Open pricing requests" value={view === "open" ? pricing.length : "—"} sub={overdueQ ? `${overdueQ} overdue` : "None overdue"} accent="var(--s4)" />}
          {showPricing && <StatTile label="Avg pricing turnaround" value={avgPrice === null ? "—" : `${avgPrice.toFixed(1)} days`} sub="Last 90 days · SLA 5 days" />}
        </div>

        {isManager(user) && view === "open" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Workload title="Presales workload" rows={workload(presalesAll)} />
            <Workload title="Purchase workload" rows={workload(pricingAll)} />
          </div>
        )}

        {showPresales && (
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><ClipboardList className="size-4 text-[var(--s7)]" />BOQ requests</span>} />
            <CardContent className="px-0 pb-0">
              {presales.length === 0 ? <EmptyState title={view === "open" ? "No open BOQ requests" : "Nothing completed yet"} /> : (
                <RequestTable
                  rows={presales.map((r) => ({
                    id: r.id, opp: r.opportunity, requestedBy: r.requestedBy.name, assignedTo: r.assignedTo.name, status: r.status,
                    statusLabel: PRESALES_STATUS_LABEL[r.status], dueDate: r.dueDate, createdAt: r.createdAt, note: r.scope, priority: r.priority,
                    closedAt: r.submittedAt,
                  }))}
                  now={now}
                />
              )}
            </CardContent>
          </Card>
        )}
        {showPricing && (
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><Calculator className="size-4 text-[var(--s4)]" />Pricing requests</span>} />
            <CardContent className="px-0 pb-0">
              {pricing.length === 0 ? <EmptyState title={view === "open" ? "No open pricing requests" : "Nothing completed yet"} /> : (
                <RequestTable
                  rows={pricing.map((r) => ({
                    id: r.id, opp: r.opportunity, requestedBy: r.requestedBy.name, assignedTo: r.assignedTo.name, status: r.status,
                    statusLabel: PRICING_STATUS_LABEL[r.status], dueDate: r.dueDate, createdAt: r.createdAt,
                    note: `${r.opportunity._count.lineItems} BOQ lines${r.notes ? ` · ${r.notes}` : ""}`, closedAt: r.quotedAt,
                  }))}
                  now={now}
                />
              )}
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}

type Row = {
  id: string; opp: { id: string; name: string; code: string; amount: unknown; account: { name: string }; salesOwner: { name: string } };
  requestedBy: string; assignedTo: string; status: string; statusLabel: string; dueDate: Date; createdAt: Date; note: string; priority?: string; closedAt: Date | null;
};

function RequestTable({ rows, now }: { rows: Row[]; now: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-y border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
            <th className="px-4 py-2 font-medium">Opportunity</th><th className="px-4 py-2 font-medium">Requested by</th><th className="px-4 py-2 font-medium">Assigned to</th>
            <th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Due</th><th className="px-4 py-2 text-right font-medium">Deal value</th><th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = r.status === "REQUESTED" || r.status === "IN_PROGRESS";
            const overdue = open && r.dueDate < now;
            return (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                <td className="max-w-[360px] px-4 py-2.5">
                  <Link href={`/opportunities/${r.opp.id}?tab=boq`} className="font-medium hover:text-primary">{r.opp.name}</Link>
                  <p className="truncate text-xs text-ink-3">{r.opp.code} · {r.opp.account.name} · {r.note}</p>
                </td>
                <td className="px-4 py-2.5"><PersonCell name={r.requestedBy} sub={relativeDays(r.createdAt)} /></td>
                <td className="px-4 py-2.5"><PersonCell name={r.assignedTo} /></td>
                <td className="px-4 py-2.5">
                  <Badge tone={TONE[r.status]}>{r.statusLabel}</Badge>
                  {r.priority && r.priority !== "NORMAL" && <Badge tone="orange" className="ml-1">{r.priority.toLowerCase()}</Badge>}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {open ? (
                    <span className="inline-flex items-center gap-1" style={{ color: overdue ? "var(--t-red)" : undefined }}>
                      {overdue && <AlertOctagon className="size-3.5" />}{fmtDate(r.dueDate)} · {relativeDays(r.dueDate)}
                    </span>
                  ) : (
                    <span className="text-ink-3">Done {fmtDate(r.closedAt)}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular">{inr(toNumber(r.opp.amount))}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/opportunities/${r.opp.id}?tab=boq`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open BOQ <ArrowRight className="size-3" /></Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Workload({ title, rows }: { title: string; rows: { name: string; open: number; overdue: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <Card>
      <CardHeader title={title} description="Open requests per person. Red share is overdue." />
      <CardContent className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-xs text-ink-3">No open requests.</p>}
        {rows.map((r) => (
          <div key={r.name} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
            <PersonCell name={r.name} />
            <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
              <div className="h-full rounded-l-full" style={{ width: `${((r.open - r.overdue) / max) * 100}%`, background: "var(--s1)" }} />
              {r.overdue > 0 && <div className="h-full rounded-r-full" style={{ width: `${(r.overdue / max) * 100}%`, background: "var(--critical)" }} />}
            </div>
            <span className="text-xs tabular text-ink-2">{r.open} open{r.overdue ? ` · ${r.overdue} late` : ""}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
