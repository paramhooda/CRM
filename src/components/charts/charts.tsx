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

/** 12-point sparkline: de-emphasised line with a 10% wash, current period marked in the accent. */
export function Sparkline({ values, color = "var(--s1)", height = 36, label }: { values: number[]; color?: string; height?: number; label?: string }) {
  const w = 160;
  const h = height;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-9 w-full" role="img" aria-label={label ?? "Trend"}>
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} stroke="var(--chart-surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Quarter bullet: stacked Won / Commit / Upside against a target marker. */
export function ForecastBullets({
  rows,
}: {
  rows: { label: string; target: number; won: number; commit: number; upside: number; pipeline: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.target, r.won + r.commit + r.upside)));
  const series = [
    { key: "won", label: "Won", color: "var(--s6)" },
    { key: "commit", label: "Commit", color: "var(--s1)" },
    { key: "upside", label: "Upside", color: "var(--s2)" },
  ] as const;
  return (
    <div>
      <LegendRow items={[...series.map((s) => ({ label: s.label, color: s.color })), { label: "Target", color: "var(--ink)", dash: true }]} />
      <div className="mt-5 flex flex-col gap-6">
        {rows.map((r) => {
          const covered = r.won + r.commit;
          return (
            <div key={r.label}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">{r.label}</span>
                <span className="text-xs tabular text-ink-3">
                  {r.target > 0 ? <>won + commit <span className="font-medium text-ink">{inr(covered)}</span> of {inr(r.target)} · {Math.round((covered / r.target) * 100)}%</> : <>won + commit {inr(covered)}</>}
                </span>
              </div>
              <div className="relative h-7">
                <div className="absolute inset-0 rounded-md bg-surface-2" />
                <div className="absolute inset-y-0 left-0 flex w-full gap-[2px]">
                  {series.map((s) => {
                    const v = r[s.key];
                    return v > 0 ? (
                      <Tooltip key={s.key} content={`${s.label}: ${inr(v)}`}>
                        <div className="h-full shrink-0 first:rounded-l-md last:rounded-r-[4px]" style={{ width: `${(v / max) * 100}%`, background: s.color }} />
                      </Tooltip>
                    ) : null;
                  })}
                </div>
                {r.target > 0 && (
                  <Tooltip content={`Target ${inr(r.target)}`}>
                    <div className="absolute -top-1.5 -bottom-1.5 w-[3px] -translate-x-1/2 rounded-full bg-ink" style={{ left: `${Math.min(100, (r.target / max) * 100)}%` }} />
                  </Tooltip>
                )}
              </div>
              {r.pipeline > 0 && <p className="mt-1.5 text-xs text-ink-3">+ {inr(r.pipeline)} early-stage pipeline also expected to close</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Horizontal stacked bars per business unit by forecast category (HTML, labels never clipped). */
export function BuStackBars({ data }: { data: { bu: string; Commit: number; Upside: number; Pipeline: number; total: number }[] }) {
  const series = [
    { key: "Commit", color: "var(--s1)" },
    { key: "Upside", color: "var(--s2)" },
    { key: "Pipeline", color: "var(--s3)" },
  ] as const;
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div>
      <LegendRow items={series.map((s) => ({ label: s.key, color: s.color }))} />
      <div className="mt-5 flex flex-col gap-4">
        {data.map((d) => (
          <div key={d.bu}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px]">{d.bu}</span>
              <span className="text-[13px] font-medium tabular">{inr(d.total)}</span>
            </div>
            <div className="flex h-2.5 gap-[2px]" style={{ width: `${Math.max(2, (d.total / max) * 100)}%` }}>
              {series.map((s) =>
                d[s.key] > 0 ? (
                  <Tooltip key={s.key} content={`${d.bu} · ${s.key}: ${inr(d[s.key])}`}>
                    <div className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(d[s.key] / d.total) * 100}%`, background: s.color }} />
                  </Tooltip>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Two-series grouped columns on one axis, e.g. pipeline created vs won per month. */
export function FlowChart({ data }: { data: { label: string; created: number; won: number }[] }) {
  return (
    <div>
      <LegendRow items={[{ label: "Pipeline created", color: "var(--s1)" }, { label: "Closed-won", color: "var(--s3)" }]} />
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={inrAxis} width={48} />
            <RTooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={String(label)}
                    rows={[
                      { label: "Pipeline created", value: inr(payload.find((p) => p.dataKey === "created")?.value ?? 0), color: "var(--s1)" },
                      { label: "Closed-won", value: inr(payload.find((p) => p.dataKey === "won")?.value ?? 0), color: "var(--s3)" },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="created" fill="var(--s1)" maxBarSize={14} radius={[4, 4, 0, 0]} />
            <Bar dataKey="won" fill="var(--s3)" maxBarSize={14} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Weekly closing calendar: expected close value per week, commit highlighted within each column. */
export function ClosingCalendar({ data }: { data: { week: string; amount: number; count: number; commit: number }[] }) {
  const rows = data.map((d) => ({ ...d, other: d.amount - d.commit }));
  return (
    <div>
      <LegendRow items={[{ label: "Commit", color: "var(--s1)" }, { label: "Other open", color: "var(--o1)" }]} />
      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval={0} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={inrAxis} width={48} />
            <RTooltip
              cursor={{ fill: "var(--surface-hover)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0]!.payload as (typeof rows)[number];
                return <TooltipBox title={`Week of ${label}`} rows={[{ label: "Commit", value: inr(r.commit), color: "var(--s1)" }, { label: "Other open", value: inr(r.other), color: "var(--o1)" }, { label: "Deals", value: String(r.count) }]} />;
              }}
            />
            <Bar dataKey="commit" stackId="a" fill="var(--s1)" maxBarSize={24} stroke="var(--chart-surface)" strokeWidth={2} />
            <Bar dataKey="other" stackId="a" fill="var(--o1)" maxBarSize={24} radius={[4, 4, 0, 0]} stroke="var(--chart-surface)" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
