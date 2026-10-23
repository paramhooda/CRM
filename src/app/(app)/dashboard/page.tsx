import Link from "next/link";
import { Suspense } from "react";
import { History, Plus, Wallet, Target, Trophy, Percent, Sparkles, Layers, LineChart, Medal } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPresalesWork, getPurchaseWork } from "@/server/queries/work";
import { PresalesHome, PurchaseHome } from "@/components/home/work-home";
import { getDashboard, type Dashboard } from "@/server/queries/dashboard";
import { getOptions } from "@/server/queries/options";
import { describeStage, describeForecast } from "@/server/queries/reviews";
import { PageHeader, PageBody, StatTile, Meter, EmptyState } from "@/components/crm/page";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { Sparkline, ForecastBullets, WonTrendChart, BuStackBars } from "@/components/charts/charts";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { InsightList } from "@/components/dashboard/insight-list";
import { dashboardTabs } from "@/components/dashboard/tabs";
import { Avatar } from "@/components/crm/badges";
import { inr, pct } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/filters";
import { periodOptions } from "@/lib/fiscal";
import { HEALTH_LABEL, type HealthKey } from "@/lib/constants";

export const metadata = { title: "Dashboard" };

function greeting() {
  const hour = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  // Presales and Purchase get a work-focused home instead of sales analytics
  if (user.role === "PRESALES") return <PresalesHome name={user.name} data={await getPresalesWork(user)} />;
  if (user.role === "PURCHASE") return <PurchaseHome name={user.name} data={await getPurchaseWork(user)} />;
  const sp = await searchParams;
  const [d, options] = await Promise.all([getDashboard(user, sp), getOptions()]);
  const link = (extra: Record<string, string | null>, path = "/opportunities") => withParams(sp, extra, path);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={
          <span>
            {d.quarterLabel} · {user.role === "SALES" ? "Your book of business" : "All business units"}
            {d.periodLabel && <> · {d.periodLabel}</>}
          </span>
        }
        actions={
          <>
            <Button asChild>
              <Link href="/reviews"><History /> Review changes</Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/opportunities/new"><Plus /> New opportunity</Link>
            </Button>
          </>
        }
        tabs={dashboardTabs(sp, "overview")}
      >
        <div className="mt-6">
          <Suspense>
            <FilterBar
              options={options}
              periods={periodOptions()}
              dims={["bu", "cat", "sales", "presales", "oem", "fc", "atype", "rev"]}
              primary={user.role === "SALES" ? ["bu", "oem"] : ["bu", "sales"]}
              hideSales={user.role === "SALES"}
            />
          </Suspense>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-6">
        <Kpis d={d} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <NeedsAttention
              hot={d.hot}
              dying={d.dying}
              changes={d.changes.items.map(changeSummary)}
              concerns={d.concerns.map((c) => ({ ...c, href: link({ flag: c.code }) }))}
              sinceLabel={`since ${d.changes.sinceLabel}`}
              links={{ hot: link({ health: "HOT" }), dying: link({ health: "DYING" }), changes: "/reviews", concerns: link({}, "/opportunities") }}
            />
          </div>
          <Section title="Insights" description="What the numbers are saying" icon={<Sparkles />} tone="violet" action={<Link href={withParams(sp, {}, "/dashboard/insights")} className="text-[13px] text-primary hover:underline">More</Link>}>
            <InsightList insights={d.insights} />
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Quarter forecast" description="Won, commit and upside against target" icon={<Target />} tone="blue">
            <ForecastBullets rows={d.forecastRows} />
          </Section>
          <Section
            title="Bookings trend"
            description={d.targetsApplicable ? "Closed-won by month against target run-rate" : "Closed-won by month"}
            icon={<LineChart />}
            tone="green"
          >
            <WonTrendChart data={d.trend} showTarget={d.targetsApplicable} />
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <Section className="lg:col-span-3" title="Pipeline by business unit" description="Open value split by line item, stacked by forecast category" icon={<Layers />} tone="aqua">
            <BuStackBars data={d.byBu.filter((b) => b.total > 0)} />
          </Section>
          <Section className="lg:col-span-2" title="Top performers" description={`${d.fyLabel} bookings${d.targetsApplicable ? " and attainment" : ""}`} icon={<Medal />} tone="amber">
            <TopPerformers d={d} hrefFor={(id) => link({ sales: id }, "/dashboard")} />
          </Section>
        </div>
      </PageBody>
    </>
  );
}

