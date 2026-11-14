import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { myWork } from "@/server/services/metrics";
import { PageHeader } from "@/components/crm/page-header";
import { KpiTile } from "@/components/crm/kpi-tile";
import { StagePill, StatusPill } from "@/components/crm/pills";
import { EmptyState } from "@/components/crm/states";
import { Button } from "@/components/ui/button";
import { fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RecordCode } from "@/components/crm/code";

export const metadata: Metadata = { title: "My work" };

export default async function MyWorkPage() {
  const actor = await requireActor();
  if (actor.role !== "PRESALES" && actor.role !== "PURCHASE" && actor.role !== "ADMIN") redirect("/home");
  const w = await myWork(actor);
  const what = w.kind === "pricing" ? "pricing request" : "BOQ request";
  return (
    <>
      <PageHeader title="My work" description={w.kind === "pricing" ? "Deals waiting for your purchase prices, overdue first." : "Deals waiting for your BOQ, overdue first."} />
      <section className="grid grid-cols-3 gap-3" aria-label="Counts">
        <KpiTile label="Open" value={w.counts?.open ?? 0} />
        <KpiTile label="Overdue" value={w.counts?.overdue ?? 0} tone={w.counts?.overdue ? "bad" : "default"} />
        <KpiTile label="Not started" value={w.counts?.notStarted ?? 0} />
      </section>
      <section className="mt-6" aria-label="Open requests">
        <h2 className="mb-2 text-sm font-semibold">Open</h2>
        {w.open.length === 0 ? (
          <EmptyState title="Nothing open" description={`New ${what}s show here as soon as sales raises them.`} />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {w.open.map((r) => (
              <div key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", r.overdue && "bg-destructive/5")}>
                <div className="min-w-0 flex-1">
                  <Link href={`/deals/${r.deal.id}`} className="font-medium hover:text-link">{r.deal.name}</Link>
                  <div className="text-xs text-muted-foreground"><RecordCode>{r.deal.code}</RecordCode> · {r.deal.account.name} · {r.deal.owner.fullName} · {r.deal._count.lines} line{r.deal._count.lines === 1 ? "" : "s"}</div>
                  {"scope" in r && r.scope && <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.scope}</div>}
                  {"notes" in r && r.notes && <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.notes}</div>}
                </div>
                <StagePill stage={r.deal.stage} />
                <StatusPill status={r.overdue ? "OVERDUE" : r.status} />
                <span className={cn("w-28 text-right text-xs", r.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>Due {fmtDate(r.dueDate)} · {relativeDays(r.dueDate)}</span>
                <Button asChild size="sm"><Link href={`/deals/${r.deal.id}?tab=lines`}>{r.status === "REQUESTED" ? "Start" : "Open"}</Link></Button>
              </div>
            ))}
          </div>
        )}
      </section>
      {w.done.length > 0 && (
        <section className="mt-8" aria-label="Recently finished">
          <h2 className="mb-2 text-sm font-semibold">Recently finished</h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {w.done.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <Link href={`/deals/${r.deal.id}`} className="min-w-0 flex-1 truncate hover:text-link">{r.deal.name} <RecordCode>· {r.deal.code}</RecordCode></Link>
                <StatusPill status={r.status} />
                <span className="text-xs text-muted-foreground">{fmtDate(r.updatedAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
