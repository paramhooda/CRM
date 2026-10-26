import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, CircleDashed, AlertOctagon, ListChecks, Gauge, Wallet, Target, Trophy, CalendarClock, Users, ThumbsUp,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { getPipelineReview } from "@/server/queries/pipeline-review";
import { PageHeader, PageBody, StatTile, EmptyState } from "@/components/crm/page";
import { Section } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Avatar } from "@/components/crm/badges";
import { ReviewNav, CompleteReview } from "@/components/reviews/review-controls";
import { ReviewDeals } from "@/components/reviews/review-board";
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
  const firstName = single ? r.scope.label.split(" ")[0] : null;
  const sameBaseline = new Set(r.baselines.map((b) => b.date.toISOString().slice(0, 10))).size <= 1;
  const b0 = r.baselines[0];
  const sinceLabel = !b0 ? "" : !sameBaseline ? "each person's last review" : b0.label === "last review" ? (single ? `${firstName}'s last review` : "the last review") : b0.label;
  const description = !b0 ? null : sameBaseline ? (
    <>Changes since {sinceLabel}: <span className="font-medium text-ink">{fmtDate(b0.date)}</span> ({relativeDays(b0.date)})</>
  ) : (
    <>Changes since each person&apos;s last review ({fmtDate(minDate(r.baselines), "short")} to {fmtDate(maxDate(r.baselines), "short")})</>
  );
  const m = r.metrics;
  const delta = (now: number, start: number) => {
    const d = now - start;
    return Math.abs(d) < 1 ? null : { value: `${d > 0 ? "+" : "−"}${inr(Math.abs(d))}`, good: d > 0 };
  };

  return (
    <>
      <PageHeader
        title={`Pipeline review · ${r.scope.label}`}
        description={description}
        actions={
          <CompleteReview
            who={r.scope.kind === "all" ? "all" : r.scope.selected}
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
            />
          </Suspense>
        </div>
      </PageHeader>

      <PageBody className="flex flex-col gap-6">
        {r.lastReview && (r.priorActions.length > 0 || r.lastReview.notes) && (
          <Section
            title="Agreed last time"
            description={`${fmtDate(r.lastReview.at)} · ${r.lastReview.by}${r.lastReview.notes ? ` · ${r.lastReview.notes}` : ""}`}
            icon={<ListChecks />}
            tone="violet"
            flush
          >
            {r.priorActions.length > 0 ? (
              <ul>
                {r.priorActions.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 border-t border-border px-5 py-2.5 text-[13px]">
                    {a.completedAt ? (
                      <CheckCircle2 className="size-4 shrink-0 text-[var(--t-green)]" />
                    ) : a.overdue ? (
                      <AlertOctagon className="size-4 shrink-0 text-[var(--t-red)]" />
                    ) : (
                      <CircleDashed className="size-4 shrink-0 text-ink-3" />
                    )}
                    <span className={cn("min-w-0 flex-1 truncate", a.completedAt && "text-ink-3 line-through")}>
                      {a.subject}
                      {a.deal && <Link href={`/opportunities/${a.deal.id}`} className="ml-1.5 text-xs text-ink-3 hover:text-primary">{a.deal.name}</Link>}
                    </span>
                    {!single && <span className="hidden text-xs text-ink-3 sm:inline">{a.owner}</span>}
                    <span className={cn("w-28 text-right text-xs", a.completedAt ? "text-[var(--t-green)]" : a.overdue ? "font-medium text-[var(--t-red)]" : "text-ink-3")}>
                      {a.completedAt ? "Done" : a.overdue ? `Overdue · ${fmtDate(a.dueAt, "short")}` : `Due ${fmtDate(a.dueAt, "short")}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Open pipeline" value={inr(m.total.now)} icon={<Wallet />} tone="blue" delta={delta(m.total.now, m.total.start)} sub={`${m.total.count} active deals`} />
          <StatTile label="Commit" value={inr(m.commit.now)} icon={<Target />} tone="violet" delta={delta(m.commit.now, m.commit.start)} sub={`${inr(m.upside.now)} best case`} />
          <StatTile label="Won" value={inr(m.won.value)} icon={<Trophy />} tone="green" sub={`${m.won.count} deal${m.won.count === 1 ? "" : "s"}${m.lost.count ? ` · ${m.lost.count} lost (${inr(m.lost.value)})` : ""}`} />
          <StatTile label="Close dates pushed" value={String(m.pushed.count)} icon={<CalendarClock />} tone="amber" sub={m.pushed.count ? `${inr(m.pushed.value)} pushed out` : "None in this window"} />
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Section className="lg:col-span-2" title="Raise in this call" description="Most urgent first, largest deals on top" icon={<AlertTriangle />} tone="red" flush>
            {r.agenda.length === 0 ? (
              <EmptyState title="Nothing urgent" description="No breached deadlines, slips or stalled deals." />
            ) : (
              r.agenda.map((g) => (
                <div key={g.key}>
                  <p className="border-t border-border bg-surface-2/50 px-5 py-1.5 text-xs">
                    <span className="font-medium" style={{ color: `var(--t-${g.tone})` }}>{g.title}</span>
                    <span className="text-ink-3"> · {g.items.length}</span>
                  </p>
                  <ul>
                    {g.items.slice(0, single ? 6 : 3).map((i) => (
                      <li key={i.dealId}>
                        <Link href={`/opportunities/${i.dealId}`} className="flex items-center gap-3 border-t border-border px-5 py-2.5 hover:bg-surface-2/70">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">{i.deal}{!single && <span className="font-normal text-ink-3"> · {i.owner}</span>}</p>
                            <p className="text-xs text-ink-3">{i.fact}</p>
                          </div>
                          <span className="w-20 shrink-0 text-right text-[13px] font-medium tabular">{inr(i.amount)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {g.items.length > (single ? 6 : 3) && (
                    <p className="border-t border-border px-5 py-2 text-xs text-ink-3">+{g.items.length - (single ? 6 : 3)} more in the deals list below</p>
                  )}
                </div>
              ))
            )}
          </Section>

          <Section title={single ? `How ${firstName} is doing` : "How the team is doing"} description={`Since ${sinceLabel}`} icon={<Gauge />} tone="green">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-2"><ThumbsUp className="size-3.5 text-[var(--t-green)]" /> Going well</p>
            <Points items={r.verdict.good} empty="Nothing stands out yet." />
            <p className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-medium text-ink-2"><AlertTriangle className="size-3.5 text-[var(--t-amber)]" /> Lagging</p>
            <Points items={r.verdict.bad} empty="No gaps against target or team." />
            {r.teamBench && single && (
              <p className="mt-5 text-[11px] text-ink-3">
                Compared with team medians:{" "}
                {[
                  `${Math.round(r.teamBench.activities)} activities`,
                  r.teamBench.newPipeline > 0 ? `${inr(r.teamBench.newPipeline)} new pipeline` : null,
                  r.teamBench.winRate !== null ? `${Math.round(r.teamBench.winRate)}% win rate` : null,
                ].filter(Boolean).join(", ")}.
              </p>
            )}
          </Section>
        </div>

        {r.rollup && r.rollup.length > 0 && (
          <Section title="By sales person" description="Click a name to review them" icon={<Users />} tone="aqua" flush>
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <THead>
                  <tr>
                    <TH>Sales person</TH>
                    <TH className="text-right">Open pipeline</TH>
                    <TH className="text-right">Won</TH>
                    <TH className="text-right">Pushed</TH>
                    <TH className="text-right">Past close date</TH>
                    <TH className="text-right">No activity 21d+</TH>
                    <TH className="text-right">Activities</TH>
                  </tr>
                </THead>
                <TBody>
                  {r.rollup.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <Link prefetch={false} href={`/reviews?who=${p.id}&since=${r.since}`} className="flex items-center gap-2 font-medium hover:text-primary">
                          <Avatar name={p.name} /> {p.name}
                        </Link>
                      </TD>
                      <TD className="text-right tabular">{inr(p.open)} <span className="text-xs text-ink-3">{p.openCount}</span></TD>
                      <TD className="text-right tabular">{p.wonCount ? inr(p.won) : "—"}</TD>
                      <Count n={p.pushedCount} />
                      <Count n={p.pastCloseCount} />
                      <Count n={p.quietCount} />
                      <TD className="text-right tabular">{p.activities}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </Section>
        )}

        <ReviewDeals deals={r.deals} closed={r.closed} showOwner={!single} sinceLabel={sinceLabel} />
      </PageBody>
    </>
  );
}

function Count({ n }: { n: number }) {
  return <TD className="text-right tabular" style={{ color: n ? "var(--t-red)" : "var(--ink-3)" }}>{n || "—"}</TD>;
}

function Points({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-[13px] leading-snug">
          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ink-3" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function minDate(xs: { date: Date }[]) {
  return new Date(Math.min(...xs.map((x) => x.date.getTime())));
}
function maxDate(xs: { date: Date }[]) {
  return new Date(Math.max(...xs.map((x) => x.date.getTime())));
}