type Change = Dashboard["changes"]["items"][number];
function changeSummary(c: Change) {
  let summary = "Updated";
  let tone = "slate";
  if (c.stageDir === "won") { summary = "Won"; tone = "green"; }
  else if (c.stageDir === "lost") { summary = "Lost"; tone = "red"; }
  else if (c.healthFrom && c.healthLabel === "DYING") { summary = "Now dying"; tone = "red"; }
  else if (c.closeDir === "pushed") { summary = "Close date pushed"; tone = "orange"; }
  else if (c.stageDir === "up") { summary = `→ ${describeStage(c.stageTo)}`; tone = "green"; }
  else if (c.stageDir === "down") { summary = `Back to ${describeStage(c.stageTo)}`; tone = "amber"; }
  else if (c.healthFrom) { summary = `Now ${HEALTH_LABEL[c.healthLabel as HealthKey].toLowerCase()}`; tone = c.healthLabel === "HOT" ? "orange" : "slate"; }
  else if (c.forecastFrom) { summary = `${describeForecast(c.forecastFrom)} → ${describeForecast(c.forecastTo)}`; tone = "blue"; }
  else if (c.amountFrom !== undefined) { const delta = c.amountTo! - c.amountFrom; summary = `${delta > 0 ? "+" : "−"}${inr(Math.abs(delta))}`; tone = delta > 0 ? "green" : "amber"; }
  else if (c.isNew) { summary = "New deal"; tone = "blue"; }
  return { id: c.id, name: c.name, account: c.account, owner: c.owner, amount: c.amount, summary, tone };
}

function Kpis({ d }: { d: Dashboard }) {
  const k = d.kpis;
  const qAtt = k.qTarget ? (k.wonQtd / k.qTarget) * 100 : null;
  const commitCover = k.qTarget ? ((k.wonQtd + k.commitQ) / k.qTarget) * 100 : null;
  const sinceReview = d.deltas.pipelineSinceReview;
  const winDelta = k.winRate !== null && d.deltas.winRatePrior !== null ? k.winRate - d.deltas.winRatePrior : null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Open pipeline"
        value={inr(k.openPipeline)}
        icon={<Wallet />}
        tone="blue"
        delta={sinceReview === null || Math.abs(sinceReview) < 1 ? null : { value: `${sinceReview > 0 ? "+" : "−"}${inr(Math.abs(sinceReview))}`, good: sinceReview > 0 }}
        chart={<Sparkline values={d.monthly.map((m) => m.created)} color="var(--s1)" label="Pipeline created per month" />}
        sub={<>{k.openCount} active deals · weighted {inr(k.weighted)}{sinceReview !== null && Math.abs(sinceReview) >= 1 && " · vs last review"}</>}
      />
      <StatTile
        label={`Commit · ${d.quarterLabel}`}
        value={inr(k.commitQ)}
        icon={<Target />}
        tone="violet"
        chart={commitCover !== null ? <Meter value={k.wonQtd + k.commitQ} max={k.qTarget} color="var(--s7)" track="var(--t-violet-bg)" /> : undefined}
        sub={<>{commitCover !== null ? `Won + commit covers ${pct(commitCover)} of target · ` : ""}+ {inr(k.upsideQ)} upside</>}
      />
      <StatTile
        label={`Won · ${d.quarterLabel}`}
        value={inr(k.wonQtd)}
        icon={<Trophy />}
        tone="green"
        delta={d.deltas.wonPrevSamePoint || k.wonQtd ? { value: `${d.deltas.wonVsPrevQuarter >= 0 ? "+" : "−"}${inr(Math.abs(d.deltas.wonVsPrevQuarter))}`, good: d.deltas.wonVsPrevQuarter >= 0 } : null}
        chart={qAtt !== null ? <Meter value={k.wonQtd} max={k.qTarget} color={qAtt >= 100 ? "var(--good)" : "var(--s6)"} track="var(--t-green-bg)" /> : undefined}
        sub={<>{qAtt !== null ? `${pct(qAtt)} of ${inr(k.qTarget)} target · ` : ""}vs same point last quarter</>}
      />
      <StatTile
        label="Win rate"
        value={k.winRate === null ? "—" : pct(k.winRate)}
        icon={<Percent />}
        tone="amber"
        delta={winDelta === null ? null : { value: `${winDelta >= 0 ? "+" : "−"}${Math.abs(Math.round(winDelta))} pts`, good: winDelta >= 0 }}
        chart={<Sparkline values={d.monthly.map((m) => m.won)} color="var(--s4)" label="Bookings per month" />}
        sub={<>{k.winRateValue === null ? "No closed deals" : `${pct(k.winRateValue)} by value`} · trailing 12 mo vs prior</>}
      />
    </div>
  );
}

function TopPerformers({ d, hrefFor }: { d: Dashboard; hrefFor: (id: string) => string }) {
  const rows = d.leaderboard.filter((r) => r.won > 0 || r.open > 0).slice(0, 6);
  if (!rows.length) return <EmptyState title="No sales activity in scope" />;
  const max = Math.max(1, ...rows.map((r) => r.won));
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r, i) => {
        const att = r.target ? (r.won / r.target) * 100 : null;
        return (
          <li key={r.id}>
            <Link href={hrefFor(r.id)} className="group grid grid-cols-[20px_28px_1fr_auto] items-center gap-3">
              <span className="text-xs tabular text-ink-3">{i + 1}</span>
              <Avatar name={r.name} className="size-7" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium group-hover:text-primary">{r.name}</p>
                <div className="mt-1.5">
                  {att !== null ? (
                    <Meter value={r.won} max={r.target} color={att >= 100 ? "var(--good)" : "var(--s1)"} />
                  ) : (
                    <Meter value={r.won} max={max} />
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-semibold tabular">{inr(r.won)}</p>
                <p className="text-[11px] tabular text-ink-3">{att !== null ? `${Math.round(att)}% of target` : `${inr(r.open)} open`}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
