import Link from "next/link";
import { Split, Users, AlertOctagon, CalendarClock, Building2, Target, Hourglass, RefreshCcw, Sparkles, ArrowUpRight } from "lucide-react";
import type { Insight } from "@/server/queries/insights";

const ICONS: Record<string, typeof Split> = {
  split: Split, users: Users, alert: AlertOctagon, calendar: CalendarClock, building: Building2, target: Target,
  hourglass: Hourglass, refresh: RefreshCcw,
};

export function InsightList({ insights, max = 4 }: { insights: Insight[]; max?: number }) {
  if (!insights.length) return <p className="text-[13px] text-ink-3">Not enough closed history yet to draw conclusions.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {insights.slice(0, max).map((i) => {
        const Icon = ICONS[i.icon] ?? Sparkles;
        const body = (
          <div className="group flex gap-3">
            <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `var(--t-${i.tone}-bg)`, color: `var(--t-${i.tone})` }}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium leading-snug text-ink group-hover:text-primary">
                {i.text}
                {i.href && <ArrowUpRight className="ml-0.5 inline size-3 opacity-0 transition-opacity group-hover:opacity-100" />}
              </p>
              {i.detail && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{i.detail}</p>}
            </div>
          </div>
        );
        return <li key={i.id}>{i.href ? <Link href={i.href}>{body}</Link> : body}</li>;
      })}
    </ul>
  );
}
