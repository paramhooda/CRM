import Link from "next/link";
import { Suspense } from "react";
import {
  Flame, Skull, History, ArrowRight, Plus, ArrowUpRight, ArrowDownRight, Trophy, XCircle, CalendarClock,
  Sparkles, ClipboardList, Calculator, RefreshCcw, HeartPulse, AlertTriangle,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboard, type Dashboard } from "@/server/queries/dashboard";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, StatTile, Meter, EmptyState } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/filters/filter-bar";
import { StackedBuChart, WonTrendChart, Funnel, BarList, ColumnChart, SegmentBar } from "@/components/charts/charts";
import { HealthBadge, Avatar, StageBadge } from "@/components/crm/badges";
import { FlagChips, SeverityIcon } from "@/components/crm/flag-chips";
import { inr, pct, fmtDate, relativeDays } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/filters";
import { periodOptions } from "@/lib/fiscal";
import { FLAG_META } from "@/lib/rules/flags";
import { HEALTH_LABEL } from "@/lib/constants";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [d, options] = await Promise.all([getDashboard(user, sp), getOptions()]);
  const hour = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const canSell = user.role !== "PRESALES" && user.role !== "PURCHASE";
  const link = (extra: Record<string, string | null>, path = "/opportunities") => withParams(sp, extra, path);

  return (
    <>
      <PageHeader
        title={`${greet}, ${user.name.split(" ")[0]}`}
        description={
          <span>
            {d.quarterLabel} · {user.role === "SALES" ? "Your book of business" : user.role === "PRESALES" || user.role === "PURCHASE" ? "Deals you are working on" : "All business units"}
            {d.periodLabel && <> · Period: {d.periodLabel}</>}
          </span>
        }
        actions={
          canSell && (
            <>
              <Button asChild variant="secondary">
                <Link href="/reviews">
                  <History /> Review changes
                </Link>
              </Button>
              <Button asChild variant="primary">
                <Link href="/opportunities/new">
                  <Plus /> New opportunity
                </Link>
              </Button>
            </>
          )
        }
      >
        <div className="mt-4">
          <Suspense>
            <FilterBar options={options} periods={periodOptions()} dims={["bu", "cat", "sales", "presales", "oem", "fc", "atype", "rev"]} hideSales={user.role === "SALES"} />
          </Suspense>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        <Kpis d={d} />
        {(user.role === "PRESALES" || user.role === "PURCHASE") && <QueueBanner d={d} role={user.role} />}

        <div className="grid gap-4 lg:grid-cols-3">
          <ChangesCard d={d} />
          <OppListCard
            title="Hot opportunities"
            description="Late stage, engaged in the last 7 days, on schedule"
            icon={<Flame className="size-4" style={{ color: "var(--serious)" }} />}
            items={d.hot}
            href={link({ health: "HOT" })}
            empty="No hot deals right now."
            mode="hot"
          />
          <OppListCard
            title="Dying opportunities"
            description="No activity 21d+, stuck in stage, or well past close date"
            icon={<Skull className="size-4" style={{ color: "var(--critical)" }} />}
            items={d.dying}
            href={link({ health: "DYING" })}
            empty="Nothing dying. Nice."
            mode="dying"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader
              title="Concern areas"
              description="Open deals with flagged issues. Click to drill in."
              action={<span className="text-xs text-ink-3">{d.concerns.reduce((a, c) => a + c.count, 0)} flags</span>}
            />
            <CardContent className="flex flex-col gap-0.5">
              {d.concerns.length === 0 && <EmptyState title="No concerns flagged" />}
              {d.concerns.slice(0, 9).map((c) => (
                <Link key={c.code} href={link({ flag: c.code })} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-hover">
                  <SeverityIcon severity={FLAG_META[c.code].severity} />
                  <span className="flex-1 truncate text-[13px]">{FLAG_META[c.code].label}</span>
                  <span className="text-xs tabular text-ink-3">{inr(c.amount)}</span>
                  <span className="min-w-6 rounded bg-surface-2 px-1.5 text-center text-xs font-medium tabular">{c.count}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Pipeline health" description="Open and on-hold deals by health. Value shown under each count." />
            <CardContent>
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
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
                <MiniStat icon={<ClipboardList className="size-3.5" />} label="BOQ requests open" value={d.workflow.presalesOpen} alert={d.workflow.presalesOverdue} href="/requests" />
                <MiniStat icon={<Calculator className="size-3.5" />} label="Pricing requests open" value={d.workflow.pricingOpen} alert={d.workflow.pricingOverdue} href="/requests" />
                <MiniStat icon={<Sparkles className="size-3.5" />} label="One-time pipeline" value={inr(d.revenueMix.oneTime)} />
                <MiniStat icon={<RefreshCcw className="size-3.5" />} label="ARR pipeline (annual)" value={inr(d.revenueMix.arrAnnual)} sub={`TCV ${inr(d.revenueMix.arr)}`} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Open pipeline by business unit" description="Stacked by forecast category" />
            <CardContent>
              <StackedBuChart data={d.byBu} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader
              title="Bookings trend"
              description={d.targetsApplicable ? "Closed-won by month vs quarterly target run-rate" : "Closed-won by month. Targets hidden when filtering by BU, category or OEM."}
            />
            <CardContent>
              <WonTrendChart data={d.trend} showTarget={d.targetsApplicable} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader title="Stage funnel" description="Open pipeline value and count per stage" />
            <CardContent>
              <Funnel data={d.funnel.map((f) => ({ ...f, href: link({ stage: f.key }) }))} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader title="Sales leaderboard" description={`${d.fyLabel} bookings, attainment against annual target, and open pipeline`} />
            <CardContent>
              <Leaderboard d={d} hrefFor={(id) => link({ sales: id }, "/dashboard")} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="OEM mix" description="Open pipeline by OEM (top 7)" />
            <CardContent>
              <BarList data={d.oemMix.map((o) => ({ label: o.name, value: o.amount }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Pipeline aging" description="Open pipeline by deal age since creation" />
            <CardContent>
              <ColumnChart data={d.aging} x="bucket" y="amount" sub="count" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Win rate by business unit" description="Won ÷ (won + lost), trailing 12 months" />
            <CardContent>
              <BarList
                color="var(--s3)"
                data={d.winByBu.map((w) => ({ label: w.bu, value: w.rate, secondary: `${w.won}W · ${w.lost}L` }))}
                format="pct"
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Closing in the next 30 days" description="Open deals by expected close date" action={<Link className="text-xs text-primary hover:underline" href={link({ period: "this-q" })}>This quarter</Link>} />
            <CardContent className="px-0 pb-1">
              {d.closingSoon.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing scheduled to close in 30 days" />
              ) : (
                <ul>
                  {d.closingSoon.map((o) => (
                    <li key={o.id}>
                      <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 border-t border-border px-4 py-2 hover:bg-surface-hover">
                        <div className="w-14 shrink-0 text-xs tabular text-ink-2">{fmtDate(o.expectedCloseDate, "short")}</div>
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
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Upcoming renewals" description="Won ARR contracts ending within 120 days" />
            <CardContent className="px-0 pb-1">
              {d.renewals.length === 0 ? (
                <EmptyState icon={RefreshCcw} title="No renewals due in the next 120 days" />
              ) : (
                <ul>
                  {d.renewals.map((r) => (
                    <li key={r.id}>
                      <Link href={`/opportunities/${r.id}`} className="flex items-center gap-3 border-t border-border px-4 py-2 hover:bg-surface-hover">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{r.name}</p>
                          <p className="truncate text-xs text-ink-3">{r.account}</p>
                        </div>
                        <span className="hidden text-xs text-ink-2 sm:inline">ends {fmtDate(r.end)}</span>
                        <span className="w-24 text-right text-[13px] font-medium tabular">{inr(r.arr)}/yr</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Kpis({ d }: { d: Dashboard }) {
  const k = d.kpis;
  const qAtt = k.qTarget ? (k.wonQtd / k.qTarget) * 100 : null;
  const fyAtt = k.fyTarget ? (k.bookings / k.fyTarget) * 100 : null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="Open pipeline" value={inr(k.openPipeline)} sub={`${k.openCount} active deals`} accent="var(--s1)" />
      <StatTile label="Weighted pipeline" value={inr(k.weighted)} sub="Value × stage probability" accent="var(--s7)" />
      <StatTile
        label={`Commit · ${d.quarterLabel}`}
        value={inr(k.commitQ)}
        sub={<>+ {inr(k.upsideQ)} upside{k.coverage !== null && <> · {k.coverage.toFixed(1)}× coverage</>}</>}
        accent="var(--s3)"
      />
      <div className="relative rounded-lg border border-border bg-surface px-4 py-3">
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: "var(--s6)" }} />
        <p className="text-xs text-ink-3">Won · {d.quarterLabel}</p>
        <p className="mt-1 text-[22px] font-semibold tracking-tight">{inr(k.wonQtd)}</p>
        {qAtt !== null ? (
          <div className="mt-1.5">
            <Meter value={k.wonQtd} max={k.qTarget} color={qAtt >= 100 ? "var(--good)" : "var(--s1)"} />
            <p className="mt-1 text-xs text-ink-3">{pct(qAtt)} of {inr(k.qTarget)} target</p>
          </div>
        ) : (
          <p className="text-xs text-ink-3">Quarter to date</p>
        )}
      </div>
      <StatTile
        label={d.periodLabel ? `Bookings · ${d.periodLabel}` : `Bookings · ${d.fyLabel} to date`}
        value={inr(k.bookings)}
        sub={<>{k.bookingsCount} deals{fyAtt !== null && !d.periodLabel && <> · {pct(fyAtt)} of FY target</>}</>}
      />
      <StatTile
        label="Win rate"
        value={k.winRate === null ? "—" : pct(k.winRate)}
        sub={k.winRateValue === null ? "No closed deals" : `${pct(k.winRateValue)} by value · trailing 12 mo`}
      />
      <StatTile label="Average deal size" value={inr(k.avgDeal)} sub={`Sales cycle ${Math.round(k.avgCycle)} days`} />
      <StatTile label="ARR booked" value={inr(k.arrBooked)} sub={d.periodLabel ? d.periodLabel : `${d.fyLabel} to date, annualised`} />
    </div>
  );
}

function MiniStat({ icon, label, value, alert, sub, href }: { icon: React.ReactNode; label: string; value: React.ReactNode; alert?: number; sub?: string; href?: string }) {
  const body = (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-ink-3">{icon}{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular">{value}</p>
      {alert ? (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: "var(--t-red)" }}>
          <SeverityIcon severity="critical" className="size-3" /> {alert} past due
        </p>
      ) : sub ? (
        <p className="text-[11px] text-ink-3">{sub}</p>
      ) : null}
    </div>
  );
  return href ? <Link href={href} className="rounded-md hover:bg-surface-hover">{body}</Link> : body;
}

function ChangesCard({ d }: { d: Dashboard }) {
  const s = d.changes.summary;
  const rows = [
    { icon: <Plus className="size-3.5" />, label: "New deals", v: s.created.count, amt: s.created.amount, tone: "blue" },
    { icon: <ArrowUpRight className="size-3.5" />, label: "Advanced stage", v: s.advanced.count, amt: s.advanced.amount, tone: "green" },
    { icon: <ArrowDownRight className="size-3.5" />, label: "Moved back / on hold", v: s.regressed.count, amt: s.regressed.amount, tone: "amber" },
    { icon: <Trophy className="size-3.5" />, label: "Won", v: s.won.count, amt: s.won.amount, tone: "green" },
    { icon: <XCircle className="size-3.5" />, label: "Lost / dropped", v: s.lost.count, amt: s.lost.amount, tone: "red" },
    { icon: <CalendarClock className="size-3.5" />, label: "Close date pushed", v: s.pushed.count, amt: s.pushed.amount, tone: "orange" },
    { icon: <Skull className="size-3.5" />, label: "Newly dying", v: s.newlyDying.count, amt: s.newlyDying.amount, tone: "red" },
    { icon: <Flame className="size-3.5" />, label: "Newly hot", v: s.newlyHot.count, amt: s.newlyHot.amount, tone: "orange" },
  ];
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={<span className="flex items-center gap-2"><History className="size-4 text-primary" />Changes since last review</span>}
        description={`Since ${d.changes.sinceLabel}, ${relativeDays(d.changes.since)} (${fmtDate(d.changes.since)})`}
      />
      <CardContent className="flex flex-1 flex-col">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tabular">{s.total}</span>
          <span className="text-xs text-ink-3">deals changed</span>
          {s.valueDelta !== 0 && (
            <span className="ml-auto text-xs font-medium tabular" style={{ color: s.valueDelta > 0 ? "var(--t-green)" : "var(--t-red)" }}>
              {s.valueDelta > 0 ? "+" : ""}{inr(s.valueDelta)} value re-estimated
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 rounded px-1 py-1">
              <span className="rounded p-0.5" style={{ background: `var(--t-${r.tone}-bg)`, color: `var(--t-${r.tone})` }}>{r.icon}</span>
              <span className="flex-1 truncate text-xs text-ink-2">{r.label}</span>
              <span className="text-xs font-semibold tabular">{r.v}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-3">
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link href="/reviews">
              Open pipeline review <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OppListCard({
  title, description, icon, items, href, empty, mode,
}: {
  title: string; description: string; icon: React.ReactNode; items: Dashboard["hot"]; href: string; empty: string; mode: "hot" | "dying";
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={<span className="flex items-center gap-2">{icon}{title}</span>}
        description={description}
        action={<Link href={href} className="text-xs text-primary hover:underline">View all</Link>}
      />
      <CardContent className="flex-1 px-0 pb-1">
        {items.length === 0 ? (
          <EmptyState title={empty} />
        ) : (
          <ul>
            {items.map((o) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="block border-t border-border px-4 py-2 hover:bg-surface-hover">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{o.name}</p>
                    <span className="text-[13px] font-semibold tabular">{inr(o.amount)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                    <Avatar name={o.owner} className="size-4 text-[8px]" />
                    <span className="truncate">{o.owner}</span>
                    <span>·</span>
                    <span className="truncate">{mode === "hot" ? `closes ${relativeDays(o.expectedCloseDate)}` : `last touch ${relativeDays(o.lastActivityAt)}`}</span>
                    <span className="ml-auto"><HealthBadge label={o.healthLabel} score={o.healthScore} compact /></span>
                  </div>
                  {mode === "dying" && o.flags.length > 0 && <FlagChips flags={o.flags} max={2} className="mt-1" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Leaderboard({ d, hrefFor }: { d: Dashboard; hrefFor: (id: string) => string }) {
  const rows = d.leaderboard.filter((r) => r.won > 0 || r.open > 0).slice(0, 10);
  if (!rows.length) return <EmptyState title="No sales activity in scope" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
            <th className="pb-2 font-medium">Sales person</th>
            <th className="pb-2 text-right font-medium">Won</th>
            <th className="w-36 pb-2 pl-4 font-medium">{d.targetsApplicable ? "Attainment" : ""}</th>
            <th className="pb-2 text-right font-medium">Open</th>
            <th className="pb-2 text-right font-medium">Commit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const att = r.target ? (r.won / r.target) * 100 : null;
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1.5">
                  <Link href={hrefFor(r.id)} className="flex items-center gap-2 hover:text-primary">
                    <Avatar name={r.name} />
                    <span className="truncate">{r.name}</span>
                  </Link>
                </td>
                <td className="py-1.5 text-right font-medium tabular">{inr(r.won)}</td>
                <td className="py-1.5 pl-4">
                  {att !== null && (
                    <div className="flex items-center gap-2">
                      <Meter value={r.won} max={r.target} color={att >= 100 ? "var(--good)" : att < 25 ? "var(--serious)" : "var(--s1)"} />
                      <span className="w-9 text-right text-xs tabular text-ink-2">{Math.round(att)}%</span>
                    </div>
                  )}
                </td>
                <td className="py-1.5 text-right tabular text-ink-2">{inr(r.open)}</td>
                <td className="py-1.5 text-right tabular text-ink-2">{inr(r.commit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QueueBanner({ d, role }: { d: Dashboard; role: "PRESALES" | "PURCHASE" }) {
  const open = role === "PRESALES" ? d.workflow.presalesOpen : d.workflow.pricingOpen;
  const overdue = role === "PRESALES" ? d.workflow.presalesOverdue : d.workflow.pricingOverdue;
  return (
    <Card className="flex flex-wrap items-center gap-4 px-4 py-3" style={{ background: "var(--primary-soft)" }}>
      {role === "PRESALES" ? <ClipboardList className="size-5 text-primary" /> : <Calculator className="size-5 text-primary" />}
      <div className="flex-1">
        <p className="text-[13px] font-semibold">{open} {role === "PRESALES" ? "BOQ" : "pricing"} requests waiting on you</p>
        <p className="text-xs text-ink-2">{overdue ? `${overdue} past due date. ` : ""}Work your queue from the requests inbox.</p>
      </div>
      <Button asChild variant="primary" size="sm">
        <Link href="/requests">Open inbox <ArrowRight /></Link>
      </Button>
    </Card>
  );
}
