"use client";
import Link from "next/link";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ComposedChart, Line, Legend,
} from "recharts";
import { inr, inrAxis } from "@/lib/format";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const axisTick = { fill: "var(--ink-3)", fontSize: 11 };

function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string; dash?: boolean }[];
}) {
  return (
    <div className="min-w-40 rounded-md border border-border bg-surface px-2.5 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.color && (
              <span
                className={cn("inline-block", r.dash ? "h-0.5 w-3" : "size-2 rounded-sm")}
                style={{ background: r.color }}
              />
            )}
            {r.label}
          </span>
          <span className="tabular font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function LegendRow({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={i.dash ? "h-0.5 w-3.5" : "size-2.5 rounded-sm"} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Pipeline by BU stacked by forecast category (Commit / Upside / Pipeline). */
export function StackedBuChart({ data }: { data: { bu: string; Commit: number; Upside: number; Pipeline: number }[] }) {
  const series = [
    { key: "Commit", color: "var(--s1)" },
    { key: "Upside", color: "var(--s2)" },
    { key: "Pipeline", color: "var(--s3)" },
  ] as const;
  return (
    <div>
      <LegendRow items={series.map((s) => ({ label: s.key, color: s.color }))} />
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="bu" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval={0} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={inrAxis} width={48} />
            <RTooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(label)}
                    rows={[
                      ...series.map((s) => ({
                        label: s.key,
                        value: inr(payload.find((p) => p.dataKey === s.key)?.value ?? 0),
                        color: s.color,
                      })),
                      { label: "Total", value: inr(series.reduce((a, s) => a + Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0), 0)) },
                    ]}
                  />
                ) : null
              }
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="a"
                fill={s.color}
                maxBarSize={24}
                stroke="var(--chart-surface)"
                strokeWidth={2}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Monthly bookings (columns) against target run-rate (line). One axis, both INR. */
export function WonTrendChart({ data, showTarget }: { data: { month: string; won: number; target: number; deals: number }[]; showTarget: boolean }) {
  return (
    <div>
      <LegendRow
        items={[
          { label: "Closed-won", color: "var(--s1)" },
          ...(showTarget ? [{ label: "Target run-rate", color: "var(--ink-3)", dash: true }] : []),
        ]}
      />
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={inrAxis} width={48} />
            <RTooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]!.payload as (typeof data)[number];
                return (
                  <TooltipBox
                    title={String(label)}
                    rows={[
                      { label: `Closed-won (${row.deals})`, value: inr(row.won), color: "var(--s1)" },
                      ...(showTarget ? [{ label: "Target run-rate", value: inr(row.target), color: "var(--ink-3)", dash: true }] : []),
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="won" fill="var(--s1)" maxBarSize={24} radius={[4, 4, 0, 0]} />
            {showTarget && (
              <Line type="stepAfter" dataKey="target" stroke="var(--ink-3)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--chart-surface)", strokeWidth: 2 }} />
            )}
            <Legend content={() => null} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Column chart for a single series (e.g. pipeline aging). */
export function ColumnChart({ data, x, y, sub }: { data: Record<string, unknown>[]; x: string; y: string; sub?: string }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey={x} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={inrAxis} width={48} />
          <RTooltip
            cursor={{ fill: "var(--surface-hover)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={String(label)}
                  rows={[
                    { label: "Value", value: inr(payload[0]!.value), color: "var(--s1)" },
                    ...(sub ? [{ label: "Deals", value: String((payload[0]!.payload as Record<string, unknown>)[sub]) }] : []),
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey={y} fill="var(--s1)" maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal funnel: ordinal blue ramp, value at the bar tip, count beside the label. */
export function Funnel({ data }: { data: { stage: string; key: string; count: number; amount: number; href?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  const ramp = ["var(--o1)", "var(--o2)", "var(--o3)", "var(--o5)", "var(--o6)"];
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => {
        const row = (
          <div className="group grid grid-cols-[120px_1fr] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-ink-2 group-hover:text-ink">{d.stage}</p>
              <p className="text-[11px] text-ink-3 tabular">{d.count} deals</p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-5 rounded-r-[4px] transition-opacity group-hover:opacity-85"
                style={{ width: `${Math.max(2, (d.amount / max) * 82)}%`, background: ramp[i] }}
              />
              <span className="shrink-0 text-xs font-medium tabular text-ink">{inr(d.amount)}</span>
            </div>
          </div>
        );
        return d.href ? (
          <Link key={d.key} href={d.href}>
            {row}
          </Link>
        ) : (
          <div key={d.key}>{row}</div>
        );
      })}
    </div>
  );
}

/** Ranked horizontal bars rendered in HTML (labels never clipped). */
export function BarList({
  data,
  format = "inr",
  color = "var(--s1)",
  suffix,
}: {
  data: { label: string; value: number; secondary?: string; href?: string; tip?: string }[];
  format?: "inr" | "pct" | "num";
  color?: string;
  suffix?: string;
}) {
  const fmt = (n: number) => (format === "pct" ? `${n}%` : format === "num" ? `${n}${suffix ?? ""}` : inr(n));
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d) => {
        const inner = (
          <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-1 py-0.5 hover:bg-surface-hover">
            <div className="relative h-6 min-w-0">
              <div className="absolute inset-y-0 left-0 rounded-r-[4px] opacity-20" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
              <div className="absolute inset-y-0 left-0 w-[3px] rounded-r" style={{ background: color }} />
              <span className="relative flex h-full items-center truncate pl-2.5 text-xs text-ink">{d.label}</span>
            </div>
            <span className="text-right text-xs tabular text-ink">
              {fmt(d.value)}
              {d.secondary && <span className="ml-1.5 text-ink-3">{d.secondary}</span>}
            </span>
          </div>
        );
        const content = d.tip ? (
          <Tooltip content={d.tip}>
            <div>{inner}</div>
          </Tooltip>
        ) : (
          inner
        );
        return d.href ? (
          <Link key={d.label} href={d.href}>
            {content}
          </Link>
        ) : (
          <div key={d.label}>{content}</div>
        );
      })}
    </div>
  );
}

/** 100% stacked bar for part-to-whole of a few classes, 2px surface gaps between segments. */
export function SegmentBar({
  segments,
}: {
  segments: { label: string; value: number; color: string; sub?: string; href?: string; icon?: React.ReactNode }[];
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <Tooltip key={s.label} content={`${s.label}: ${s.sub ?? s.value}`}>
              <div className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
            </Tooltip>
          ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {segments.map((s) => {
          const body = (
            <div className="rounded-md border border-border px-2.5 py-2 hover:border-border-strong">
              <p className="flex items-center gap-1.5 text-xs text-ink-2">
                {s.icon ?? <span className="size-2 rounded-full" style={{ background: s.color }} />}
                {s.label}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold tabular">{s.value}</p>
              {s.sub && <p className="text-[11px] text-ink-3 tabular">{s.sub}</p>}
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {body}
            </Link>
          ) : (
            <div key={s.label}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
