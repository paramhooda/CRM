import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Sparkline, type SparkTone } from "./sparkline";
import { TintIcon } from "./pills";
import { cn } from "@/lib/utils";

export type Tone = "default" | "blue" | "red" | "amber" | "green";
const VALUE_TONE: Record<Tone, string> = { default: "text-foreground", blue: "text-tint-blue-foreground", red: "text-tint-red-foreground", amber: "text-tint-amber-foreground", green: "text-tint-green-foreground" };

/** A change against the previous window. `invert` when a fall is good (fewer overdue deals). */
export function DeltaPill({ pct, invert, className }: { pct: number | null; invert?: boolean; className?: string }) {
  if (pct === null || !Number.isFinite(pct)) return null;
  const up = pct > 0;
  const good = pct === 0 ? null : invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-xs font-medium tabular", good === null ? "bg-muted text-muted-foreground" : good ? "bg-tint-green text-tint-green-foreground" : "bg-tint-red text-tint-red-foreground", className)}>
      <Icon className="size-3.5" />
      {Math.abs(pct).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%
    </span>
  );
}

/**
 * The number tile: label, tinted icon, big value (coloured when it is a status), a sparkline, a delta pill and
 * a note. The order label → value → note is relied on by the browser tests.
 */
export function StatTile({ label, value, tone = "default", icon, iconTone = "blue", series, delta, note, href, className }: {
  label: ReactNode; value: ReactNode; tone?: Tone; icon?: LucideIcon; iconTone?: Tone; series?: number[]; delta?: { pct: number | null; invert?: boolean } | null; note?: ReactNode; href?: string; className?: string;
}) {
  const sparkTone: SparkTone = (tone === "default" ? iconTone : tone) === "default" ? "blue" : ((tone === "default" ? iconTone : tone) as SparkTone);
  const body = (
    <div className={cn("flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-colors", href && "hover:border-border-strong", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {icon && <TintIcon icon={icon} tone={iconTone === "default" ? "blue" : iconTone} />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div data-slot="stat-value" className={cn("min-w-0 whitespace-nowrap text-[2rem] font-bold leading-none tracking-tight tabular", VALUE_TONE[tone])}>{value}</div>
        {series && series.length > 1 && <Sparkline data={series} tone={sparkTone} className="h-11 w-24 shrink" />}
      </div>
      {(delta !== undefined || note) && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          {delta && <DeltaPill pct={delta.pct} invert={delta.invert} />}
          {note && <span data-slot="stat-note" className="truncate">{note}</span>}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
