import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BadgeCheck, CalendarClock, CalendarDays, CheckSquare, Footprints, Hourglass, Inbox, Percent, Target, Trophy, TriangleAlert } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { homeMetrics, type HomeWindow } from "@/server/services/metrics";
import { salesPeopleFor } from "@/server/services/people";
import { getSetting } from "@/server/services/settings";
import { dealListQuery } from "@/contracts/deals";
import { PageHero, HeroControl } from "@/components/crm/hero";
import { LineTabs } from "@/components/crm/line-tabs";
import { Segmented } from "@/components/crm/segmented";
import { SectionLabel } from "@/components/crm/section-label";
import { StatTile } from "@/components/crm/stat-tile";
import { FilterBar } from "@/components/crm/filter-bar";
import { DealFilters } from "@/components/crm/deal-filters";
import { BarChartCard, DonutCard, FlowCard, ChartCard } from "@/components/crm/charts";
import { MetricRow, MetricStrip } from "@/components/crm/metric-row";
import { ArrowLink } from "@/components/crm/link-arrow";
import { StagePill, BU_SOLID } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { RecordCode } from "@/components/crm/code";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/crm/states";
import { HeatCard, AgeingCard, LoadCard } from "./cards";
import { inr } from "@/domain/money";
import { fmtDate, relativeDays } from "@/lib/format";
import { queryString, type Query } from "@/lib/url-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

const windowSchema = z.enum(["30", "90", "fy"]);
const WINDOW_LABEL: Record<HomeWindow, string> = { "30": "last 30 days", "90": "last 90 days", fy: "this financial year" };

