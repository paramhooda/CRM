"use client";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { FLAG_META, sortFlags, type Severity } from "@/lib/rules/flags";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SEV: Record<Severity, { Icon: typeof Info; tone: string }> = {
  critical: { Icon: AlertOctagon, tone: "red" },
  serious: { Icon: AlertTriangle, tone: "orange" },
  warning: { Icon: Info, tone: "amber" },
};

export function FlagChips({ flags, max = 3, className }: { flags: string[]; max?: number; className?: string }) {
  const sorted = sortFlags(flags);
  if (!sorted.length) return null;
  const shown = sorted.slice(0, max);
  const rest = sorted.slice(max);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((f) => {
        const m = FLAG_META[f];
        const s = SEV[m.severity];
        return (
          <Tooltip key={f} content={m.hint}>
            <span
              className="inline-flex cursor-default items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4"
              style={{ background: `var(--t-${s.tone}-bg)`, color: `var(--t-${s.tone})` }}
            >
              <s.Icon className="size-3" />
              {m.label}
            </span>
          </Tooltip>
        );
      })}
      {rest.length > 0 && (
        <Tooltip content={rest.map((f) => FLAG_META[f].label).join(", ")}>
          <span className="cursor-default rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3">+{rest.length}</span>
        </Tooltip>
      )}
    </span>
  );
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEV[severity];
  return <s.Icon className={cn("size-3.5", className)} style={{ color: `var(--t-${s.tone})` }} />;
}
