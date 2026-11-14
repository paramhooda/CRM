import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { myWork } from "@/server/services/metrics";
import { PageHeader } from "@/components/crm/page-header";
import { StatTile } from "@/components/crm/stat-tile";
import { SectionLabel } from "@/components/crm/section-label";
import { Inbox, Hourglass, CirclePlay } from "lucide-react";
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
      <SectionLabel note="Requests assigned to you">Your queue</SectionLabel>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="Counts">
        <StatTile label="Open" value={w.counts?.open ?? 0} icon={Inbox} iconTone="blue" note={`${what}s on your plate`} />
        <StatTile label="Overdue" value={w.counts?.overdue ?? 0} icon={Hourglass} iconTone="red" tone={w.counts?.overdue ? "red" : "default"} note={w.counts?.overdue ? "past the due date" : "nothing overdue"} />
        <StatTile label="Not started" value={w.counts?.notStarted ?? 0} icon={CirclePlay} iconTone="amber" tone={w.counts?.notStarted ? "amber" : "default"} note="waiting for you to start" />
      </section>
      <section className="mt-8" aria-label="Open requests">
        <SectionLabel>Open</SectionLabel>
        {w.open.length === 0 ? (
          <EmptyState title="Nothing open" description={`New ${what}s show here as soon as sales raises them.`} />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            {w.open.map((r) => (
              <div key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", r.overdue && "bg-destructive/5")}>
                <div className="min-w-0 flex-1">
                  <Link href={`/deals/${r.deal.id}`} className="font-medium hover:text-link">{r.deal.name}</Link>
                  <div className="text-xs text-muted-foreground"><RecordCode>{r.deal.code}</RecordCode> · {r.deal.account.name} · {r.deal.owner.fullName} · {r.deal._count.lines} line{r.deal._count.lines === 1 ? "" : "s"}</div>
                  {"scope" in r && r.scope && <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.scope}</div>}
                  {"notes" in r && r.notes && <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.notes}</div>}
                  <div className="mt-1 text-sm font-medium" data-slot="todo">{r.todo}</div>
                </div>
                <StagePill stage={r.deal.stage} dot />
                <StatusPill status={r.overdue ? "OVERDUE" : r.status} dot />
                <span className={cn("w-28 text-right text-xs", r.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>Due {fmtDate(r.dueDate)} · {relativeDays(r.dueDate)}</span>
                <Button asChild size="sm"><Link href={`/deals/${r.deal.id}`}>Open deal</Link></Button>
              </div>
            ))}
          </div>
        )}
      </section>
      {w.done.length > 0 && (
        <section className="mt-8" aria-label="Recently finished">
          <SectionLabel>Recently finished</SectionLabel>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
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
