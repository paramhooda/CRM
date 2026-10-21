import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-[1440px] px-4 pt-5 pb-4 md:px-6">
        {crumbs && (
          <nav className="mb-2 flex items-center gap-1 text-xs text-ink-3">
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {description && <div className="mt-1 text-[13px] text-ink-2">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto max-w-[1440px] px-4 py-5 md:px-6", className)}>{children}</div>;
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
        <div className="mb-1 rounded-full bg-surface-2 p-3">
          <Icon className="size-5 text-ink-3" />
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-ink-3">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  href,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: { value: string; good: boolean | null } | null;
  href?: string;
  accent?: string;
}) {
  const body = (
    <div className="relative h-full rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
      {accent && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r" style={{ background: accent }} />}
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tracking-tight text-ink">{value}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
        {delta && (
          <span
            className="font-medium"
            style={{ color: delta.good === null ? "var(--ink-2)" : delta.good ? "var(--t-green)" : "var(--t-red)" }}
          >
            {delta.value}
          </span>
        )}
        {sub}
      </div>
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

export function Meter({ value, max, color = "var(--s1)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--t-blue-bg)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function DescList({ items, cols = 2 }: { items: { label: string; value: React.ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-ink-3">{i.label}</dt>
          <dd className="mt-0.5 truncate text-[13px] text-ink">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
