"use client";
// Salesforce Pipeline Inspection-style board: a metrics bar that filters the deal list, changes highlighted
// cell by cell, and a side panel with the deal's history and an in-call quick edit.
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowRight, ExternalLink, History, Loader2 } from "lucide-react";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { StageBadge, HealthBadge, Avatar } from "@/components/crm/badges";
import { quickUpdateDeal, getDealTimeline } from "@/server/actions/reviews";
import { STAGE_META, FORECAST_LABEL, type StageKey } from "@/lib/constants";
import { inr, fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PipelineReviewData, ReviewRow } from "@/server/queries/pipeline-review";

type Metrics = PipelineReviewData["metrics"];
type Filter = "all" | "commit" | "upside" | "pipeline" | "won" | "lost" | "pushed" | "grown" | "shrunk" | "attention" | "changed" | "still";

const FC_RANK: Record<string, number> = { OMITTED: 0, PIPELINE: 1, UPSIDE: 2, COMMIT: 3 };
const fc = (s: string) => FORECAST_LABEL[s as keyof typeof FORECAST_LABEL] ?? s;
const stg = (s: string) => STAGE_META[s as StageKey]?.label ?? s;
const ORDER = (s: string) => (s === "HOLD" ? 99 : STAGE_META[s as StageKey]?.order ?? 50);

