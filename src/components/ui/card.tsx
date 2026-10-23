import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 rounded-xl border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

/** Tinted rounded icon used in card headers and stat tiles. `tone` is a chip tone name (blue, violet, aqua…). */
export function IconChip({ tone = "blue", children, className }: { tone?: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5", className)}
      style={{ background: `var(--t-${tone}-bg)`, color: `var(--t-${tone})` }}
    >
      {children}
    </span>
  );
}

/** Card with header and body: the standard building block for page sections. */
export function Section({
  title, description, action, icon, tone, children, className, bodyClassName, flush,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Content runs edge to edge (lists, tables) */
  flush?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader title={title} description={description} action={action} icon={icon ? <IconChip tone={tone}>{icon}</IconChip> : undefined} />
      <div className={cn(flush ? "pb-1" : "px-5 pb-5", "flex-1", bodyClassName)}>{children}</div>
    </Card>
  );
}