function greeting(now: Date) {
  const h = new Date(now.getTime() + 330 * 60_000).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function HomePage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor();
  if (actor.role === "PRESALES" || actor.role === "PURCHASE") redirect("/my-work");
  const q = await searchParams;
  const parsed = dealListQuery.safeParse(q);
  const filters = parsed.success ? parsed.data : {};
  const win = windowSchema.safeParse(q.days);
  const window: HomeWindow = win.success ? win.data : "30";
  const tab = q.tab === "attention" || q.tab === "pipeline" ? q.tab : "overview";
  const [m, owners, alerts] = await Promise.all([homeMetrics(actor, filters, window), salesPeopleFor(actor), getSetting("alerts")]);
  const now = new Date();
  const dealsHref = (patch: Record<string, string | null>) => `/deals${queryString(q, { open: "true", days: null, tab: null, ...patch })}`;
  const here = (patch: Record<string, string | null>) => `/home${queryString(q, patch)}`;
  const firstName = actor.fullName.split(" ")[0];
  const todoCount = m.todo.approvals + m.todo.pastCloseCount + m.todo.nextStepCount + m.todo.overdueRequests.length;
  const windowNote = `${longDay(m.window.from)} – ${longDay(m.window.to)}`;
  const manager = actor.role !== "SALES" && owners.length > 1;
  const showOverview = tab === "overview";
  const showAttention = tab === "overview" || tab === "attention";
  const showPipeline = tab === "overview" || tab === "pipeline";
  const BU_COLOUR = (token: string) => BU_SOLID[token] ?? "var(--primary)";

  return (
    <>
      <PageHero
        eyebrow={<><CalendarDays className="size-4" />{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</>}
        title={`${greeting(now)}, ${firstName}`}
        description={`Your pipeline, your team's deals and what needs you · ${m.period.fy} · ${m.period.quarterLabel}`}
        controls={
          <>
            <HeroControl label="Period">
              <Segmented options={[{ value: "30", label: "30 days", href: here({ days: null }) }, { value: "90", label: "90 days", href: here({ days: "90" }) }, { value: "fy", label: m.period.fy, href: here({ days: "fy" }) }]} value={window} aria-label="Period" />
            </HeroControl>
            {manager && (
              <HeroControl label="Scope">
                <FilterBar className="mb-0" filters={[{ key: "owner", label: "Sales person", allLabel: "Whole team", options: owners.map((o) => ({ value: o.id, label: o.fullName })), width: "w-56" }]} />
              </HeroControl>
            )}
          </>
        }
      />
      <LineTabs
        active={tab}
        tabs={[
          { key: "overview", label: "Overview", href: here({ tab: null }) },
          { key: "attention", label: "Needs attention", href: here({ tab: "attention" }), count: todoCount },
          { key: "pipeline", label: "Pipeline", href: here({ tab: "pipeline" }) },
        ]}
      />
      <p className="mb-6 text-sm text-muted-foreground">Showing <span className="font-medium text-foreground">{filters.owner ? owners.find((o) => o.id === filters.owner)?.fullName ?? "one person" : manager ? "whole team" : "your deals"} · {WINDOW_LABEL[window]} ({windowNote})</span></p>

      {(showOverview || showPipeline) && (
        <>
          <SectionLabel note={`Open now, and the ${WINDOW_LABEL[window]}`}>Sales</SectionLabel>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5" aria-label="Numbers">
            <StatTile label="Open pipeline" value={inr(m.kpis.openPipeline.value)} icon={Inbox} iconTone="blue" series={m.kpis.openPipeline.series} delta={{ pct: m.kpis.openPipeline.delta }} note={`${m.kpis.openPipeline.count} deals · ${m.kpis.openPipeline.opened} opened`} href={dealsHref({})} />
            <StatTile label={`Commit · ${m.period.quarter}`} value={inr(m.kpis.commitThisQuarter.value)} icon={Target} iconTone="green" tone={m.kpis.commitThisQuarter.target && m.kpis.commitThisQuarter.value >= m.kpis.commitThisQuarter.target ? "green" : "default"} series={m.kpis.commitThisQuarter.series} note={m.kpis.commitThisQuarter.target ? `of ${inr(m.kpis.commitThisQuarter.target)} target` : `${m.kpis.commitThisQuarter.count} deals`} href={dealsHref({ forecast: "COMMIT", period: "this-q" })} />
            <StatTile label={`Won · ${m.period.fy}`} value={inr(m.kpis.wonFytd.value)} icon={Trophy} iconTone="blue" series={m.kpis.wonFytd.series} delta={{ pct: m.kpis.wonFytd.delta }} note={m.kpis.wonFytd.target ? `${Math.round((m.kpis.wonFytd.value / m.kpis.wonFytd.target) * 100)}% of ${inr(m.kpis.wonFytd.target)}` : `${m.kpis.wonFytd.count} deals`} href={`/deals${queryString(q, { stage: "CLOSED_WON", period: "this-fy", days: null, tab: null })}`} />
            <StatTile label="Past close date" value={m.kpis.pastClose.count} tone={m.kpis.pastClose.count ? "red" : "default"} icon={TriangleAlert} iconTone="red" series={m.kpis.pastClose.series} note={m.kpis.pastClose.count ? `${inr(m.kpis.pastClose.value)} to re-date or close` : "every open deal is in date"} href={dealsHref({})} />
            <StatTile label="Avg expected GM" value={m.kpis.avgGm.pct === null ? "—" : `${m.kpis.avgGm.pct}%`} tone={m.kpis.avgGm.pct !== null && alerts.gmAmberBelowPct !== null && m.kpis.avgGm.pct < alerts.gmAmberBelowPct ? "amber" : "default"} icon={Percent} iconTone="amber" delta={m.kpis.avgGm.delta === null ? null : { pct: m.kpis.avgGm.delta }} note={`${m.kpis.avgGm.count} costed deals · win rate ${m.kpis.winRate.pct === null ? "—" : `${m.kpis.winRate.pct}%`}`} />
          </section>
        </>
      )}

      {showAttention && (
        <section className="mb-8" aria-label="To do">
          <SectionLabel note={todoCount ? `${todoCount} item${todoCount === 1 ? "" : "s"}` : "Nothing waiting on you"}>Needs your attention</SectionLabel>
          {todoCount === 0 ? (
            <EmptyState title="Nothing waiting on you" description="Close dates and next steps are up to date." className="py-8" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {m.todo.approvals > 0 && (
                <Link href="/approvals" className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-card transition-colors hover:border-border-strong">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-tint-blue text-tint-blue-foreground"><CheckSquare className="size-5" /></span>
                  <div className="flex-1 text-[15px]"><span className="font-semibold">{m.todo.approvals} price approval{m.todo.approvals > 1 ? "s" : ""}</span> waiting on you</div>
                </Link>
              )}
              {m.todo.overdueRequests.map((r) => (
                <Link key={r.id} href={`/deals/${r.deal.id}`} className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-card transition-colors hover:border-border-strong">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-tint-amber text-tint-amber-foreground"><Hourglass className="size-5" /></span>
                  <div className="flex-1 text-[15px]"><RecordCode className="text-foreground">{r.deal.code}</RecordCode> · your request to {r.assignedTo} was due {fmtDate(r.dueDate)}</div>
                </Link>
              ))}
              {m.todo.pastClose.length > 0 && (
                <Card className="rounded-2xl md:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[17px]"><CalendarClock className="size-5 text-tint-red-foreground" /> Close date passed ({m.todo.pastCloseCount})</CardTitle></CardHeader>
                  <CardContent className="divide-y divide-border p-0">
                    {m.todo.pastClose.map((d) => (
                      <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center gap-4 px-5 py-2.5 text-sm hover:bg-muted/50">
                        <RecordCode className="w-28 shrink-0">{d.code}</RecordCode>
                        <span className="min-w-0 flex-1 truncate">{d.name} <span className="text-muted-foreground">· {d.account}</span></span>
                        <StagePill stage={d.stage as never} dot />
                        <Money value={d.dealValue} className="w-20 text-right font-medium" />
                        <span className="w-20 text-right text-xs font-medium text-tint-red-foreground">{relativeDays(d.expectedCloseDate)}</span>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
              {m.todo.nextStep.length > 0 && (
                <Card className="rounded-2xl md:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[17px]"><Footprints className="size-5 text-tint-amber-foreground" /> Next step missing or overdue ({m.todo.nextStepCount})</CardTitle></CardHeader>
                  <CardContent className="divide-y divide-border p-0">
                    {m.todo.nextStep.map((d) => (
                      <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center gap-4 px-5 py-2.5 text-sm hover:bg-muted/50">
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
      )}

      {showPipeline && (
        <>
          <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
            <FlowCard
              title="Deal flow"
              description={`Opened and won per day; a bar opens that day's deals · ${windowNote}`}
              views={[
                { key: "flow", label: "Flow", series: [{ key: "created", label: "Opened", colour: "var(--chart-1)" }, { key: "won", label: "Won", colour: "var(--chart-3)" }], data: m.flow },
                { key: "stages", label: "Stage moves", series: [{ key: "advanced", label: "Advanced", colour: "var(--chart-1)" }, { key: "setBack", label: "Set back or held", colour: "var(--chart-4)" }, { key: "closed", label: "Closed", colour: "var(--chart-3)" }], data: m.flow },
                { key: "value", label: "Value", unit: "money", series: [{ key: "createdValue", label: "Opened", colour: "var(--chart-1)" }, { key: "wonValue", label: "Won", colour: "var(--chart-3)" }], data: m.flow },
              ]}
              link={{ href: "/reviews", label: "Pipeline review" }}
            />
            <DonutCard
              title={`Forecast · ${m.period.quarter}`}
              description="Open deals closing this quarter by forecast category; a slice opens the list"
              data={m.charts.byForecast.map((b, i) => ({ key: b.key, label: b.label, value: b.value, colour: ["var(--chart-mag-5)", "var(--chart-mag-3)", "var(--chart-mag-1)"][i], href: dealsHref({ forecast: b.key }) }))}
              unit="money"
              centre={{ value: inr(m.kpis.commitThisQuarter.value), label: "commit this quarter", tone: m.kpis.commitThisQuarter.target && m.kpis.commitThisQuarter.value >= m.kpis.commitThisQuarter.target ? "green" : "default" }}
              footer={m.kpis.commitThisQuarter.target ? <>Target: <span className="font-medium text-foreground">{inr(m.kpis.commitThisQuarter.target)}</span> · {m.kpis.commitThisQuarter.count} commit deals</> : `${m.kpis.commitThisQuarter.count} commit deals`}
            />
          </div>
          <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
            <HeatCard week={m.heat.week} window={m.heat.window} weekCount={m.heat.weekCount} windowCount={m.heat.windowCount} from={longDay(m.window.from)} to={longDay(m.window.to)} />
            <DonutCard
              title="Open by business unit"
              description="Open line value by business unit; a slice opens the deals"
              action={<ArrowLink href={dealsHref({})}>All open</ArrowLink>}
              data={m.charts.byBusinessUnit.map((b) => ({ key: b.key, label: b.label, value: b.value, colour: BU_COLOUR(b.colourToken ?? ""), href: dealsHref({ bu: b.key }) }))}
              unit="money"
              centre={{ value: m.kpis.openPipeline.count, label: "open deals" }}
              footer={<>Past close date: <span className="font-medium text-foreground">{m.businessUnits.map((b) => `${b.pastClose} ${b.name}`).join(" · ") || "none"}</span></>}
            />
          </div>
          <div className="mb-6 grid gap-6 lg:grid-cols-3">
            <AgeingCard all={m.ageing.all} pastClose={m.ageing.pastClose} open={m.kpis.openPipeline.count} overdue={m.kpis.pastClose.count} />
            <LoadCard byOwner={m.charts.byOwner} byBusinessUnit={m.charts.byBusinessUnit} dealsHref={dealsHref({})} />
            <ChartCard title="Price approvals" description={`Open now, and decided in the ${WINDOW_LABEL[window]}`} action={<ArrowLink href="/approvals">My approvals</ArrowLink>}>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Pending", value: m.approvalsWindow.pending, tone: m.approvalsWindow.pending ? "text-tint-amber-foreground" : "" },
                  { label: "Approved", value: m.approvalsWindow.approved, tone: "text-tint-green-foreground" },
                  { label: "Rejected", value: m.approvalsWindow.rejected, tone: m.approvalsWindow.rejected ? "text-tint-red-foreground" : "" },
                ].map((x) => (
                  <div key={x.label}>
                    <div className="text-sm text-muted-foreground">{x.label}</div>
                    <div className={cn("mt-1 text-3xl font-bold tracking-tight tabular", x.tone)}>{x.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><BadgeCheck className="size-4 text-tint-green-foreground" />{m.todo.approvals ? `${m.todo.approvals} waiting on you` : "Nothing waiting on you"}</div>
            </ChartCard>
          </div>

          <ChartCard title="Stage performance" description={`Open deals in each stage, how long they have sat there, and what moved on ${windowNote}`} action={<ArrowLink href="/reviews">Pipeline review</ArrowLink>} className="mb-8">
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-background text-left text-xs text-muted-foreground">
                  <tr><th className="px-5 py-2.5 font-medium">Stage</th><th className="px-3 py-2.5 text-right font-medium">Open</th><th className="px-3 py-2.5 text-right font-medium">Value</th><th className="px-3 py-2.5 text-right font-medium">Median days in stage</th><th className="px-3 py-2.5 text-right font-medium">Moved on</th><th className="px-3 py-2.5 text-right font-medium">Won from here</th><th className="px-5 py-2.5 text-right font-medium">Lost or dropped</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {m.stagePerformance.map((r) => (
                    <tr key={r.stage}>
                      <td className="px-5 py-3"><Link href={dealsHref({ stage: r.stage })}><StagePill stage={r.stage} dot /></Link></td>
                      <td className="px-3 py-3 text-right tabular">{r.open}</td>
                      <td className="px-3 py-3 text-right tabular">{inr(r.value)}</td>
                      <td className="px-3 py-3 text-right tabular">{r.medianDays === null ? "—" : `${Math.round(r.medianDays)}d`}</td>
                      <td className="px-3 py-3 text-right tabular">{r.movedOn}</td>
                      <td className={cn("px-3 py-3 text-right tabular", r.wonFromHere && "font-medium text-tint-green-foreground")}>{r.wonFromHere}</td>
                      <td className={cn("px-5 py-3 text-right tabular", r.lostFromHere && "font-medium text-tint-red-foreground")}>{r.lostFromHere}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <SectionLabel note="Each number is the unit's own open pipeline">Business units</SectionLabel>
          <div className="mb-8 flex flex-col gap-4">
            {m.businessUnits.length === 0 && <EmptyState title="No open lines" className="py-8" />}
            {m.businessUnits.map((b) => (
              <MetricRow
                key={b.id}
                icon={Inbox}
                iconTone="blue"
                title={<span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: BU_COLOUR(b.colourToken) }} />{b.name}</span>}
                subtitle={`${b.opened} opened · ${b.won} won ${WINDOW_LABEL[window]}`}
                href={dealsHref({ bu: b.id })}
                linkLabel="Open deals"
                metrics={[
                  { label: "Open deals", value: b.open },
                  { label: "Line value", value: inr(b.value) },
                  { label: "Expected GM", value: b.gmPct === null ? "—" : `${b.gmPct}%`, tone: b.gmPct !== null && alerts.gmAmberBelowPct !== null && b.gmPct < alerts.gmAmberBelowPct ? "amber" : "default" },
                  { label: "Past close date", value: b.pastClose, tone: b.pastClose ? "red" : "default" },
                  { label: "No next step", value: b.noNextStep, tone: b.noNextStep ? "amber" : "default" },
                ]}
              />
            ))}
          </div>

          <SectionLabel note="Accounts, contacts and leads in your scope">Accounts</SectionLabel>
          <MetricStrip
            className="mb-8"
            metrics={[
              { label: "Active accounts", value: m.accounts.active },
              { label: "With open deals", value: m.accounts.withOpenDeals },
              { label: `New ${WINDOW_LABEL[window]}`, value: m.accounts.fresh, tone: m.accounts.fresh ? "green" : "default" },
              { label: "New leads", value: m.accounts.leadsNew, tone: m.accounts.leadsNew ? "blue" : "default" },
              { label: "Leads converted", value: m.accounts.leadsConverted, tone: m.accounts.leadsConverted ? "green" : "default" },
              { label: "Contacts", value: m.accounts.contacts },
            ]}
          />

          <SectionLabel note="Line value of open deals; filter by business unit, Sub BU or OEM">Pipeline by</SectionLabel>
          <DealFilters owners={owners} period={true} search={false} />
          <div className="grid gap-6 md:grid-cols-2">
            <BarChartCard title="By stage" description="Open deals" data={m.charts.byStage} colour="stage" link={{ base: dealsHref({}), param: "stage" }} />
            <BarChartCard title="By OEM" description="Top 10 by line value" data={m.charts.byOem} link={{ base: dealsHref({}), param: "oem" }} />
            <BarChartCard title="By Sub BU" description="Top 12 by line value" data={m.charts.bySubBusinessUnit} link={{ base: dealsHref({}), param: "sub_bu" }} />
            <BarChartCard title="By business unit" description="Line value by BU" data={m.charts.byBusinessUnit} colour="bu" link={{ base: dealsHref({}), param: "bu" }} />
          </div>
        </>
      )}
    </>
  );
}
