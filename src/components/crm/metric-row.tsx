import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLink } from "./link-arrow";
import { TintIcon } from "./pills";
import type { Tone } from "./stat-tile";
import { cn } from "@/lib/utils";

export type Metric = { label: ReactNode; value: ReactNode; tone?: Tone };
const TONE: Record<Tone, string> = { default: "text-foreground", blue: "text-tint-blue-foreground", red: "text-tint-red-foreground", amber: "text-tint-amber-foreground", green: "text-tint-green-foreground" };

/** A wide card: tinted icon, title, subtitle and a link on the left; up to five metric columns on the right. */
export function MetricRow({ icon, iconTone = "blue", title, subtitle, href, linkLabel = "Open", metrics, className }: { icon: LucideIcon; iconTone?: Tone; title: ReactNode; subtitle?: ReactNode; href?: string; linkLabel?: string; metrics: Metric[]; className?: string }) {
  return (
    <div className={cn("grid gap-6 rounded-2xl border border-border bg-card px-6 py-5 shadow-card lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2.7fr)]", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <TintIcon icon={icon} tone={iconTone === "default" ? "blue" : iconTone} />
        <div className="min-w-0">
          <div className="text-base font-semibold">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</div>}
          {href && <ArrowLink href={href} className="mt-2">{linkLabel}</ArrowLink>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {metrics.map((m, i) => (
          <div key={i} className="min-w-0">
            <div className="truncate text-sm text-muted-foreground">{m.label}</div>
            <div className={cn("mt-1 text-2xl font-bold tracking-tight tabular", TONE[m.tone ?? "default"])}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One card of label/value columns (the management strip). */
export function MetricStrip({ metrics, className }: { metrics: Metric[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-6 rounded-2xl border border-border bg-card px-6 py-5 shadow-card sm:grid-cols-3 lg:grid-cols-6", className)}>
      {metrics.map((m, i) => (
        <div key={i} className="min-w-0">
          <div className="truncate text-sm text-muted-foreground">{m.label}</div>
          <div className={cn("mt-1 text-2xl font-bold tracking-tight tabular", TONE[m.tone ?? "default"])}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}
