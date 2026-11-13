import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { pipelineReview } from "@/server/services/reviews";
import { salesPeopleFor } from "@/server/services/people";
import { NotFound, ValidationError } from "@/server/errors";
import { can } from "@/domain/permissions";
import { FLAG_LABEL } from "@/domain/review";
import { PageHeader } from "@/components/crm/page-header";
import { KpiTile } from "@/components/crm/kpi-tile";
import { StagePill, ForecastPill, NeutralPill } from "@/components/crm/pills";
import { Money, Pct } from "@/components/crm/money";
import { EmptyState } from "@/components/crm/states";
import { Button } from "@/components/ui/button";
import { ReviewControls } from "./review-controls";
import { MarkReviewed } from "./mark-reviewed";
import { fmtDate, inr } from "@/lib/format";
import { fieldLabel } from "@/lib/labels";
import { STAGE_META, type Stage } from "@/domain/stages";
import { cn } from "@/lib/utils";
import { RecordCode } from "@/components/crm/code";

export const metadata: Metadata = { title: "Pipeline review" };

const show = (field: string, v: string | null) => (v === null ? "—" : field === "stage" && v in STAGE_META ? STAGE_META[v as Stage].label : field === "dealValue" ? inr(v) : field === "expectedGmPct" ? `${v}%` : v);

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ scope?: string; scope_user_id?: string; since?: string; show?: string }> }) {
  const actor = await requireActor();
  if (!can(actor.role, "reviews.view")) redirect("/");
  const q = await searchParams;
  const scope = (["rep", "team", "everyone"].includes(q.scope ?? "") ? q.scope : actor.role === "SALES" ? "rep" : "everyone") as "rep" | "team" | "everyone";
  const since = q.since ?? "last";
  const people = await salesPeopleFor(actor);
  let r: Awaited<ReturnType<typeof pipelineReview>> | null = null;
  let problem: string | null = null;
  try {
    r = await pipelineReview(actor, { scope, scopeUserId: q.scope_user_id ?? null, since });
  } catch (e) {
    if (e instanceof NotFound || e instanceof ValidationError) problem = e.message;
    else throw e;
  }
  const showAll = q.show === "all";
  const shown = r ? (showAll ? r.deals : r.deals.filter((d) => d.flags.length || d.changes.isNew || Object.keys(d.changes.changes).length)) : [];
  return (
    <>
      <PageHeader title="Pipeline review" description="What changed since the last review, what needs raising, and how each person is doing." actions={<Button asChild variant="outline" size="sm"><Link href="/reviews/history"><History /> Past reviews</Link></Button>} />
      <ReviewControls people={people.filter((p) => p.role !== "ADMIN")} scope={scope} />
      {problem && <EmptyState title="Can't build that review" description={problem} />}
      {r && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Summary">
            <KpiTile label="Deals in scope" value={r.deals.length} />
            <KpiTile label="Changed since" value={r.changed} sub={since === "last" ? "since the last review" : `in the window`} />
            <KpiTile label="Flagged" value={r.flagged} tone={r.flagged ? "warn" : "default"} />
            <KpiTile label="People" value={r.people.length} />
          </section>

          <section className="mt-6" aria-label="People">
            <h2 className="mb-2 text-sm font-semibold">By person</h2>
            {r.people.length === 0 ? (
              <EmptyState title="No sales people in this scope" className="py-8" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {r.people.map((p) => (
                  <div key={p.user.id} className="rounded-xl border border-border bg-card p-4 text-sm shadow-card">
                    <div className="flex items-baseline justify-between">
                      <div className="font-semibold">{p.user.fullName}</div>
                      <div className="text-xs text-muted-foreground">{p.deals} deals · since {fmtDate(p.since)}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted-foreground">Won</div><div className="font-medium"><Money value={p.summary.wonValue} /></div></div>
                      <div><div className="text-muted-foreground">Commit + Upside</div><div className="font-medium"><Money value={p.summary.commitUpside} /></div></div>
                      <div><div className="text-muted-foreground">Target (Q)</div><div className="font-medium">{p.summary.target === null ? "—" : inr(p.summary.target)}</div></div>
                    </div>
                    {p.summary.doneWell.length > 0 && <ul className="mt-3 list-disc pl-4 text-xs text-success">{p.summary.doneWell.map((x) => <li key={x}>{x}</li>)}</ul>}
                    {p.summary.lagging.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-destructive">{p.summary.lagging.map((x) => <li key={x}>{x}</li>)}</ul>}
                    {p.summary.doneWell.length === 0 && p.summary.lagging.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Nothing to raise.</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6" aria-label="Deals">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{showAll ? "All deals" : "Deals that changed or need raising"}</h2>
              <Link href={`/reviews?${new URLSearchParams({ ...(q.scope ? { scope: q.scope } : {}), ...(q.scope_user_id ? { scope_user_id: q.scope_user_id } : {}), ...(q.since ? { since: q.since } : {}), ...(showAll ? {} : { show: "all" }) }).toString()}`} className="text-xs text-link hover:underline">{showAll ? "Show only changed or flagged" : `Show all ${r.deals.length} deals`}</Link>
            </div>
            {shown.length === 0 ? (
              <EmptyState title={r.deals.length === 0 ? "No deals in scope" : "Nothing changed and nothing is flagged"} description={r.deals.length ? "Use the link above to see every deal." : undefined} className="py-8" />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-background text-left text-xs text-muted-foreground">
                      <tr><th className="px-3 py-2 font-medium">Deal</th><th className="px-3 py-2 font-medium">Owner</th><th className="px-3 py-2 font-medium">Stage</th><th className="px-3 py-2 text-right font-medium">Value</th><th className="px-3 py-2 text-right font-medium">GM</th><th className="px-3 py-2 font-medium">Close</th><th className="px-3 py-2 font-medium">Changes</th><th className="px-3 py-2 font-medium">Flags</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {shown.map((d) => {
                        const changes = Object.entries(d.changes.changes);
                        return (
                          <tr key={d.id} className={cn("align-top", d.flags.length && "bg-warning/5")}>
                            <td className="px-3 py-2"><Link href={`/deals/${d.id}`} className="font-medium hover:text-link">{d.name}</Link><div className="text-xs text-muted-foreground"><RecordCode>{d.code}</RecordCode> · {d.account.name}</div></td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs">{d.owner.fullName}</td>
                            <td className="px-3 py-2"><StagePill stage={d.stage} /><div className="mt-1 text-[11px] text-muted-foreground">{d.daysInStage}d</div></td>
                            <td className="whitespace-nowrap px-3 py-2 text-right"><Money value={d.dealValue} /><div className="mt-1"><ForecastPill forecast={d.forecastCategory} /></div></td>
                            <td className="px-3 py-2 text-right"><Pct value={d.expectedGmPct} /></td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(d.expectedCloseDate)}</td>
                            <td className="px-3 py-2 text-xs">
                              {d.changes.isNew && <div className="text-success">New deal</div>}
                              {changes.length === 0 && !d.changes.isNew && <span className="text-muted-foreground">No change</span>}
                              {changes.map(([f, c]) => (
                                <div key={f}><span className="text-muted-foreground">{fieldLabel(f)}:</span> {show(f, c.from)} → <span className="font-medium">{show(f, c.to)}</span></div>
                              ))}
                            </td>
                            <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{d.flags.map((f) => <NeutralPill key={f} className="bg-stage-proposal text-stage-proposal-foreground">{FLAG_LABEL[f]}</NeutralPill>)}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
          {can(actor.role, "reviews.mark") && <MarkReviewed scope={scope} scopeUserId={r.scopeUserId} since={since} people={r.people.length} />}
        </>
      )}
    </>
  );
}
