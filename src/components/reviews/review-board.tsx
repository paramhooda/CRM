"use client";
// Deal-by-deal list for the pipeline review: what changed on each deal, in the same row style as the dashboard.
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Briefcase, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Section } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { StageBadge, HealthBadge } from "@/components/crm/badges";
import { EmptyState } from "@/components/crm/page";
import { quickUpdateDeal, getDealTimeline } from "@/server/actions/reviews";
import { STAGE_META, FORECAST_LABEL, type StageKey, type Tone } from "@/lib/constants";
import { forecastError } from "@/lib/stage-rules";
import { inr, fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewRow } from "@/server/queries/pipeline-review";

type View = "all" | "changed" | "attention" | "still" | "closed";
const FC_RANK: Record<string, number> = { OMITTED: 0, PIPELINE: 1, UPSIDE: 2, COMMIT: 3 };
const fc = (s: string) => FORECAST_LABEL[s as keyof typeof FORECAST_LABEL] ?? s;
const stg = (s: string) => STAGE_META[s as StageKey]?.label ?? s;
// Short stage names keep change badges readable ("Qualified → Proposal")
const SHORT: Record<string, string> = {
  IDENTIFIED: "Identified", QUALIFIED: "Qualified", BOQ: "BOQ", PRICING: "Pricing", PROPOSAL: "Proposal", NEGOTIATION: "Negotiation", HOLD: "Hold", WON: "Won", LOST: "Lost", DROPPED: "Dropped",
};
const stgShort = (s: string) => SHORT[s] ?? stg(s);
const ORDER = (s: string) => (s === "HOLD" ? 99 : STAGE_META[s as StageKey]?.order ?? 50);
const short = (d: string) => fmtDate(d, "short");

/** Plain-language change badges for a deal, most important first. */
function changes(d: ReviewRow): { text: string; tone: Tone }[] {
  const out: { text: string; tone: Tone }[] = [];
  const r = d.rec;
  if (r.isNew) out.push({ text: "New deal", tone: "blue" });
  if (r.close) out.push({ text: `Close ${short(r.close.from)} → ${short(r.close.to)}`, tone: r.close.to > r.close.from ? "red" : "green" });
  if (r.amount) out.push({ text: `${inr(r.amount.from)} → ${inr(r.amount.to)}`, tone: r.amount.to > r.amount.from ? "green" : "red" });
  if (r.stage) out.push({ text: `${stgShort(r.stage.from)} → ${stgShort(r.stage.to)}`, tone: r.stageDir === "up" ? "green" : "amber" });
  if (r.forecast) out.push({ text: `${fc(r.forecast.from)} → ${fc(r.forecast.to)}`, tone: FC_RANK[r.forecast.to]! > FC_RANK[r.forecast.from]! ? "green" : "amber" });
  if (r.health?.to === "DYING") out.push({ text: "Became dying", tone: "red" });
  return out;
}
// Flags that are not already shown as a change (a pushed close date or "became dying" appears once)
const risks = (d: ReviewRow) =>
  d.insights.filter(
    (i) => (i.tone === "red" || i.code === "STUCK" || i.code === "NO_NEXT_STEP") && i.code !== "NOW_DYING" && !(i.code === "PUSHED" && d.rec.close),
  );