export function ReviewBoard({ metrics, deals, closed, showOwner }: { metrics: Metrics; deals: ReviewRow[]; closed: ReviewRow[]; showOwner: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [grouped, setGrouped] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const attention = (d: ReviewRow) => d.insights.some((i) => i.tone === "red");
  const still = (d: ReviewRow) => d.insights.some((i) => i.code === "NO_MOVEMENT");
  const shown = useMemo(() => {
    const pick: Record<Filter, (d: ReviewRow) => boolean> = {
      all: () => true,
      commit: (d) => d.forecastCategory === "COMMIT" && d.stage !== "HOLD",
      upside: (d) => d.forecastCategory === "UPSIDE" && d.stage !== "HOLD",
      pipeline: (d) => d.forecastCategory === "PIPELINE" && d.stage !== "HOLD",
      pushed: (d) => d.rec.pushes > 0,
      grown: (d) => d.rec.isNew || (!!d.rec.amount && d.rec.amount.to > d.rec.amount.from),
      shrunk: (d) => (!!d.rec.amount && d.rec.amount.to < d.rec.amount.from) || d.rec.stageDir === "down",
      attention,
      changed: (d) => d.rec.changed,
      still,
      won: () => false,
      lost: () => false,
    };
    return deals.filter(pick[filter]);
     
  }, [deals, filter]);
  const closedShown = filter === "won" ? closed.filter((d) => d.stage === "WON") : filter === "lost" ? closed.filter((d) => d.stage !== "WON") : filter === "all" ? closed : [];
  const groups = useMemo(() => {
    if (!grouped) return [{ key: "all", label: "", rows: shown }];
    const m = new Map<string, ReviewRow[]>();
    for (const d of shown) m.set(d.stage, [...(m.get(d.stage) ?? []), d]);
    return [...m.entries()].sort((a, b) => ORDER(a[0]) - ORDER(b[0])).map(([k, rows]) => ({ key: k, label: stg(k), rows }));
  }, [shown, grouped]);
  const current = [...deals, ...closed].find((d) => d.id === openId) ?? null;

  const delta = (now: number, start: number) => now - start;
  const tiles: { key: Filter; label: string; value: string; sub: React.ReactNode; tone?: string }[] = [
    { key: "all", label: "Total pipeline", value: inr(metrics.total.now), sub: <Delta v={delta(metrics.total.now, metrics.total.start)} />, tone: "ink" },
    { key: "commit", label: "Commit", value: inr(metrics.commit.now), sub: <Delta v={delta(metrics.commit.now, metrics.commit.start)} /> },
    { key: "upside", label: "Best case", value: inr(metrics.upside.now), sub: <Delta v={delta(metrics.upside.now, metrics.upside.start)} /> },
    { key: "pipeline", label: "Pipeline", value: inr(metrics.pipeline.now), sub: <Delta v={delta(metrics.pipeline.now, metrics.pipeline.start)} /> },
    { key: "won", label: "Closed won", value: inr(metrics.won.value), sub: `${metrics.won.count} deal${metrics.won.count === 1 ? "" : "s"}`, tone: "green" },
    { key: "lost", label: "Lost", value: inr(metrics.lost.value), sub: `${metrics.lost.count} deal${metrics.lost.count === 1 ? "" : "s"}`, tone: "red" },
    { key: "pushed", label: "Pushed", value: inr(metrics.pushed.value), sub: `${metrics.pushed.count} deal${metrics.pushed.count === 1 ? "" : "s"}`, tone: "amber" },
    { key: "grown", label: "New / increased", value: `+${inr(metrics.grown.value)}`, sub: `${metrics.grown.count} deal${metrics.grown.count === 1 ? "" : "s"}`, tone: "green" },
    { key: "shrunk", label: "Decreased / back", value: metrics.shrunk.value ? `−${inr(metrics.shrunk.value)}` : inr(0), sub: `${metrics.shrunk.count} deal${metrics.shrunk.count === 1 ? "" : "s"}`, tone: "amber" },
  ];
  const quick: { key: Filter; label: string; n: number }[] = [
    { key: "attention", label: "Needs attention", n: deals.filter(attention).length },
    { key: "changed", label: "Changed", n: deals.filter((d) => d.rec.changed).length },
    { key: "still", label: "No movement", n: deals.filter(still).length },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Metrics bar: click to filter the list */}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-3 lg:grid-cols-9" role="tablist" aria-label="Pipeline metrics">
        {tiles.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(filter === t.key && t.key !== "all" ? "all" : t.key)}
            className={cn(
              "flex flex-col items-start gap-0.5 border-b border-r border-border px-3.5 py-3 text-left transition-colors cursor-pointer lg:border-b-0",
              filter === t.key ? "bg-primary-soft" : "hover:bg-surface-hover",
            )}
          >
            <span className={cn("text-xs", filter === t.key ? "text-[var(--t-blue)] font-medium" : "text-ink-3")}>{t.label}</span>
            <span className="text-[17px] font-semibold tabular" style={{ color: t.tone && t.tone !== "ink" && t.value !== inr(0) && t.value !== `+${inr(0)}` ? `var(--t-${t.tone})` : undefined }}>{t.value}</span>
            <span className="text-[11px] text-ink-3 tabular">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {quick.map((q) => (
          <button
            key={q.key}
            onClick={() => setFilter(filter === q.key ? "all" : q.key)}
            aria-pressed={filter === q.key}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors cursor-pointer",
              filter === q.key ? "border-transparent bg-ink text-page" : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
            )}
          >
            {q.label} <span className="tabular opacity-70">{q.n}</span>
          </button>
        ))}
        {filter !== "all" && <button onClick={() => setFilter("all")} className="text-xs text-ink-3 hover:text-ink cursor-pointer">Show all</button>}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="accent-[var(--primary)]" />
          Group by stage
        </label>
      </div>

      {filter !== "won" && filter !== "lost" && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead>
              <tr className="whitespace-nowrap border-b border-border text-left text-xs text-ink-3">
                <th scope="col" className="px-4 py-2.5 font-medium">Opportunity</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Close date</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Stage</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Forecast</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Insights</th>
                <th scope="col" className="px-3 py-2.5 pr-4 font-medium">Next step</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                {grouped && (
                  <tr className="border-b border-border bg-surface-2/60">
                    <td colSpan={7} className="px-4 py-1.5 text-xs">
                      <span className="font-semibold text-ink">{g.label}</span>
                      <span className="ml-2 tabular text-ink-3">{g.rows.length} · {inr(g.rows.reduce((a, r) => a + r.amount, 0))}</span>
                    </td>
                  </tr>
                )}
                {g.rows.map((d) => (
                  <tr key={d.id} onClick={() => setOpenId(d.id)} className="cursor-pointer border-b border-border align-top last:border-0 hover:bg-surface-hover/60">
                    <td className="max-w-[280px] px-4 py-2.5">
                      <button className="block max-w-full truncate text-left font-medium text-ink hover:text-primary cursor-pointer" aria-label={`Open ${d.name}`}>{d.name}</button>
                      <span className="block truncate text-xs text-ink-3">{d.account}{showOwner ? ` · ${d.owner}` : ""}</span>
                      <span className="block text-[11px] text-ink-3">Last activity {relativeDays(d.lastActivityAt)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <Changed
                        now={inr(d.amount)}
                        was={d.rec.amount ? inr(d.rec.amount.from) : null}
                        good={d.rec.amount ? d.rec.amount.to > d.rec.amount.from : null}
                        align="right"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Changed
                        now={<span className={cn(new Date(d.expectedCloseDate) < new Date() && "font-medium text-[var(--t-red)]")}>{fmtDate(d.expectedCloseDate)}</span>}
                        was={d.rec.close ? fmtDate(d.rec.close.from) : null}
                        good={d.rec.close ? d.rec.close.to < d.rec.close.from : null}
                        extra={d.closeDateSlipCount > 0 ? `↻${d.closeDateSlipCount}` : undefined}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Changed now={<StageBadge stage={d.stage} />} was={d.rec.stage ? stg(d.rec.stage.from) : null} good={d.rec.stageDir ? d.rec.stageDir === "up" : null} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Changed now={fc(d.forecastCategory)} was={d.rec.forecast ? fc(d.rec.forecast.from) : null} good={d.rec.forecast ? FC_RANK[d.rec.forecast.to]! > FC_RANK[d.rec.forecast.from]! : null} />
                    </td>
                    <td className="min-w-[200px] px-3 py-2.5"><Insights items={d.insights} max={2} /></td>
                    <td className="max-w-[220px] px-3 py-2.5 pr-4">
                      <span className="block truncate text-ink-2">{d.nextStep ?? <span className="text-ink-3">—</span>}</span>
                      {d.nextStepDate && <span className={cn("text-xs", new Date(d.nextStepDate) < new Date() ? "text-[var(--t-red)]" : "text-ink-3")}>{fmtDate(d.nextStepDate, "short")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            {shown.length === 0 && (
              <tbody><tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-3">No deals match this view.</td></tr></tbody>
            )}
          </table>
        </div>
      )}

      {closedShown.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <p className="border-b border-border px-4 py-2.5 text-xs font-medium text-ink-3">Closed in this window</p>
          {closedShown.map((d) => (
            <button key={d.id} onClick={() => setOpenId(d.id)} className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left text-[13px] last:border-0 hover:bg-surface-hover/60 cursor-pointer">
              <span className={cn("w-12 shrink-0 text-xs font-medium", d.stage === "WON" ? "text-[var(--t-green)]" : "text-[var(--t-red)]")}>{d.stage === "WON" ? "Won" : "Lost"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.name}</span>
                <span className="block truncate text-xs text-ink-3">{d.account}{showOwner ? ` · ${d.owner}` : ""}{d.lossReason ? ` · ${d.lossReason}` : ""}</span>
              </span>
              <span className="text-xs text-ink-3">{fmtDate(d.closedAt, "short")}</span>
              <span className="w-24 text-right font-medium tabular">{inr(d.amount)}</span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
        {current && <DealPanel deal={current} onDone={() => setOpenId(null)} />}
      </Dialog>
    </div>
  );
}

function Delta({ v }: { v: number }) {
  if (Math.abs(v) < 1) return <span>No change</span>;
  return (
    <span className={v > 0 ? "text-[var(--t-green)]" : "text-[var(--t-red)]"}>
      {v > 0 ? "▲" : "▼"} {inr(Math.abs(v))}
    </span>
  );
}

/** A value with its previous value underneath and a green/red arrow, like Salesforce change tracking. */
function Changed({ now, was, good, extra, align }: { now: React.ReactNode; was: string | null; good: boolean | null; extra?: string; align?: "right" }) {
  const Icon = good === null ? null : good ? ArrowUp : ArrowDown;
  return (
    <div className={cn("flex flex-col gap-0.5", align === "right" && "items-end")}>
      <span className={cn("inline-flex items-center gap-1 tabular", was && "rounded px-1 -mx-1", was && (good ? "bg-[var(--t-green-bg)]" : "bg-[var(--t-red-bg)]"))}>
        {Icon && was && <Icon className="size-3" style={{ color: good ? "var(--t-green)" : "var(--t-red)" }} />}
        {now}
        {extra && <span className="text-[11px] text-ink-3">{extra}</span>}
      </span>
      {was && <span className="text-[11px] text-ink-3 tabular">was {was}</span>}
    </div>
  );
}

function Insights({ items, max }: { items: ReviewRow["insights"]; max: number }) {
  if (!items.length) return <span className="text-xs text-ink-3">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, max).map((i) => (
        <span key={i.code} className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `var(--t-${i.tone}-bg)`, color: `var(--t-${i.tone})` }}>
          {i.label}
        </span>
      ))}
      {items.length > max && <span className="text-[11px] text-ink-3">+{items.length - max}</span>}
    </div>
  );
}

type Timeline = Awaited<ReturnType<typeof getDealTimeline>>;

function DealPanel({ deal: d, onDone }: { deal: ReviewRow; onDone: () => void }) {
  const router = useRouter();
  const [tl, setTl] = useState<Timeline | undefined>(undefined);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    nextStep: d.nextStep ?? "",
    nextStepDate: d.nextStepDate?.slice(0, 10) ?? "",
    expectedCloseDate: d.expectedCloseDate.slice(0, 10),
    forecastCategory: d.forecastCategory,
  });
  useEffect(() => {
    let live = true;
    getDealTimeline(d.id).then((x) => live && setTl(x));
    return () => {
      live = false;
    };
  }, [d.id]);
  const open = !d.closedAt;
  return (
    <SheetContent
      title={d.name}
      description={<>{d.account} · {d.code} · <Avatar name={d.owner} className="inline-flex size-4 align-middle text-[8px]" /> {d.owner}</>}
      actions={<Button asChild size="sm" variant="ghost"><Link href={`/opportunities/${d.id}`}><ExternalLink /> Open</Link></Button>}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
        <Fact label="Amount" value={inr(d.amount)} was={d.rec.amount ? inr(d.rec.amount.from) : null} />
        <Fact label="Stage" value={<StageBadge stage={d.stage} />} was={d.rec.stage ? stg(d.rec.stage.from) : null} />
        <Fact label="Close date" value={fmtDate(d.expectedCloseDate)} was={d.rec.close ? fmtDate(d.rec.close.from) : null} />
        <Fact label="Forecast" value={fc(d.forecastCategory)} was={d.rec.forecast ? fc(d.rec.forecast.from) : null} />
        <Fact label="Health" value={<HealthBadge label={d.healthLabel} score={d.healthScore} />} was={null} />
        <Fact label="Last activity" value={relativeDays(d.lastActivityAt)} was={null} />
      </div>
      {d.insights.length > 0 && (
        <div className="mt-4"><Insights items={d.insights} max={20} /></div>
      )}

      {open && d.canEdit && (
        <form
          className="mt-5 flex flex-col gap-3 rounded-xl border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await quickUpdateDeal(d.id, {
                nextStep: form.nextStep, nextStepDate: form.nextStepDate || null, expectedCloseDate: form.expectedCloseDate, forecastCategory: form.forecastCategory,
              });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Deal updated");
              onDone();
              router.refresh();
            });
          }}
        >
          <p className="text-[13px] font-semibold">Update from the call</p>
          <Field label="Next step"><Input value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} placeholder="What happens next, and who does it" aria-label="Next step" /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Next step date"><Input type="date" value={form.nextStepDate} onChange={(e) => setForm({ ...form, nextStepDate: e.target.value })} aria-label="Next step date" /></Field>
            <Field label="Close date"><Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} aria-label="Close date" /></Field>
            <Field label="Forecast">
              <Select value={form.forecastCategory} onChange={(e) => setForm({ ...form, forecastCategory: e.target.value })} aria-label="Forecast">
                {Object.entries(FORECAST_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-3">Pushing the close date out counts as a slip.</span>
            <Button type="submit" size="sm" variant="primary" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><History className="size-3.5 text-ink-3" /> History</p>
        {tl === undefined ? (
          <p className="text-xs text-ink-3">Loading…</p>
        ) : !tl || !tl.history.length ? (
          <p className="text-xs text-ink-3">No changes recorded.</p>
        ) : (
          <ol className="relative border-l border-border pl-4">
            {tl.history.map((h) => (
              <li key={h.id} className="mb-3 last:mb-0">
                <span className="absolute -left-[4.5px] mt-1.5 size-2 rounded-full bg-border-strong" />
                <p className="text-[13px]">{h.text}</p>
                <p className="text-[11px] text-ink-3">{h.by} · {fmtDate(h.at)} · {relativeDays(h.at)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      {tl && tl.activities.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[13px] font-semibold">Recent activity</p>
          <ul className="flex flex-col gap-2">
            {tl.activities.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[13px]">
                <span className="mt-0.5 rounded bg-surface-2 px-1.5 text-[10px] font-medium text-ink-2">{a.type}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{a.subject}</span>
                  <span className="text-[11px] text-ink-3">{a.owner} · {a.open ? `due ${fmtDate(a.dueAt, "short")}` : relativeDays(a.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href={`/opportunities/${d.id}?tab=history`} className="mt-6 inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
        Full history <ArrowRight className="size-3.5" />
      </Link>
    </SheetContent>
  );
}

function Fact({ label, value, was }: { label: string; value: React.ReactNode; was: string | null }) {
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <div className="mt-0.5 font-medium">{value}</div>
      {was && <p className="text-[11px] text-ink-3">was {was}</p>}
    </div>
  );
}
