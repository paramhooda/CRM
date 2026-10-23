import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getReports } from "@/server/queries/reports";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody, StatTile, Meter } from "@/components/crm/page";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { FilterBar } from "@/components/filters/filter-bar";
import { BarList } from "@/components/charts/charts";
import { Avatar } from "@/components/crm/badges";
import { Tooltip } from "@/components/ui/tooltip";
import { inr, pct } from "@/lib/format";
import { periodOptions, rangeKey } from "@/lib/fiscal";
import { ACCOUNT_TYPE_LABEL } from "@/lib/constants";
import { withParams, type SearchParams } from "@/lib/filters";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [r, options] = await Promise.all([getReports(user, sp), getOptions()]);
  // Closed-deal metrics cover the selected period, or the trailing 12 months
  const closedPeriod = typeof sp.period === "string" ? sp.period : trailingYearKey();
  const maxCell = Math.max(1, ...r.matrix.map((m) => m.open));
  const buGroups = [...new Set(r.matrix.map((m) => m.bu))];
  const qMax = Math.max(1, ...r.quarters.map((q) => Math.max(q.target, q.won + q.commit + q.upside)));
  const link = (extra: Record<string, string | null>, path = "/opportunities") => withParams(sp, extra, path);

  return (
    <>
      <PageHeader title="Reports" description={`Closed-deal metrics for ${r.periodLabel}. Pipeline metrics show all open deals.`}>
        <div className="mt-4">
          <Suspense><FilterBar me={user.id} options={options} periods={periodOptions()} dims={["bu", "cat", "sales", "oem", "atype", "rev"]} hideSales={user.role === "SALES"} /></Suspense>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile label="Won" href={link({ status: "won", period: closedPeriod })} value={inr(r.totals.won)} sub={`${r.totals.wonN} deals`} accent="var(--s6)" />
          <StatTile label="Lost / dropped" href={link({ status: "lost", period: closedPeriod })} value={inr(r.totals.lost)} sub={`${r.totals.lostN} deals`} accent="var(--s8)" />
          <StatTile label="Win rate" href={link({ status: "won,lost", period: closedPeriod })} value={r.totals.winRate === null ? "—" : `${r.totals.winRate}%`} sub="By count" />
          <StatTile label="Open pipeline" href={link({ status: "open", period: null })} value={inr(r.totals.open)} accent="var(--s1)" />
        </div>

        <Card>
          <CardHeader title={`Forecast vs target · ${r.fy}`} description={r.targetsApplicable ? "Won to date plus open commit and upside closing in each quarter, against quota" : "Targets hidden while filtering by BU, category, OEM, account type or revenue model"} />
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2">
              {[["Won", "var(--s6)"], ["Commit", "var(--s1)"], ["Upside", "var(--s2)"]].map(([l, c]) => (
                <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c }} />{l}</span>
              ))}
              {r.targetsApplicable && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5" style={{ background: "var(--ink)" }} />Target</span>}
            </div>
            <div className="flex flex-col gap-3">
              {r.quarters.map((q) => {
                const att = q.target ? (q.won / q.target) * 100 : null;
                return (
                  <div key={q.label} className="grid grid-cols-[56px_1fr_200px] items-center gap-3">
                    <span className={q.current ? "text-[13px] font-semibold" : "text-[13px] text-ink-2"}>{q.label}{q.current && <span className="ml-1 text-[10px] text-primary">now</span>}</span>
                    <div className="relative h-6">
                      <div className="absolute inset-0 flex gap-[2px]">
                        {[["won", q.won, "var(--s6)"], ["commit", q.past ? 0 : q.commit, "var(--s1)"], ["upside", q.past ? 0 : q.upside, "var(--s2)"]].map(([k, v, c]) =>
                          Number(v) > 0 ? (
                            <Tooltip key={String(k)} content={`${String(k)[0]!.toUpperCase() + String(k).slice(1)}: ${inr(Number(v))} · click to view deals`}>
                              <Link
                                href={link(k === "won" ? { status: "won", period: q.period } : { status: "open", fc: String(k).toUpperCase(), period: q.period })}
                                aria-label={`${q.label} ${String(k)} deals`}
                                className="h-6 transition-opacity hover:opacity-80 first:rounded-l last:rounded-r-[4px]"
                                style={{ width: `${(Number(v) / qMax) * 100}%`, minWidth: 3, flexShrink: 0, background: String(c) }}
                              />
                            </Tooltip>
                          ) : null,
                        )}
                      </div>
                      {r.targetsApplicable && q.target > 0 && <div className="absolute -top-1 -bottom-1 w-0.5 rounded" style={{ left: `${(q.target / qMax) * 100}%`, background: "var(--ink)" }} />}
                    </div>
                    <span className="text-right text-xs tabular text-ink-2">
                      {inr(q.won)} won{r.targetsApplicable && q.target > 0 && <> of {inr(q.target)} · <span className="font-medium" style={{ color: att! >= 100 ? "var(--t-green)" : "var(--ink)" }}>{Math.round(att!)}%</span></>}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Stage velocity" description="Average days deals spend in each stage vs the stale threshold" />
            <CardContent className="flex flex-col gap-2.5">
              {r.velocity.map((v) => (
                <Link key={v.key} href={link({ stage: v.key, status: null, period: null })} className="grid grid-cols-[140px_1fr_90px] items-center gap-3 rounded-md px-1 py-0.5 hover:bg-surface-hover">
                  <span className="truncate text-xs text-ink-2">{v.stage}</span>
                  <Meter value={v.avgDays} max={Math.max(60, ...r.velocity.map((x) => x.avgDays))} color={v.avgDays > v.benchmark ? "var(--serious)" : "var(--s1)"} />
                  <span className="text-right text-xs tabular">{v.avgDays}d <span className="text-ink-3">/ {v.benchmark}d</span></span>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Stage conversion" description="Share of deals that reached a stage and went on to the next" />
            <CardContent className="flex flex-col gap-2.5">
              {r.conversion.map((c) => (
                <div key={c.from} className="grid grid-cols-[1fr_1fr_60px] items-center gap-3">
                  <span className="truncate text-xs text-ink-2">{c.from} → {c.to}</span>
                  <Meter value={c.rate} max={100} color="var(--s3)" />
                  <span className="text-right text-xs tabular">{c.rate}% <span className="text-ink-3">n={c.n}</span></span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader title="Business unit × category" description="Open pipeline (cell shade), won value and win rate. Darker means more pipeline." />
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {buGroups.map((bu) => (
                <div key={bu}>
                  <p className="mb-1.5 text-xs font-semibold">{bu}</p>
                  <div className="flex flex-col gap-1">
                    {r.matrix.filter((m) => m.bu === bu).map((m) => {
                      const t = m.open / maxCell;
                      const bg = t === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--s1) ${Math.round(12 + t * 70)}%, var(--surface))`;
                      return (
                        <Tooltip key={m.category} content={`${m.category}: ${inr(m.open)} open (${m.openCount} deals) · ${inr(m.won)} won · win rate ${m.winRate === null ? "n/a" : m.winRate + "%"}`}>
                          <Link href={link({ status: "open", cat: m.catId, bu: null, period: null })} className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-opacity hover:opacity-85" style={{ background: bg, color: t > 0.55 ? "white" : "var(--ink)" }}>
                            <span className="truncate">{m.category}</span>
                            <span className="tabular">{inr(m.open)}</span>
                          </Link>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Why we lose" description="Loss reasons by value" />
            <CardContent>
              {r.lossReasons.length ? <BarList color="var(--s8)" data={r.lossReasons.map((l) => ({ label: l.reason, value: l.amount, secondary: `${l.count}` }))} /> : <p className="text-xs text-ink-3">No losses in this period.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="New logo vs existing" description="Win rate and bookings by account type" />
            <CardContent className="flex flex-col gap-4">
              {r.byAccountType.map((a) => (
                <Link key={a.type} href={link({ atype: a.type, status: "won,lost", period: closedPeriod })} className="block rounded-md p-1 hover:bg-surface-hover">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px]">{ACCOUNT_TYPE_LABEL[a.type]}</span>
                    <span className="text-xs tabular text-ink-2">{inr(a.won)} · {a.count} won</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Meter value={a.rate ?? 0} max={100} color={a.type === "NEW_LOGO" ? "var(--s1)" : "var(--s3)"} />
                    <span className="w-10 text-right text-xs font-medium tabular">{a.rate === null ? "—" : `${a.rate}%`}</span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Against competition" description="Win rate when a competitor type was recorded" />
            <CardContent className="flex flex-col gap-2">
              {r.competitors.length === 0 && <p className="text-xs text-ink-3">No competitive deals closed.</p>}
              {r.competitors.map((c) => (
                <div key={c.name} className="grid grid-cols-[1fr_80px_70px] items-center gap-2">
                  <span className="truncate text-xs">{c.name}</span>
                  <Meter value={c.rate} max={100} color="var(--s3)" />
                  <span className="text-right text-xs tabular">{c.rate}% <span className="text-ink-3">{c.w}W {c.l}L</span></span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader title="Sales scorecard" description={`Bookings in ${r.periodLabel}; pipeline is current. Attainment vs ${r.fy} annual target.`} />
          <CardContent className="overflow-x-auto px-0 pb-0">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-y border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 font-medium">Sales person</th>
                  <th className="px-3 py-2 text-right font-medium">Won</th>
                  <th className="w-40 px-3 py-2 font-medium">Attainment</th>
                  <th className="px-3 py-2 text-right font-medium">Win rate</th>
                  <th className="px-3 py-2 text-right font-medium">Open</th>
                  <th className="px-3 py-2 text-right font-medium">Weighted</th>
                  <th className="px-3 py-2 text-right font-medium">Commit</th>
                  <th className="px-3 py-2 text-right font-medium">Coverage</th>
                  <th className="px-4 py-2 text-right font-medium">Dying</th>
                </tr>
              </thead>
              <tbody>
                {r.reps.map((p) => {
                  const att = p.target ? (p.won / p.target) * 100 : null;
                  const gap = p.target - p.won;
                  const cov = gap > 0 ? p.open / gap : null;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2"><Link href={link({ sales: p.id }, "/dashboard")} className="flex items-center gap-2 hover:text-primary"><Avatar name={p.name} />{p.name}</Link></td>
                      <td className="px-3 py-2 text-right font-medium tabular">{inr(p.won)}</td>
                      <td className="px-3 py-2">{att !== null && <div className="flex items-center gap-2"><Meter value={p.won} max={p.target} color={att >= 100 ? "var(--good)" : "var(--s1)"} /><span className="w-9 text-right text-xs tabular">{Math.round(att)}%</span></div>}</td>
                      <td className="px-3 py-2 text-right tabular">{p.wonN + p.lostN ? pct((p.wonN / (p.wonN + p.lostN)) * 100) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular">{inr(p.open)}<span className="ml-1 text-xs text-ink-3">{p.deals}</span></td>
                      <td className="px-3 py-2 text-right tabular text-ink-2">{inr(p.weighted)}</td>
                      <td className="px-3 py-2 text-right tabular text-ink-2">{inr(p.commit)}</td>
                      <td className="px-3 py-2 text-right tabular" style={{ color: cov !== null && cov < 2 ? "var(--t-red)" : undefined }}>{cov === null ? "—" : `${cov.toFixed(1)}×`}</td>
                      <td className="px-4 py-2 text-right tabular" style={{ color: p.dying ? "var(--t-red)" : "var(--ink-3)" }}>{p.dying || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function trailingYearKey() {
  const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const now = new Date();
  return rangeKey(iso(new Date(now.getTime() - 365 * 86_400_000)), iso(now));
}
