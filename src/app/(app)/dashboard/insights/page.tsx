import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  Workflow, Filter, Repeat2, HeartPulse, Flame, Skull, AlertTriangle, Boxes, Factory, Package, Layers, Hourglass,
  Percent, RefreshCcw, Sparkles, CalendarClock, ClipboardList, Calculator,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/server/queries/dashboard";
import { getReports } from "@/server/queries/reports";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, EmptyState, Meter } from "@/components/crm/page";
import { Section } from "@/components/ui/card";
import { FilterBar } from "@/components/filters/filter-bar";
import { FlowChart, Funnel, BarList, ColumnChart, SegmentBar } from "@/components/charts/charts";
import { StageBadge } from "@/components/crm/badges";
import { InsightList } from "@/components/dashboard/insight-list";
import { dashboardTabs } from "@/components/dashboard/tabs";
import { CalendarCard, OemMixCard } from "@/components/dashboard/cards";
import { inr, fmtDate } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/filters";
import { periodOptions } from "@/lib/fiscal";
import { HEALTH_LABEL } from "@/lib/constants";

export const metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (user.role === "PRESALES" || user.role === "PURCHASE") redirect("/reports");
  const sp = await searchParams;
  const [d, r, options] = await Promise.all([getDashboard(user, sp), getReports(user, sp), getOptions()]);
  const link = (extra: Record<string, string | null>, path = "/opportunities") => withParams(sp, extra, path);
  const mixTotal = d.revenueMix.oneTime + d.revenueMix.arr;
  // Bookings default to the fiscal year to date unless a period filter is set
  const bookingsPeriod = typeof sp.period === "string" ? sp.period : "this-fy";

  return (
    <>
      <PageHeader
        title="Insights"
        description={`Deeper analysis of pipeline, conversion and bookings · ${d.periodLabel ?? `${d.fyLabel} to date`}`}
        tabs={dashboardTabs(sp, "insights")}
      >
        <div className="mt-6">
          <Suspense>
            <FilterBar me={user.id}
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
        {d.insights.length > 4 && (
          <Section title="All findings" description="Ranked by impact" icon={<Sparkles />} tone="violet">
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              <InsightList insights={d.insights} max={8} />
            </div>
          </Section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Pipeline flow" description="Value of new pipeline created vs closed-won, by month" icon={<Workflow />} tone="blue">
            <FlowChart data={d.monthly.map((m) => ({ ...m, hrefCreated: link({ created: m.period, period: null }), hrefWon: link({ status: "won", period: m.period }) }))} />
          </Section>
          <CalendarCard data={d.closingCalendar.map((w) => ({ ...w, href: link({ status: "open", period: w.period }) }))} overdue={d.overdueOpen} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Stage funnel" description="Open value and count per stage" icon={<Filter />} tone="blue">
            <Funnel data={d.funnel.map((f) => ({ ...f, href: link({ stage: f.key, status: null }) }))} />
          </Section>
          <Section title="Stage conversion" description="Share of deals that reached a stage and moved on to the next" icon={<Repeat2 />} tone="aqua">
            <div className="flex flex-col gap-4">
              {r.conversion.map((c) => (
                <div key={c.from}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="text-ink-2">{c.from} <span className="text-ink-3">→</span> {c.to}</span>
                    <span className="font-medium tabular">{c.rate}% <span className="text-xs font-normal text-ink-3">of {c.n}</span></span>
                  </div>
                  <Meter value={c.rate} max={100} color="var(--s3)" track="var(--t-aqua-bg)" />
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section title="Bookings by business unit, OEM and product" description={`Closed-won value split by line item · ${d.periodLabel ?? `${d.fyLabel} to date`}`} icon={<Boxes />} tone="green">
          {d.bookingsMix.bu.length === 0 ? (
            <EmptyState title="No bookings in this period" />
          ) : (
            <div className="grid gap-8 lg:grid-cols-3">
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink-2"><Layers className="size-3.5" /> Business unit</p>
                <BarList color="var(--s6)" data={d.bookingsMix.bu.map((x) => ({ label: x.key, value: x.amount, href: x.id ? link({ status: "won", bu: x.id, period: bookingsPeriod }) : undefined }))} />
              </div>
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink-2"><Factory className="size-3.5" /> OEM</p>
                <BarList color="var(--s6)" data={d.bookingsMix.oem.map((x) => ({ label: x.key, value: x.amount, href: x.id ? link({ status: "won", oem: x.id, period: bookingsPeriod }) : undefined }))} />
              </div>
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink-2"><Package className="size-3.5" /> Top products</p>
                <BarList color="var(--s6)" data={d.bookingsMix.product.map((x) => ({ label: String(x.key), value: x.amount, href: `/products?q=${encodeURIComponent(String(x.key))}` }))} />
              </div>
            </div>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-3">
          <Section className="lg:col-span-2" title="Pipeline health" description="Open and on-hold deals by health. Value shown under each count." icon={<HeartPulse />} tone="green">
            <SegmentBar
              segments={d.health.map((h) => ({
                label: HEALTH_LABEL[h.label],
                value: h.count,
                sub: inr(h.amount),
                color: { HOT: "var(--serious)", HEALTHY: "var(--good)", AT_RISK: "var(--warning)", DYING: "var(--critical)" }[h.label],
                href: link({ health: h.label }),
                icon: { HOT: <Flame className="size-3.5" style={{ color: "var(--serious)" }} />, HEALTHY: <HeartPulse className="size-3.5" style={{ color: "var(--good)" }} />, AT_RISK: <AlertTriangle className="size-3.5" style={{ color: "var(--warning)" }} />, DYING: <Skull className="size-3.5" style={{ color: "var(--critical)" }} /> }[h.label],
              }))}
            />
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-2">
              <Link href="/requests" className="rounded-lg p-1 hover:bg-surface-2">
                <p className="flex items-center gap-1.5 text-xs text-ink-3"><ClipboardList className="size-3.5" /> BOQ requests open</p>
                <p className="mt-0.5 text-lg font-semibold tabular">{d.workflow.presalesOpen}{d.workflow.presalesOverdue > 0 && <span className="ml-2 text-xs font-medium text-[var(--t-red)]">{d.workflow.presalesOverdue} late</span>}</p>
              </Link>
              <Link href="/requests" className="rounded-lg p-1 hover:bg-surface-2">
                <p className="flex items-center gap-1.5 text-xs text-ink-3"><Calculator className="size-3.5" /> Pricing requests open</p>
                <p className="mt-0.5 text-lg font-semibold tabular">{d.workflow.pricingOpen}{d.workflow.pricingOverdue > 0 && <span className="ml-2 text-xs font-medium text-[var(--t-red)]">{d.workflow.pricingOverdue} late</span>}</p>
              </Link>
            </div>
          </Section>
          <Section title="Revenue mix" description="Open pipeline: one-time vs recurring" icon={<RefreshCcw />} tone="aqua">
            <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
              <div className="h-full rounded-l-full" style={{ width: `${mixTotal ? (d.revenueMix.oneTime / mixTotal) * 100 : 50}%`, background: "var(--s1)" }} />
              <div className="h-full rounded-r-full" style={{ width: `${mixTotal ? (d.revenueMix.arr / mixTotal) * 100 : 50}%`, background: "var(--s3)" }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Link href={link({ status: "open", rev: "ONE_TIME" })} className="rounded-lg p-1 hover:bg-surface-2">
                <p className="flex items-center gap-1.5 text-xs text-ink-3"><span className="size-2 rounded-sm bg-[var(--s1)]" /> One-time</p>
                <p className="mt-0.5 text-lg font-semibold tabular">{inr(d.revenueMix.oneTime)}</p>
              </Link>
              <Link href={link({ status: "open", rev: "ARR" })} className="rounded-lg p-1 hover:bg-surface-2">
                <p className="flex items-center gap-1.5 text-xs text-ink-3"><span className="size-2 rounded-sm bg-[var(--s3)]" /> Recurring (TCV)</p>
                <p className="mt-0.5 text-lg font-semibold tabular">{inr(d.revenueMix.arr)}</p>
                <p className="text-xs text-ink-3">{inr(d.revenueMix.arrAnnual)} per year</p>
              </Link>
            </div>
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <OemMixCard rows={d.oemMix.map((o) => ({ label: o.name, value: o.amount, href: o.id ? link({ status: "open", oem: o.id }) : undefined }))} />
          <Section title="Pipeline aging" description="Open value by deal age" icon={<Hourglass />} tone="amber">
            <ColumnChart data={d.aging.map((a) => ({ ...a, href: link({ age: a.age }) }))} x="bucket" y="amount" sub="count" />
          </Section>
          <Section title="Win rate by business unit" description="Won ÷ (won + lost), trailing 12 months" icon={<Percent />} tone="green">
            <BarList color="var(--s3)" data={d.winByBu.map((w) => ({ label: w.bu, value: w.rate, secondary: `${w.won}W · ${w.lost}L`, href: w.id ? link({ status: "won,lost", bu: w.id, period: null }) : undefined }))} format="pct" />
          </Section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Closing in the next 30 days" icon={<CalendarClock />} tone="blue" flush>
            {d.closingSoon.length === 0 ? <EmptyState title="Nothing scheduled to close in 30 days" /> : (
              <ul>
                {d.closingSoon.map((o) => (
                  <li key={o.id}>
                    <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 border-t border-border px-5 py-3 hover:bg-surface-2/70">
                      <span className="w-14 shrink-0 text-xs tabular text-ink-3">{fmtDate(o.expectedCloseDate, "short")}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{o.name}</p>
                        <p className="truncate text-xs text-ink-3">{o.account} · {o.owner}</p>
                      </div>
                      <span className="hidden sm:inline-flex"><StageBadge stage={o.stage} /></span>
                      <span className="w-20 text-right text-[13px] font-medium tabular">{inr(o.amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Upcoming renewals" description="Won recurring contracts ending within 120 days" icon={<RefreshCcw />} tone="aqua" flush>
            {d.renewals.length === 0 ? <EmptyState title="No renewals due in the next 120 days" /> : (
              <ul>
                {d.renewals.map((x) => (
                  <li key={x.id}>
                    <Link href={`/opportunities/${x.id}`} className="flex items-center gap-3 border-t border-border px-5 py-3 hover:bg-surface-2/70">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{x.name}</p>
                        <p className="truncate text-xs text-ink-3">{x.account} · ends {fmtDate(x.end)}</p>
                      </div>
                      <span className="text-[13px] font-medium tabular">{inr(x.arr)}<span className="text-xs font-normal text-ink-3">/yr</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </PageBody>
    </>
  );
}
