"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, AlertOctagon, Clock, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/crm/badges";
import { StartPresalesButton, StartPricingButton } from "@/components/opportunities/workflow-dialogs";
import type { QueueItem } from "@/server/queries/work";
import { inr, fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "overdue" | "week" | "new" | "partial";

export function WorkQueue({ kind, items }: { kind: "presales" | "purchase"; items: QueueItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = {
    all: items.length,
    overdue: items.filter((i) => i.overdue).length,
    week: items.filter((i) => i.dueThisWeek).length,
    new: items.filter((i) => i.notStarted).length,
    partial: items.filter((i) => (i.costed ?? 0) > 0 && (i.costed ?? 0) < i.lines).length,
  };
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All open" },
    { key: "overdue", label: "Overdue" },
    { key: "week", label: "Due this week" },
    { key: "new", label: "Not started" },
    ...(kind === "purchase" ? [{ key: "partial" as const, label: "Partly costed" }] : []),
  ];
  const shown = items.filter((i) =>
    filter === "all" ? true : filter === "overdue" ? i.overdue : filter === "week" ? i.dueThisWeek : filter === "new" ? i.notStarted : (i.costed ?? 0) > 0 && (i.costed ?? 0) < i.lines,
  );

  return (
    <div className="rounded-xl border border-border bg-surface" data-testid="work-queue">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4">
        <h2 className="mr-auto text-sm font-semibold">{kind === "presales" ? "My BOQ queue" : "My pricing queue"}</h2>
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-0.5" role="tablist">
          {chips.map((c) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={filter === c.key}
              onClick={() => setFilter(c.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer",
                filter === c.key ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink",
              )}
            >
              {c.label}
              <span className={cn("tabular", c.key === "overdue" && counts.overdue ? "text-[var(--t-red)]" : "text-ink-3")}>{counts[c.key]}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t border-border px-6 py-14 text-center">
          <div className="rounded-xl bg-surface-2 p-3"><Inbox className="size-5 text-ink-3" /></div>
          <p className="text-sm font-medium">{items.length === 0 ? "You're all caught up" : "Nothing in this view"}</p>
          <p className="text-[13px] text-ink-3">{items.length === 0 ? "New requests will appear here and in your notifications." : "Try another filter."}</p>
        </div>
      ) : (
        <ul>
          {shown.map((i) => (
            <li key={i.id} className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center">
              <DueBlock item={i} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/opportunities/${i.opp.id}?tab=boq`} className="truncate text-sm font-medium hover:text-primary">{i.opp.name}</Link>
                  {i.priority !== "NORMAL" && <Badge tone={i.priority === "URGENT" ? "red" : "orange"}>{i.priority.toLowerCase()}</Badge>}
                  {i.status === "IN_PROGRESS" && <Badge tone="violet" dot>In progress</Badge>}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-3">
                  <span>{i.opp.account}</span><span>·</span>
                  <Avatar name={i.requestedBy} className="size-4 text-[8px]" />
                  <span>{i.requestedBy}</span><span>·</span>
                  <span>{kind === "purchase" ? `${i.costed}/${i.lines} lines costed` : `${i.lines} line${i.lines === 1 ? "" : "s"} so far`}</span><span>·</span>
                  <span className="tabular">{inr(i.opp.amount)}</span>
                </p>
                {kind === "purchase" && i.lines > 0 && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[var(--t-amber-bg)]">
                      <div className="h-full rounded-full" style={{ width: `${((i.costed ?? 0) / i.lines) * 100}%`, background: "var(--s4)" }} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {i.oems?.slice(0, 4).map((o) => <span key={o} className="rounded-md border border-border px-1.5 text-[11px] text-ink-2">{o}</span>)}
                    </div>
                  </div>
                )}
                {kind === "presales" && i.note && <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">{i.note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {i.notStarted && (kind === "presales" ? <StartPresalesButton requestId={i.id} /> : <StartPricingButton requestId={i.id} />)}
                <Link
                  href={`/opportunities/${i.opp.id}?tab=boq`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-ink hover:bg-primary-hover"
                >
                  {kind === "presales" ? "Open BOQ" : "Price it"} <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DueBlock({ item }: { item: QueueItem }) {
  const days = Math.round((item.dueDate.getTime() - Date.now()) / 86_400_000);
  return (
    <div
      className="flex w-[92px] shrink-0 flex-col rounded-lg px-2.5 py-2"
      style={{ background: item.overdue ? "var(--t-red-bg)" : item.dueThisWeek ? "var(--t-amber-bg)" : "var(--surface-2)" }}
    >
      <span className="flex items-center gap-1 text-[11px]" style={{ color: item.overdue ? "var(--t-red)" : item.dueThisWeek ? "var(--t-amber)" : "var(--ink-3)" }}>
        {item.overdue ? <AlertOctagon className="size-3" /> : <Clock className="size-3" />}
        {item.overdue ? "Overdue" : "Due"}
      </span>
      <span className="text-[13px] font-semibold tabular" style={{ color: item.overdue ? "var(--t-red)" : "var(--ink)" }}>
        {item.overdue ? `${-days || 1}d late` : days <= 1 ? relativeDays(item.dueDate) : fmtDate(item.dueDate, "short")}
      </span>
    </div>
  );
}
