import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  tabs,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
  /** Underline tabs rendered flush with the header's bottom border */
  tabs?: { href: string; label: string; active: boolean; count?: number }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div className={cn("mx-auto max-w-[1400px] px-5 pt-7 md:px-8", tabs ? "pb-0" : "pb-6")}>
        {crumbs && (
          <nav className="mb-3 flex items-center gap-1 text-xs text-ink-3">
            {crumbs.map((c, i) => (
              <React.Fragment key={c.href}>
                {i > 0 && <ChevronRight className="size-3" />}
                <Link href={c.href} className="hover:text-ink">
                  {c.label}
                </Link>
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {description && <div className="mt-1.5 text-sm text-ink-3">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
        {tabs && (
          <nav className="mt-6 flex gap-5 overflow-x-auto">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                scroll={false}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 pb-3 text-sm transition-colors",
                  t.active ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink",
                )}
              >
                {t.label}
                {t.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-px text-[11px] tabular text-ink-2">{t.count}</span>}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto max-w-[1400px] px-5 py-8 md:px-8", className)}>{children}</div>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon && (
        <div className="mb-1 rounded-xl bg-surface-2 p-3">
          <Icon className="size-5 text-ink-3" />
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-ink-3">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Signed change indicator. good=true renders green, false red, null neutral. */
export function DeltaPill({ value, good }: { value: string; good: boolean | null }) {
  const tone = good === null ? "slate" : good ? "green" : "red";
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-px text-xs font-medium tabular" style={{ background: `var(--t-${tone}-bg)`, color: `var(--t-${tone})` }}>
      {value}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  href,
  accent,
  icon,
  tone = "blue",
  chart,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { value: string; good: boolean | null } | null;
  href?: string;
  /** Legacy: colour of the small marker dot when no icon is given */
  accent?: string;
  icon?: React.ReactNode;
  tone?: string;
  /** Sparkline or meter shown under the value */
  chart?: React.ReactNode;
}) {
  const body = (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-3">{label}</p>
        {icon ? (
          <span className="inline-flex size-7 items-center justify-center rounded-lg [&_svg]:size-3.5" style={{ background: `var(--t-${tone}-bg)`, color: `var(--t-${tone})` }}>
            {icon}
          </span>
        ) : accent ? (
          <span className="size-2 rounded-full" style={{ background: accent }} />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
        {delta && <DeltaPill value={delta.value} good={delta.good} />}
      </div>
      {chart && <div className="mt-3">{chart}</div>}
      {sub && <div className="mt-auto pt-2 text-xs text-ink-3">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Meter({ value, max, color = "var(--s1)", track = "var(--t-blue-bg)" }: { value: number; max: number; color?: string; track?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: track }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function DescList({ items, cols = 2 }: { items: { label: string; value: React.ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-8 gap-y-4", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-ink-3">{i.label}</dt>
          <dd className="mt-1 truncate text-sm text-ink">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
