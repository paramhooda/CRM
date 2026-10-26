import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CheckCircle2, CircleDashed, AlertOctagon, ThumbsUp, TriangleAlert, ListChecks } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { getPipelineReview, CLOSE_PERIODS } from "@/server/queries/pipeline-review";
import { PageHeader, PageBody } from "@/components/crm/page";
import { Avatar } from "@/components/crm/badges";
import { ReviewNav, CompleteReview } from "@/components/reviews/review-controls";
import { ReviewBoard } from "@/components/reviews/review-board";
import { SINCE_OPTIONS } from "@/lib/review";
import { inr, fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchParams } from "@/lib/filters";

export const metadata = { title: "Pipeline review" };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!can.reviewPipeline(user)) redirect("/dashboard");
  const sp = await searchParams;
  const r = await getPipelineReview(user, sp);
  const single = r.scope.selected.length === 1 && r.scope.kind === "people" ? r.scope.selected[0]! : null;
  const sameBaseline = new Set(r.baselines.map((b) => b.date.toISOString().slice(0, 10))).size <= 1;
  const b0 = r.baselines[0];
  const baselineText = !b0
    ? null
    : sameBaseline
      ? <>Changes since {b0.label === "last review" ? <>{single ? `${b0.name.split(" ")[0]}'s` : "the"} last review</> : b0.label}: <span className="font-medium text-ink">{fmtDate(b0.date)}</span> ({relativeDays(b0.date)})</>
      : <>Changes since each person&apos;s last review ({fmtDate(minDate(r.baselines), "short")} to {fmtDate(maxDate(r.baselines), "short")})</>;
  const who: "all" | string[] = r.scope.kind === "all" ? "all" : r.scope.selected;

  return (
    <>
      <PageHeader
        title={single ? `Pipeline review · ${r.scope.label}` : `Pipeline review · ${r.scope.label}`}
        description={baselineText}
        actions={
          <CompleteReview
            who={who}
            scopeLabel={r.scope.label}
            people={r.people}
            deals={r.deals.map((d) => ({ id: d.id, name: d.name, ownerId: d.ownerId }))}
            defaultOwner={single ?? r.scope.selected[0] ?? user.id}
          />
        }
      >
        <div className="mt-6">
          <Suspense>
            <ReviewNav
              people={r.people}
              selected={r.scope.selected}
              scopeKind={r.scope.kind}
              hasTeam={r.hasTeam}
              canChooseOwner={r.canChooseOwner}
              since={r.since}
              sinceOptions={SINCE_OPTIONS}
              close={r.closeKey}
              closeOptions={CLOSE_PERIODS}
            />
          </Suspense>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-6">
        {r.lastReview && (r.priorActions.length > 0 || r.lastReview.notes) && (
          <section className="rounded-xl border border-border bg-surface">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="size-4 text-ink-3" /> From the last review</h2>
              <span className="text-xs text-ink-3">{fmtDate(r.lastReview.at)} · {r.lastReview.by}{r.lastReview.subjects.length ? "" : " · everyone"}</span>
            </header>
            {r.lastReview.notes && <p className="px-5 pt-3 text-[13px] text-ink-2">{r.lastReview.notes}</p>}
            {r.priorActions.length > 0 && (
              <ul className="px-2 py-2">
                {r.priorActions.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px]">
                    {a.completedAt ? (
                      <CheckCircle2 className="size-4 shrink-0 text-[var(--t-green)]" />
                    ) : a.overdue ? (
                      <AlertOctagon className="size-4 shrink-0 text-[var(--t-red)]" />
                    ) : (
                      <CircleDashed className="size-4 shrink-0 text-ink-3" />
                    )}
                    <span className={cn("min-w-0 flex-1 truncate", a.completedAt && "text-ink-3 line-through")}>
                      {a.subject}
                      {a.deal && <Link href={`/opportunities/${a.deal.id}`} className="ml-1.5 text-xs text-ink-3 no-underline hover:text-primary">· {a.deal.name}</Link>}
                    </span>
                    <span className="hidden text-xs text-ink-3 sm:inline">{a.owner}</span>
                    <span className={cn("w-24 text-right text-xs", a.completedAt ? "text-[var(--t-green)]" : a.overdue ? "font-medium text-[var(--t-red)]" : "text-ink-3")}>
                      {a.completedAt ? "Done" : a.overdue ? `Overdue ${fmtDate(a.dueAt, "short")}` : `Due ${fmtDate(a.dueAt, "short")}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {r.rollup && r.rollup.length > 0 && (
          <section className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-3">
                  <th scope="col" className="px-4 py-2.5 font-medium">Sales person</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Open pipeline</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Commit</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Won</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">New pipeline</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Pushed</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Past close date</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Quiet 21d+</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Coverage</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Activities</th>
                </tr>
              </thead>
              <tbody>
                {r.rollup.map((p) => {
                  const cov = p.remainingTarget && p.remainingTarget > 0 ? p.quarterPipeline / p.remainingTarget : null;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-hover/60">
                      <td className="px-4 py-2">
                        <Link prefetch={false} href={`/reviews?who=${p.id}&since=${r.since}&close=${r.closeKey}`} className="flex items-center gap-2 font-medium hover:text-primary">
                          <Avatar name={p.name} className="size-6 text-[10px]" /> {p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular">{inr(p.open)} <span className="text-xs text-ink-3">{p.openCount}</span></td>
                      <td className="px-3 py-2 text-right tabular">{inr(p.commit)}</td>
                      <td className="px-3 py-2 text-right tabular" style={{ color: p.wonCount ? "var(--t-green)" : undefined }}>{p.wonCount ? inr(p.won) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular">{p.newPipeline ? inr(p.newPipeline) : "—"}</td>
                      <Bad n={p.pushedCount} />
                      <Bad n={p.pastCloseCount} />
                      <Bad n={p.quietCount} />
                      <td className="px-3 py-2 text-right tabular" style={{ color: cov !== null && cov < 3 ? "var(--t-red)" : undefined }}>{cov === null ? "—" : `${cov.toFixed(1)}×`}</td>
                      <td className="px-4 py-2 text-right tabular">{p.activities}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-5">
          <section className="min-w-0 rounded-xl border border-border bg-surface lg:col-span-3">
            <header className="border-b border-border px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="size-4 text-[var(--t-red)]" /> Raise in this call</h2>
              <p className="text-xs text-ink-3">Ranked by urgency, largest deals first. Click a deal to open it.</p>
            </header>
            {r.agenda.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-ink-3">Nothing urgent: no breached deadlines, slips or stalled deals.</p>
            ) : (
              <div className="divide-y divide-border">
                {r.agenda.map((g) => (
                  <div key={g.key} className="px-5 py-3">
                    <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold" style={{ color: `var(--t-${g.tone === "slate" ? "slate" : g.tone})` }}>
                      {g.title} <span className="font-normal text-ink-3">{g.items.length}</span>
                    </p>
                    <ul className="flex flex-col">
                      {g.items.slice(0, single ? 6 : 4).map((i) => (
                        <li key={i.dealId}>
                          <Link href={`/opportunities/${i.dealId}`} className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-md px-2 py-1 hover:bg-surface-hover">
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium">{i.deal}{!single && <span className="font-normal text-ink-3"> · {i.owner}</span>}</span>
                              <span className="block text-xs text-ink-2">{i.fact}</span>
                            </span>
                            <span className="text-[13px] font-medium tabular">{inr(i.amount)}</span>
                          </Link>
                        </li>
                      ))}
                      {g.items.length > (single ? 6 : 4) && <li className="pt-1 text-xs text-ink-3">+{g.items.length - (single ? 6 : 4)} more in the deal list below</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
            <Verdict title={single ? "Done well" : "Going well"} icon={<ThumbsUp className="size-4 text-[var(--t-green)]" />} items={r.verdict.good} empty="Nothing stands out yet in this window." />
            <Verdict title={single ? "Lagging" : "Needs attention"} icon={<TriangleAlert className="size-4 text-[var(--t-amber)]" />} items={r.verdict.bad} empty="No gaps found against target and team benchmarks." />
            {r.teamBench && single && (
              <p className="px-1 text-[11px] text-ink-3">
                Benchmarks are team medians for the same window:{" "}
                {[
                  `${Math.round(r.teamBench.activities)} activities`,
                  r.teamBench.newPipeline > 0 ? `${inr(r.teamBench.newPipeline)} new pipeline` : null,
                  r.teamBench.winRate !== null ? `${Math.round(r.teamBench.winRate)}% win rate (12 months)` : null,
                ].filter(Boolean).join(", ")}.
              </p>
            )}
          </div>
        </div>

        <ReviewBoard metrics={r.metrics} deals={r.deals} closed={r.closed} showOwner={!single} />
      </PageBody>
    </>
  );
}

function Bad({ n }: { n: number }) {
  return <td className="px-3 py-2 text-right tabular" style={{ color: n ? "var(--t-red)" : "var(--ink-3)" }}>{n || "—"}</td>;
}

function Verdict({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: string[]; empty: string }) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</h2>
      </header>
      {items.length ? (
        <ul className="flex flex-col gap-2 px-5 py-3">
          {items.map((t) => (
            <li key={t} className="flex gap-2 text-[13px] leading-snug"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-3" />{t}</li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-[13px] text-ink-3">{empty}</p>
      )}
    </section>
  );
}

function minDate(xs: { date: Date }[]) {
  return new Date(Math.min(...xs.map((x) => x.date.getTime())));
}
function maxDate(xs: { date: Date }[]) {
  return new Date(Math.max(...xs.map((x) => x.date.getTime())));
}
