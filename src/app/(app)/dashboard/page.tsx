import Link from "next/link";
import { Suspense } from "react";
import { History, Plus, Wallet, Target, Trophy, Percent, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPresalesWork, getPurchaseWork } from "@/server/queries/work";
import { PresalesHome, PurchaseHome } from "@/components/home/work-home";
import { getDashboard, getActionItems, type Dashboard } from "@/server/queries/dashboard";
import { ActionList } from "@/components/dashboard/action-list";
import { isManager } from "@/lib/authz";
import { getOptions } from "@/server/queries/options";
import { describeStage, describeForecast } from "@/server/queries/reviews";
import { PageHeader, PageBody, StatTile } from "@/components/crm/page";
import { Section } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { ForecastCard, TrendCard, PipelineByCard, PerformersCard } from "@/components/dashboard/cards";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { InsightList } from "@/components/dashboard/insight-list";
import { dashboardTabs } from "@/components/dashboard/tabs";
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
  const sp = await searchParams;
  // Sent here from a page that is not for this role (requireRole)
  const notice = sp.denied === "1" ? "That page is for the sales team, so you are back on your work." : undefined;
  // Presales and Purchase get a work-focused home instead of sales analytics
  if (user.role === "PRESALES") return <PresalesHome name={user.name} data={await getPresalesWork(user)} notice={notice} />;
  if (user.role === "PURCHASE") return <PurchaseHome name={user.name} data={await getPurchaseWork(user)} notice={notice} />;
  const [d, options, actions] = await Promise.all([getDashboard(user, sp), getOptions(), getActionItems(user)]);
  const link = (extra: Record<string, string | null>, path = "/opportunities") => withParams(sp, extra, path);
  // Pipeline-by rows link to open deals with that line BU / category / OEM, optionally one forecast category
  const stackLinks = (r: Dashboard["pipelineBy"]["bu"][number], key: "bu" | "cat" | "oem") => {
    const base = { status: "open", period: d.periodLabel ? (sp.period as string) : null, [key]: r.id };
    return {
      ...r,
      href: link(base),
      hrefs: { Commit: link({ ...base, fc: "COMMIT" }), Upside: link({ ...base, fc: "UPSIDE" }), Pipeline: link({ ...base, fc: "PIPELINE" }) },
    };
  };

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={<span>{d.quarterLabel} · {user.role === "SALES" ? "Your deals" : "All business units"}</span>}
        actions={
          <Button asChild variant="primary">
            <Link href="/opportunities/new"><Plus /> New opportunity</Link>
          </Button>
        }
        tabs={dashboardTabs(sp, "overview")}
      />
      <PageBody className="flex flex-col gap-6">
        {/* First glance: the numbers, and what is waiting on you */}
        <Kpis
          d={d}
          links={{
            open: link({ status: "open" }),
            commit: link({ status: "open", fc: "COMMIT", period: "this-q" }),
            won: link({ status: "won", period: "this-q" }),
            winRate: link({}, "/reports"),
          }}
        />
        <ActionList items={actions} showOwner={isManager(user)} />

        {/* Below the fold: analytics, all following the filters */}
        <section aria-label="Analytics" className="mt-4 flex flex-col gap-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Analytics{d.periodLabel && <span className="ml-2 text-[13px] font-normal text-ink-3">{d.periodLabel}</span>}</h2>
            <Link href="/reviews" className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline"><History className="size-3.5" /> Review changes</Link>
          </div>
          <Suspense>
            <FilterBar me={user.id}
              options={options}
              periods={periodOptions()}
              dims={["bu", "cat", "sales", "presales", "oem", "fc", "atype", "rev"]}
              primary={user.role === "SALES" ? ["bu", "oem"] : ["bu", "sales"]}
              hideSales={user.role === "SALES"}
            />
          </Suspense>

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
            <ForecastCard
              rows={d.forecastRows.map((r) => ({
                ...r,
                hrefs: {
                  won: link({ status: "won", period: r.period }),
                  commit: link({ status: "open", fc: "COMMIT", period: r.period }),
                  upside: link({ status: "open", fc: "UPSIDE", period: r.period }),
                  pipeline: link({ status: "open", fc: "PIPELINE", period: r.period }),
                },
              }))}
            />
            <TrendCard data={d.trend.map((t) => ({ ...t, href: link({ status: "won", period: t.period }) }))} showTarget={d.targetsApplicable} />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3">
              <PipelineByCard
                by={{
                  bu: d.pipelineBy.bu.map((r) => stackLinks(r, "bu")),
                  category: d.pipelineBy.category.map((r) => stackLinks(r, "cat")),
                  oem: d.pipelineBy.oem.map((r) => stackLinks(r, "oem")),
                }}
              />
            </div>
            <div className="min-w-0 lg:col-span-2">
              <PerformersCard
                rows={d.leaderboard.map((r) => ({ ...r, href: link({ sales: r.id }, "/dashboard") }))}
                fyLabel={d.fyLabel}
                targetsApplicable={d.targetsApplicable}
              />
            </div>
          </div>
        </section>
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

/** Four numbers, one short line each */
function Kpis({ d, links }: { d: Dashboard; links: Record<"open" | "commit" | "won" | "winRate", string> }) {
  const k = d.kpis;
  const qAtt = k.qTarget ? (k.wonQtd / k.qTarget) * 100 : null;
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile label="Open pipeline" href={links.open} value={inr(k.openPipeline)} icon={<Wallet />} tone="blue" sub={`${k.openCount} open deals`} />
      <StatTile label={`Commit · ${d.quarterLabel}`} href={links.commit} value={inr(k.commitQ)} icon={<Target />} tone="violet" sub={`+ ${inr(k.upsideQ)} upside`} />
      <StatTile label={`Won · ${d.quarterLabel}`} href={links.won} value={inr(k.wonQtd)} icon={<Trophy />} tone="green" sub={qAtt !== null ? `${pct(qAtt)} of ${inr(k.qTarget)} target` : "This quarter"} />
      <StatTile label="Win rate" href={links.winRate} value={k.winRate === null ? "—" : pct(k.winRate)} icon={<Percent />} tone="amber" sub="Last 12 months" />
    </div>
  );
}
