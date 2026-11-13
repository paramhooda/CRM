"use client";
import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./states";
import { BU_SOLID, CHART_MAGNITUDE } from "./pills";
import { inr } from "@/domain/money";

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

/** A horizontal bar chart of amounts by bucket. Every bar links to the matching filtered list (`base` + `param=key`). */
export function BarChartCard({ title, description, data, link, colour = "primary" }: { title: string; description?: string; data: Bucket[]; link?: ChartLink; colour?: "primary" | "bu" | "stage" }) {
  const router = useRouter();
  const rows = data.filter((d) => d.value > 0 || d.count > 0);
  const href = link ? (b: Bucket) => `${link.base}${link.base.includes("?") ? "&" : "?"}${link.param}=${encodeURIComponent(b.key)}` : null;
  const config: ChartConfig = { value: { label: "Value" } };
  const fill = (b: Bucket) => (colour === "bu" && b.colourToken ? BU_SOLID[b.colourToken] ?? "var(--primary)" : colour === "stage" ? ORDERED[b.key] ?? "var(--primary)" : "var(--primary)");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="Nothing in this view" className="py-8" />
        ) : (
          <ChartContainer config={config} className="w-full" style={{ height: Math.max(120, rows.length * 34) }}>
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 84, top: 4, bottom: 4 }} barCategoryGap={8}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} interval={0} />
              <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent formatter={(v, _n, item) => <span className="tabular">{inr(Number(v))} · {(item.payload as Bucket).count} deal{(item.payload as Bucket).count === 1 ? "" : "s"}</span>} hideLabel={false} />} />
              <Bar dataKey="value" radius={3} label={{ position: "right", fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)", formatter: (v: unknown) => inr(Number(v)) }} onClick={(d) => href && router.push(href(d as unknown as Bucket))} className={href ? "cursor-pointer" : undefined}>
                {rows.map((b) => (
                  <Cell key={b.key} fill={fill(b)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
