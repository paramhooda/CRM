import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CheckSquare, Footprints, Hourglass } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { homeMetrics } from "@/server/services/metrics";
import { salesPeopleFor } from "@/server/services/people";
import { dealListQuery } from "@/contracts/deals";
import { PageHeader } from "@/components/crm/page-header";
import { KpiTile } from "@/components/crm/kpi-tile";
import { DealFilters } from "@/components/crm/deal-filters";
import { BarChartCard } from "@/components/crm/charts";
import { StagePill } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inr } from "@/domain/money";
import { fmtDate, relativeDays } from "@/lib/format";
import { queryString, type Query } from "@/lib/url-state";
import { RecordCode } from "@/components/crm/code";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor();
  if (actor.role === "PRESALES" || actor.role === "PURCHASE") redirect("/my-work");
  const q = await searchParams;
  const parsed = dealListQuery.safeParse(q);
  const filters = parsed.success ? parsed.data : {};
  const [m, owners] = await Promise.all([homeMetrics(actor, filters), salesPeopleFor(actor)]);
  const dealsHref = (patch: Record<string, string | null>) => `/deals${queryString(q, { open: "true", ...patch })}`;
  const firstName = actor.fullName.split(" ")[0];
  const todoCount = m.todo.approvals + m.todo.pastCloseCount + m.todo.nextStepCount + m.todo.overdueRequests.length;

  return (
    <>
      <PageHeader title={`Good day, ${firstName}`} description={`${m.period.fy} · ${m.period.quarterLabel}`} />
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5" aria-label="Numbers">
        <KpiTile label="Open pipeline" value={inr(m.kpis.openPipeline.value)} sub={`${m.kpis.openPipeline.count} deals`} href={dealsHref({})} />
        <KpiTile label={`Commit · ${m.period.quarter}`} value={inr(m.kpis.commitThisQuarter.value)} sub={m.kpis.commitThisQuarter.target ? `of ${inr(m.kpis.commitThisQuarter.target)} target` : `${m.kpis.commitThisQuarter.count} deals`} href={dealsHref({ forecast: "COMMIT", period: "this-q" })} tone={m.kpis.commitThisQuarter.target && m.kpis.commitThisQuarter.value >= m.kpis.commitThisQuarter.target ? "good" : "default"} />
        <KpiTile label={`Won · ${m.period.fy}`} value={inr(m.kpis.wonFytd.value)} sub={m.kpis.wonFytd.target ? `${Math.round((m.kpis.wonFytd.value / m.kpis.wonFytd.target) * 100)}% of ${inr(m.kpis.wonFytd.target)}` : `${m.kpis.wonFytd.count} deals`} href={`/deals${queryString(q, { stage: "CLOSED_WON", period: "this-fy" })}`} />
        <KpiTile label="Win rate" value={m.kpis.winRate.pct === null ? "—" : `${m.kpis.winRate.pct}%`} sub={`${m.kpis.winRate.won} won · ${m.kpis.winRate.lost} lost this year`} />
        <KpiTile label="Average expected GM" value={m.kpis.avgGm.pct === null ? "—" : `${m.kpis.avgGm.pct}%`} sub={`${m.kpis.avgGm.count} costed deals`} tone={m.kpis.avgGm.pct !== null && m.kpis.avgGm.pct < 12 ? "warn" : "default"} />
      </section>

      <section className="mt-6" aria-label="To do">
        <h2 className="mb-2 text-sm font-semibold">Needs your attention{todoCount ? <span className="ml-2 rounded-md bg-selected px-1.5 py-0.5 text-xs font-medium tabular text-selected-foreground">{todoCount}</span> : null}</h2>
        {todoCount === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted-foreground">Nothing waiting on you. Close dates and next steps are up to date.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {m.todo.approvals > 0 && (
              <Link href="/approvals" className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-border-strong">
                <CheckSquare className="size-5 text-primary" />
                <div className="flex-1 text-sm"><span className="font-medium">{m.todo.approvals} price approval{m.todo.approvals > 1 ? "s" : ""}</span> waiting on you</div>
              </Link>
            )}
            {m.todo.overdueRequests.map((r) => (
              <Link key={r.id} href={`/deals/${r.deal.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-border-strong">
                <Hourglass className="size-5 text-warning" />
                <div className="flex-1 text-sm"><RecordCode className="text-foreground">{r.deal.code}</RecordCode> · your request to {r.assignedTo} was due {fmtDate(r.dueDate)}</div>
              </Link>
            ))}
            {m.todo.pastClose.length > 0 && (
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="size-4 text-destructive" /> Close date passed ({m.todo.pastCloseCount})</CardTitle></CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {m.todo.pastClose.map((d) => (
                    <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50">
                      <RecordCode className="w-28 shrink-0">{d.code}</RecordCode>
                      <span className="min-w-0 flex-1 truncate">{d.name} <span className="text-muted-foreground">· {d.account}</span></span>
                      <StagePill stage={d.stage as never} />
                      <Money value={d.dealValue} className="w-20 text-right" />
                      <span className="w-20 text-right text-xs text-destructive">{relativeDays(d.expectedCloseDate)}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
            {m.todo.nextStep.length > 0 && (
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Footprints className="size-4 text-warning" /> Next step missing or overdue ({m.todo.nextStepCount})</CardTitle></CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {m.todo.nextStep.map((d) => (
                    <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50">
                      <RecordCode className="w-28 shrink-0">{d.code}</RecordCode>
                      <span className="min-w-0 flex-1 truncate">{d.name} <span className="text-muted-foreground">· {d.account}</span></span>
                      <span className="truncate text-xs text-muted-foreground">{d.nextStep ? `${d.nextStep} · ${relativeDays(d.nextStepDate)}` : "No next step"}</span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>

      <section className="mt-8" aria-label="Analytics">
        <h2 className="mb-3 text-sm font-semibold">Pipeline</h2>
        <DealFilters owners={owners} period={true} search={false} />
        <div className="grid gap-4 md:grid-cols-2">
          <BarChartCard title="By stage" description="Open deals" data={m.charts.byStage} colour="stage" link={{ base: dealsHref({}), param: "stage" }} />
          <BarChartCard title="By business unit" description="Line value by BU" data={m.charts.byBusinessUnit} colour="bu" link={{ base: dealsHref({}), param: "bu" }} />
          <BarChartCard title="By forecast" data={m.charts.byForecast} colour="stage" link={{ base: dealsHref({}), param: "forecast" }} />
          <BarChartCard title="By OEM" description="Top 10 by line value" data={m.charts.byOem} link={{ base: dealsHref({}), param: "oem" }} />
          <BarChartCard title="By Sub BU" description="Top 12 by line value" data={m.charts.bySubBusinessUnit} link={{ base: dealsHref({}), param: "sub_bu" }} />
          {m.charts.byOwner.length > 0 && <BarChartCard title="By sales person" data={m.charts.byOwner} link={{ base: dealsHref({}), param: "owner" }} />}
        </div>
      </section>
    </>
  );
}
