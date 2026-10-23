"use client";
// Dashboard cards with local (card-level) filters. Toggles only change what the card shows; page filters stay put.
import Link from "next/link";
import { useState } from "react";
import { Target, LineChart, Layers, Medal, CalendarRange, Factory } from "lucide-react";
import { Section } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { ForecastBullets, WonTrendChart, BuStackBars, ClosingCalendar, BarList } from "@/components/charts/charts";
import { Avatar } from "@/components/crm/badges";
import { Meter, EmptyState } from "@/components/crm/page";
import { inr } from "@/lib/format";

type FcKey = "Commit" | "Upside" | "Pipeline";

export function ForecastCard({
  rows,
}: {
  rows: { label: string; scope: "quarter" | "year"; target: number; won: number; commit: number; upside: number; pipeline: number; hrefs: Partial<Record<"won" | "commit" | "upside" | "pipeline", string>> }[];
}) {
  const [scope, setScope] = useState<"quarter" | "year">("quarter");
  return (
    <Section
      title="Forecast"
      description="Won, commit and upside against target. Click a segment to see its deals."
      icon={<Target />}
      tone="blue"
      action={<Segmented label="Forecast period" value={scope} onChange={setScope} options={[{ value: "quarter", label: "Quarters" }, { value: "year", label: "Year" }]} />}
    >
      <ForecastBullets rows={rows.filter((r) => r.scope === scope)} />
    </Section>
  );
}

export function TrendCard({
  data,
  showTarget,
}: {
  data: { month: string; won: number; target: number; deals: number; href: string }[];
  showTarget: boolean;
}) {
  const [range, setRange] = useState<"6" | "12">("12");
  const [metric, setMetric] = useState<"won" | "deals">("won");
  return (
    <Section
      title="Bookings trend"
      description={metric === "deals" ? "Deals closed-won per month" : showTarget ? "Closed-won by month against target run-rate" : "Closed-won by month"}
      icon={<LineChart />}
      tone="green"
      action={
        <div className="flex flex-wrap justify-end gap-1.5">
          <Segmented label="Bookings measure" value={metric} onChange={setMetric} options={[{ value: "won", label: "Value" }, { value: "deals", label: "Deals" }]} />
          <Segmented label="Bookings range" value={range} onChange={setRange} options={[{ value: "6", label: "6M" }, { value: "12", label: "12M" }]} />
        </div>
      }
    >
      <WonTrendChart data={data.slice(-Number(range))} showTarget={showTarget} metric={metric} />
    </Section>
  );
}

type StackRow = {
  key: string;
  open: Record<FcKey, number>;
  weighted: Record<FcKey, number>;
  total: number;
  wTotal: number;
  href: string;
  hrefs: Record<FcKey, string>;
};

export function PipelineByCard({ by }: { by: { bu: StackRow[]; category: StackRow[]; oem: StackRow[] } }) {
  const [dim, setDim] = useState<"bu" | "category" | "oem">("bu");
  const [measure, setMeasure] = useState<"open" | "weighted">("open");
  const rows = by[dim]
    .map((r) => {
      const v = measure === "open" ? r.open : r.weighted;
      return { bu: r.key, ...v, total: measure === "open" ? r.total : r.wTotal, href: r.href, hrefs: r.hrefs };
    })
    .filter((r) => r.total > 0);
  const label = { bu: "business unit", category: "category", oem: "OEM" }[dim];
  return (
    <Section
      title={`Pipeline by ${label}`}
      description={`${measure === "open" ? "Open" : "Probability-weighted"} value split by line item, stacked by forecast category`}
      icon={<Layers />}
      tone="aqua"
      action={
        <div className="flex flex-wrap justify-end gap-1.5">
          <Segmented label="Pipeline grouping" value={dim} onChange={setDim} options={[{ value: "bu", label: "BU" }, { value: "category", label: "Category" }, { value: "oem", label: "OEM" }]} />
          <Segmented label="Pipeline measure" value={measure} onChange={setMeasure} options={[{ value: "open", label: "Open" }, { value: "weighted", label: "Weighted" }]} />
        </div>
      }
    >
      {rows.length ? <BuStackBars data={rows} /> : <EmptyState title="No open pipeline in scope" />}
    </Section>
  );
}

