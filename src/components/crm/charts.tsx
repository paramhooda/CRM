"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./states";
import { Segmented } from "./segmented";
import { ArrowLink } from "./link-arrow";
import { BU_SOLID, CHART_MAGNITUDE, CHART_SERIES } from "./pills";
import { inr } from "@/domain/money";
import { cn } from "@/lib/utils";

export type Bucket = { key: string; label: string; value: number; count: number; colourToken?: string };

/** Ordered buckets take one hue, light to dark: the earlier the stage (or the softer the forecast), the lighter. */
const ORDERED: Record<string, string> = {
  QUALIFIED: CHART_MAGNITUDE[0]!,
  BOQ: CHART_MAGNITUDE[1]!,
  PROPOSAL_SUBMITTED: CHART_MAGNITUDE[2]!,
  NEGOTIATION: CHART_MAGNITUDE[3]!,
  HOLD: "var(--muted-foreground)",
  PIPELINE: CHART_MAGNITUDE[0]!,
  UPSIDE: CHART_MAGNITUDE[2]!,
  COMMIT: CHART_MAGNITUDE[4]!,
};

export type ChartLink = { base: string; param: string };

/** The card chrome every chart shares: bold title, grey description, optional controls row (segmented + link). */
export function ChartCard({ title, description, controls, action, children, className }: { title: ReactNode; description?: ReactNode; controls?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-[17px]">{title}</CardTitle>
            {description && <CardDescription className="mt-1 text-sm">{description}</CardDescription>}
          </div>
          {action}
        </div>
        {controls && <div className="mt-3 flex flex-wrap items-center gap-3">{controls}</div>}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

/** A horizontal bar chart of amounts by bucket. Every bar links to the matching filtered list (`base` + `param=key`). */
export function BarChartCard({ title, description, data, link, colour = "primary", controls, action, unit = "money" }: { title: ReactNode; description?: ReactNode; data: Bucket[]; link?: ChartLink; colour?: "primary" | "bu" | "stage"; controls?: ReactNode; action?: ReactNode; unit?: "money" | "count" }) {
  const router = useRouter();
  const rows = data.filter((d) => d.value > 0 || d.count > 0);
  const href = link ? (b: Bucket) => `${link.base}${link.base.includes("?") ? "&" : "?"}${link.param}=${encodeURIComponent(b.key)}` : null;
  const config: ChartConfig = { value: { label: "Value" } };
  const fill = (b: Bucket) => (colour === "bu" && b.colourToken ? BU_SOLID[b.colourToken] ?? "var(--primary)" : colour === "stage" ? ORDERED[b.key] ?? "var(--primary)" : "var(--primary)");
  const fmt = (v: number) => (unit === "money" ? inr(v) : String(v));
  return (
    <ChartCard title={title} description={description} controls={controls} action={action}>
      {rows.length === 0 ? (
        <EmptyState title="Nothing in this view" className="py-8" />
      ) : (
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(120, rows.length * 34) }}>
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 84, top: 4, bottom: 4 }} barCategoryGap={8}>
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval={0} />
            <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent formatter={(v, _n, item) => <span className="tabular">{fmt(Number(v))} · {(item.payload as Bucket).count} deal{(item.payload as Bucket).count === 1 ? "" : "s"}</span>} hideLabel={false} />} />
            <Bar dataKey="value" radius={3} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)", formatter: (v: unknown) => fmt(Number(v)) }} onClick={(d) => href && router.push(href(d as unknown as Bucket))} className={href ? "cursor-pointer" : undefined}>
              {rows.map((b) => (
                <Cell key={b.key} fill={fill(b)} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

export type Series = { key: string; label: string; colour: string };
export type FlowView = { key: string; label: string; series: Series[]; data: Record<string, number | string>[]; unit?: "money" | "count" };

/** Two or three thin series per day with light gridlines and legend dots; a segmented control switches the view. */
export function FlowCard({ title, description, views, link, onBarClick }: { title: ReactNode; description?: ReactNode; views: FlowView[]; link?: { href: string; label: string }; onBarClick?: (day: string) => string }) {
  const router = useRouter();
  const [key, setKey] = useState(views[0]?.key ?? "");
  const view = views.find((v) => v.key === key) ?? views[0]!;
  const config: ChartConfig = Object.fromEntries(view.series.map((s) => [s.key, { label: s.label, color: s.colour }]));
  const fmt = (v: number) => (view.unit === "money" ? inr(v) : String(v));
  const empty = view.data.every((d) => view.series.every((s) => !Number(d[s.key])));
  return (
    <ChartCard
      title={title}
      description={description}
      controls={
        <>
          {views.length > 1 && <Segmented size="sm" options={views.map((v) => ({ value: v.key, label: v.label }))} value={view.key} onChange={setKey} aria-label="Chart view" />}
          {link && <ArrowLink href={link.href}>{link.label}</ArrowLink>}
        </>
      }
    >
      {empty ? (
        <EmptyState title="Nothing in this window" className="py-8" />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <BarChart data={view.data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="35%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={36} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} tickFormatter={(v: number) => (view.unit === "money" ? inr(v) : String(v))} />
            <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent formatter={(v, name) => <span className="tabular">{config[String(name)]?.label}: {fmt(Number(v))}</span>} />} />
            {view.series.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.colour} radius={[2, 2, 0, 0]} maxBarSize={10} onClick={(d) => onBarClick && router.push(onBarClick(String((d as unknown as { day: string }).day)))} className={onBarClick ? "cursor-pointer" : undefined} />
            ))}
          </BarChart>
        </ChartContainer>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm">
        {view.series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.colour }} />{s.label}</span>
        ))}
      </div>
    </ChartCard>
  );
}

