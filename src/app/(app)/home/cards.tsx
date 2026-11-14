"use client";
import { useState } from "react";
import { BarChartCard, ChartCard, type Bucket } from "@/components/crm/charts";
import { Heatmap } from "@/components/crm/heatmap";
import { Segmented } from "@/components/crm/segmented";
import { ArrowLink } from "@/components/crm/link-arrow";

/** Stage moves by weekday and hour: the last seven days, or the whole window as a pattern. */
export function HeatCard({ week, window, weekCount, windowCount, from, to }: { week: number[][]; window: number[][]; weekCount: number; windowCount: number; from: string; to: string }) {
  const [mode, setMode] = useState<"week" | "window">("week");
  const cells = mode === "week" ? week : window;
  const n = mode === "week" ? weekCount : windowCount;
  return (
    <ChartCard title="When deals move" description={`${n} stage change${n === 1 ? "" : "s"} · ${mode === "week" ? "last 7 days" : `${from} – ${to}`} · Asia/Kolkata`} action={<Segmented size="sm" options={[{ value: "week", label: "Last 7 days" }, { value: "window", label: "Pattern" }]} value={mode} onChange={setMode} aria-label="Heatmap range" />}>
      <Heatmap cells={cells} />
    </ChartCard>
  );
}

/** Open deals by days in their stage; all of them, or only those past their close date. */
export function AgeingCard({ all, pastClose, open, overdue }: { all: Bucket[]; pastClose: Bucket[]; open: number; overdue: number }) {
  const [mode, setMode] = useState<"all" | "past">("all");
  return (
    <BarChartCard
      title="Backlog ageing"
      description={`${open} open · ${overdue} past close date · days in the current stage`}
      data={(mode === "all" ? all : pastClose).map((b) => ({ ...b, value: b.count }))}
      unit="count"
      controls={<><Segmented size="sm" options={[{ value: "all", label: "All open" }, { value: "past", label: "Past close" }]} value={mode} onChange={setMode} aria-label="Ageing scope" /><ArrowLink href="/deals?open=true">All open</ArrowLink></>}
    />
  );
}

/** Open pipeline by the person or the business unit that carries it. */
export function LoadCard({ byOwner, byBusinessUnit, dealsHref }: { byOwner: Bucket[]; byBusinessUnit: Bucket[]; dealsHref: string }) {
  const [mode, setMode] = useState<"owner" | "bu">(byOwner.length ? "owner" : "bu");
  return (
    <BarChartCard
      title="Who carries the load"
      description="Open pipeline by sales person or business unit; a bar opens the deals"
      data={mode === "owner" ? byOwner : byBusinessUnit}
      colour={mode === "bu" ? "bu" : "primary"}
      link={{ base: dealsHref, param: mode === "owner" ? "owner" : "bu" }}
      controls={<>{byOwner.length > 0 && <Segmented size="sm" options={[{ value: "owner", label: "By sales person" }, { value: "bu", label: "By BU" }]} value={mode} onChange={setMode} aria-label="Load scope" />}<ArrowLink href={dealsHref}>All open</ArrowLink></>}
    />
  );
}
