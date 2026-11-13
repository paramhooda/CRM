import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A soft-tinted number tile. Clickable when it has somewhere to take you. */
export function KpiTile({ label, value, sub, href, tone = "default", className }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: "default" | "good" | "warn" | "bad"; className?: string }) {
  const body = (
    <div className={cn("flex h-full flex-col rounded-xl border border-border bg-card-tint px-4 py-3 transition-colors", href && "hover:border-primary/40 hover:bg-accent", className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight tabular", tone === "good" && "text-success", tone === "warn" && "text-warning", tone === "bad" && "text-destructive")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