type Rep = { id: string; name: string; won: number; open: number; weighted: number; target: number; wonN: number; lostN: number; href: string };

export function PerformersCard({ rows, fyLabel, targetsApplicable }: { rows: Rep[]; fyLabel: string; targetsApplicable: boolean }) {
  const [mode, setMode] = useState<"won" | "open" | "rate">("won");
  const rate = (r: Rep) => (r.wonN + r.lostN ? (r.wonN / (r.wonN + r.lostN)) * 100 : null);
  const value = (r: Rep) => (mode === "won" ? r.won : mode === "open" ? r.open : rate(r) ?? -1);
  const list = rows
    .filter((r) => (mode === "rate" ? r.wonN + r.lostN > 0 : value(r) > 0))
    .sort((a, b) => value(b) - value(a))
    .slice(0, 6);
  const max = Math.max(1, ...list.map(value));
  const description = {
    won: `${fyLabel} bookings${targetsApplicable ? " and attainment" : ""}`,
    open: "Open pipeline, with weighted value",
    rate: `Win rate by deal count, ${fyLabel}`,
  }[mode];
  return (
    <Section
      title="Top performers"
      description={description}
      icon={<Medal />}
      tone="amber"
      action={<Segmented label="Rank performers by" value={mode} onChange={setMode} options={[{ value: "won", label: "Bookings" }, { value: "open", label: "Pipeline" }, { value: "rate", label: "Win rate" }]} />}
    >
      {list.length === 0 ? (
        <EmptyState title="No sales activity in scope" />
      ) : (
        <ul className="flex flex-col gap-4">
          {list.map((r, i) => {
            const att = mode === "won" && r.target ? (r.won / r.target) * 100 : null;
            const wr = rate(r);
            return (
              <li key={r.id}>
                <Link href={r.href} className="group grid grid-cols-[20px_28px_1fr_auto] items-center gap-3">
                  <span className="text-xs tabular text-ink-3">{i + 1}</span>
                  <Avatar name={r.name} className="size-7" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium group-hover:text-primary">{r.name}</p>
                    <div className="mt-1.5">
                      {att !== null ? (
                        <Meter value={r.won} max={r.target} color={att >= 100 ? "var(--good)" : "var(--s1)"} />
                      ) : (
                        <Meter value={Math.max(0, value(r))} max={mode === "rate" ? 100 : max} />
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold tabular">{mode === "won" ? inr(r.won) : mode === "open" ? inr(r.open) : `${Math.round(wr ?? 0)}%`}</p>
                    <p className="text-[11px] tabular text-ink-3">
                      {mode === "won" ? (att !== null ? `${Math.round(att)}% of target` : `${r.wonN} won`) : mode === "open" ? `${inr(r.weighted)} weighted` : `${r.wonN} won · ${r.lostN} lost`}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function CalendarCard({
  data,
  overdue,
}: {
  data: { week: string; amount: number; count: number; commit: number; href: string }[];
  overdue: number;
}) {
  const [weeks, setWeeks] = useState<"4" | "8">("8");
  return (
    <Section
      title="Closing calendar"
      description={`Expected closes for the next ${weeks} weeks${overdue > 0 ? ` · ${inr(overdue)} already past its close date` : ""}`}
      icon={<CalendarRange />}
      tone="amber"
      action={<Segmented label="Calendar range" value={weeks} onChange={setWeeks} options={[{ value: "4", label: "4 wk" }, { value: "8", label: "8 wk" }]} />}
    >
      <ClosingCalendar data={data.slice(0, Number(weeks))} />
    </Section>
  );
}

export function OemMixCard({ rows }: { rows: { label: string; value: number; href?: string }[] }) {
  const [top, setTop] = useState<"5" | "all">("5");
  const named = rows.filter((r) => r.label !== "Other");
  const shown = top === "5" ? named.slice(0, 5) : rows;
  return (
    <Section
      title="Open pipeline by OEM"
      description="Split by line item. Click an OEM for its deals."
      icon={<Factory />}
      tone="blue"
      action={<Segmented label="OEMs shown" value={top} onChange={setTop} options={[{ value: "5", label: "Top 5" }, { value: "all", label: "All" }]} />}
    >
      {shown.length ? <BarList data={shown} /> : <EmptyState title="No open pipeline in scope" />}
    </Section>
  );
}