export function ReviewDeals({ deals, closed, showOwner, sinceLabel }: { deals: ReviewRow[]; closed: ReviewRow[]; showOwner: boolean; sinceLabel: string }) {
  const [view, setView] = useState<View>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const still = (d: ReviewRow) => d.insights.some((i) => i.code === "NO_MOVEMENT");
  const counts = {
    changed: deals.filter((d) => d.rec.changed).length,
    attention: deals.filter((d) => d.insights.some((i) => i.tone === "red")).length,
    still: deals.filter(still).length,
  };
  const shown = useMemo(() => {
    if (view === "changed") return deals.filter((d) => d.rec.changed);
    if (view === "attention") return deals.filter((d) => d.insights.some((i) => i.tone === "red"));
    if (view === "still") return deals.filter(still);
    return deals;
  }, [deals, view]);
  const groups = useMemo(() => {
    const m = new Map<string, ReviewRow[]>();
    for (const d of shown) m.set(d.stage, [...(m.get(d.stage) ?? []), d]);
    return [...m.entries()].sort((a, b) => ORDER(a[0]) - ORDER(b[0]));
  }, [shown]);
  const current = [...deals, ...closed].find((d) => d.id === openId) ?? null;

  return (
    <Section
      title="Deals"
      description={`${deals.length} open deal${deals.length === 1 ? "" : "s"} · changes since ${sinceLabel}`}
      icon={<Briefcase />}
      tone="blue"
      flush
    >
      {/* Tabs sit in the body so they can scroll on narrow screens */}
      <div className="overflow-x-auto px-5 pb-3 scrollbar-thin">
        <Segmented
          className="[&_button]:shrink-0 [&_button]:whitespace-nowrap"
          label="Show deals"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All" },
            { value: "changed", label: `Changed ${counts.changed}` },
            { value: "attention", label: `Needs attention ${counts.attention}` },
            { value: "still", label: `No movement ${counts.still}` },
            { value: "closed", label: `Closed ${closed.length}` },
          ]}
        />
      </div>
      {view === "closed" ? (
        closed.length === 0 ? (
          <EmptyState title="Nothing closed in this window" />
        ) : (
          <ul>
            {closed.map((d) => (
              <li key={d.id}>
                <button onClick={() => setOpenId(d.id)} className="flex w-full items-center gap-3 border-t border-border px-5 py-3 text-left hover:bg-surface-2/70 cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{d.name}</p>
                    <p className="truncate text-xs text-ink-3">{d.account}{showOwner ? ` · ${d.owner}` : ""} · {fmtDate(d.closedAt)}{d.lossReason ? ` · ${d.lossReason}` : ""}</p>
                  </div>
                  <Badge tone={d.stage === "WON" ? "green" : "red"}>{d.stage === "WON" ? "Won" : "Lost"}</Badge>
                  <span className="w-24 text-right text-[13px] font-medium tabular">{inr(d.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <EmptyState title="No deals in this view" />
      ) : (
        groups.map(([stage, rows]) => (
          <div key={stage}>
            <p className="border-t border-border bg-surface-2/50 px-5 py-1.5 text-xs text-ink-3">
              <span className="font-medium text-ink-2">{stg(stage)}</span> · {rows.length} · {inr(rows.reduce((a, r) => a + r.amount, 0))}
            </p>
            <ul>
              {rows.map((d) => {
                const ch = changes(d);
                const rk = risks(d);
                const badges = [...ch, ...rk.map((i) => ({ text: i.label, tone: i.tone as Tone }))];
                const pastClose = new Date(d.expectedCloseDate) < new Date();
                return (
                  <li key={d.id}>
                    <button onClick={() => setOpenId(d.id)} aria-label={`Open ${d.name}`} className="flex w-full items-center gap-3 border-t border-border px-5 py-3 text-left hover:bg-surface-2/70 cursor-pointer">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{d.name}</p>
                        <p className="truncate text-xs text-ink-3">
                          {d.account}{showOwner ? ` · ${d.owner}` : ""} · <span className={cn(pastClose && "text-[var(--t-red)]")}>closes {fmtDate(d.expectedCloseDate, "short")}</span> · {fc(d.forecastCategory)}
                        </p>
                      </div>
                      <div className="hidden max-w-[50%] flex-wrap justify-end gap-1.5 md:flex">
                        {badges.slice(0, 3).map((b) => <Badge key={b.text} tone={b.tone}>{b.text}</Badge>)}
                        {badges.length > 3 && <span className="text-[11px] text-ink-3">+{badges.length - 3}</span>}
                        {!badges.length && still(d) && <span className="text-xs text-ink-3">No movement</span>}
                      </div>
                      <span className="w-24 shrink-0 text-right text-[13px] font-medium tabular">{inr(d.amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
        {current && <DealDialog deal={current} onDone={() => setOpenId(null)} />}
      </Dialog>
    </Section>
  );
}

type Timeline = Awaited<ReturnType<typeof getDealTimeline>>;

/** Deal summary for the call: what changed, what is wrong, a quick update and recent history. */
function DealDialog({ deal: d, onDone }: { deal: ReviewRow; onDone: () => void }) {
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
  const ch = changes(d);
  const rk = d.insights.filter((i) => (i.tone === "red" || i.tone === "amber") && i.code !== "NOW_DYING" && !(i.code === "PUSHED" && d.rec.close) && !["MOVED_BACK", "FC_DOWN", "VALUE_DOWN"].includes(i.code));
  return (
    <DialogContent wide title={d.name} description={`${d.account} · ${d.owner} · ${inr(d.amount)}`}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={d.stage} />
          {!d.closedAt && <HealthBadge label={d.healthLabel} score={d.healthScore} />}
          <span className="text-xs text-ink-3">Closes {fmtDate(d.expectedCloseDate)} · {fc(d.forecastCategory)} · last activity {relativeDays(d.lastActivityAt)}</span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-medium">Changed in this window</p>
            {ch.length ? (
              <div className="flex flex-wrap gap-1.5">{ch.map((c) => <Badge key={c.text} tone={c.tone}>{c.text}</Badge>)}</div>
            ) : (
              <p className="text-[13px] text-ink-3">No changes.</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Needs attention</p>
            {rk.length ? (
              <div className="flex flex-wrap gap-1.5">{rk.map((i) => <Badge key={i.code} tone={i.tone}>{i.label}</Badge>)}</div>
            ) : (
              <p className="text-[13px] text-ink-3">Nothing flagged.</p>
            )}
          </div>
        </div>

        {!d.closedAt && d.canEdit && (
          <form
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
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
            <p className="text-[13px] font-medium">Update from the call</p>
            <Field label="Next step"><Input value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} placeholder="What happens next" aria-label="Next step" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Next step date"><Input type="date" value={form.nextStepDate} onChange={(e) => setForm({ ...form, nextStepDate: e.target.value })} aria-label="Next step date" /></Field>
              <Field label="Close date"><Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} aria-label="Close date" /></Field>
              <Field label="Forecast">
                <Select value={form.forecastCategory} onChange={(e) => setForm({ ...form, forecastCategory: e.target.value })} aria-label="Forecast">
                  {Object.entries(FORECAST_LABEL).map(([k, l]) => (
                    <option key={k} value={k} disabled={!!forecastError(d.stage as StageKey, k) && k !== d.forecastCategory}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Save</Button>
            </div>
          </form>
        )}

        <div>
          <p className="mb-2 text-[13px] font-medium">Recent changes</p>
          {tl === undefined ? (
            <p className="text-xs text-ink-3">Loading…</p>
          ) : !tl || !tl.history.length ? (
            <p className="text-xs text-ink-3">No changes recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {tl.history.slice(0, 6).map((h) => (
                <li key={h.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate">{h.text}</span>
                  <span className="shrink-0 text-xs text-ink-3">{h.by} · {fmtDate(h.at, "short")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/opportunities/${d.id}`}>Open opportunity <ArrowRight /></Link>
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