export type Slice = { key: string; label: string; value: number; colour?: string; href?: string };

/** A donut with a centre value and a legend table (name, count, share). */
export function DonutCard({ title, description, data, centre, footer, action, unit = "count", className }: { title: ReactNode; description?: ReactNode; data: Slice[]; centre: { value: ReactNode; label?: ReactNode; tone?: "default" | "red" | "green" }; footer?: ReactNode; action?: ReactNode; unit?: "count" | "money"; className?: string }) {
  const router = useRouter();
  const rows = data.map((d, i) => ({ ...d, colour: d.colour ?? CHART_SERIES[i % CHART_SERIES.length]! }));
  const total = rows.reduce((a, d) => a + d.value, 0);
  const config: ChartConfig = Object.fromEntries(rows.map((r) => [r.key, { label: r.label, color: r.colour }]));
  const fmt = (v: number) => (unit === "money" ? inr(v) : v.toLocaleString("en-IN"));
  return (
    <ChartCard title={title} description={description} action={action} className={className}>
      {total === 0 ? (
        <EmptyState title="Nothing in this view" className="py-8" />
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative size-44 shrink-0">
            <ChartContainer config={config} className="aspect-auto size-44">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" formatter={(v, _n, item) => <span className="tabular">{(item.payload as Slice).label}: {fmt(Number(v))}</span>} hideLabel />} />
                <Pie data={rows} dataKey="value" nameKey="label" innerRadius={58} outerRadius={86} paddingAngle={2} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} onClick={(d) => (d as unknown as Slice).href && router.push((d as unknown as Slice).href!)}>
                  {rows.map((r) => <Cell key={r.key} fill={r.colour} className={r.href ? "cursor-pointer" : undefined} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className={cn("text-2xl font-bold tracking-tight tabular", centre.tone === "red" && "text-tint-red-foreground", centre.tone === "green" && "text-tint-green-foreground")}>{centre.value}</div>
              {centre.label && <div className="max-w-24 text-xs leading-tight text-muted-foreground">{centre.label}</div>}
            </div>
          </div>
          <table className="min-w-0 flex-1 text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1.5 pr-3"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: r.colour }} />{r.href ? <a href={r.href} className="hover:text-link">{r.label}</a> : r.label}</span></td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular">{fmt(r.value)}</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular">{total ? Math.round((r.value / total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer && <div className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">{footer}</div>}
    </ChartCard>
  );
}
