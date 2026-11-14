import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The page's top card: an eyebrow line (date or breadcrumb), a big title, a one-line description, actions on the
 * right, and an optional controls row (period, scope) under a divider.
 */
export function PageHero({ eyebrow, title, description, meta, actions, controls, className }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; meta?: ReactNode; actions?: ReactNode; controls?: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-6 rounded-2xl border border-border bg-card shadow-card", className)}>
      <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">{eyebrow}</div>}
          <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-2 text-base text-muted-foreground">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {controls && <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border px-6 py-4 sm:px-8">{controls}</div>}
    </section>
  );
}

/** A labelled control inside the hero's controls row ("Period", "Scope"). */
export function HeroControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
