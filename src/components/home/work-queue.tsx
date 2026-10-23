"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, AlertOctagon, Clock, Inbox, Search, X } from "lucide-react";
import { MiniSelect } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/crm/badges";
import { StartPresalesButton, StartPricingButton } from "@/components/opportunities/workflow-dialogs";
import type { QueueItem } from "@/server/queries/work";
import { inr, fmtDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "overdue" | "week" | "new" | "partial";

/** Event the side panels dispatch to narrow the queue to one OEM ("Quotes to request, by OEM"). */
export const QUEUE_OEM_EVENT = "crm:queue-oem";

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export function WorkQueue({ kind, items }: { kind: "presales" | "purchase"; items: QueueItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  // Local filters: search, sort, sales person and OEM. Nothing here touches the URL.
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"due" | "value" | "priority">("due");
  const [owner, setOwner] = useState("all");
  const [oem, setOem] = useState("all");
  useEffect(() => {
    const on = (e: Event) => setOem((e as CustomEvent<string>).detail || "all");
    window.addEventListener(QUEUE_OEM_EVENT, on);
    return () => window.removeEventListener(QUEUE_OEM_EVENT, on);
  }, []);
  const owners = [...new Set(items.map((i) => i.opp.salesOwner))].sort();
  const oems = [...new Set(items.flatMap((i) => i.oems ?? []))].sort();
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
  const term = q.trim().toLowerCase();
  const shown = items
    .filter((i) =>
      filter === "all" ? true : filter === "overdue" ? i.overdue : filter === "week" ? i.dueThisWeek : filter === "new" ? i.notStarted : (i.costed ?? 0) > 0 && (i.costed ?? 0) < i.lines,
    )
    .filter((i) => owner === "all" || i.opp.salesOwner === owner)
    .filter((i) => oem === "all" || (i.oems ?? []).includes(oem))
    .filter((i) => !term || `${i.opp.name} ${i.opp.code} ${i.opp.account} ${i.requestedBy} ${(i.oems ?? []).join(" ")}`.toLowerCase().includes(term))
    .sort((a, b) =>
      sort === "value" ? b.opp.amount - a.opp.amount : sort === "priority" ? (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) || a.dueDate.getTime() - b.dueDate.getTime() : 0,
    );
  const narrowed = owner !== "all" || oem !== "all" || !!term;

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
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
        <div className="relative min-w-0 flex-1 sm:max-w-56">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search deal, customer, OEM"
            aria-label="Search queue"
            className="h-7 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-xs outline-none placeholder:text-ink-3 hover:border-border-strong focus:border-ring"
          />
        </div>
        <MiniSelect label="Sort queue" value={sort} onChange={setSort} options={[{ value: "due", label: "Due date" }, { value: "value", label: "Deal value" }, { value: "priority", label: "Priority" }]} />
        {owners.length > 1 && (
          <MiniSelect label="Sales person" value={owner} onChange={setOwner} options={[{ value: "all", label: "All sales people" }, ...owners.map((o) => ({ value: o, label: o }))]} />
        )}
        {oems.length > 1 && <MiniSelect label="OEM" value={oem} onChange={setOem} options={[{ value: "all", label: "All OEMs" }, ...oems.map((o) => ({ value: o, label: o }))]} />}
        {narrowed && (
          <button onClick={() => { setQ(""); setOwner("all"); setOem("all"); }} className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-ink-3 hover:bg-surface-hover hover:text-ink cursor-pointer">
            <X className="size-3" /> Clear
          </button>
        )}
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
                  <span>{i.opp.salesOwner}</span><span>·</span>
                  {kind === "purchase" && (
                    <>
                      <Avatar name={i.requestedBy} className="size-4 text-[8px]" />
                      <span>{i.requestedBy}</span><span>·</span>
                    </>
                  )}
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

/** Uncosted lines grouped by OEM. Clicking an OEM narrows the pricing queue to deals with that OEM. */
export function RfqByOem({ rows }: { rows: { oem: string; lines: number; deals: number }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.lines));
  const pick = (oem: string | null) => {
    setActive(oem);
    window.dispatchEvent(new CustomEvent(QUEUE_OEM_EVENT, { detail: oem ?? "" }));
    if (oem) document.querySelector("[data-testid=work-queue]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!rows.length) return <p className="text-[13px] text-ink-3">Every line in your queue has a cost.</p>;
  return (
    <ul className="-mx-2 flex flex-col gap-0.5">
      {rows.map((r) => (
        <li key={r.oem}>
          <button
            onClick={() => pick(active === r.oem ? null : r.oem)}
            aria-pressed={active === r.oem}
            title={active === r.oem ? "Show all OEMs in the queue" : `Show only ${r.oem} deals in the queue`}
            className={cn(
              "grid w-full grid-cols-[110px_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer",
              active === r.oem ? "bg-primary-soft" : "hover:bg-surface-hover",
            )}
          >
            <span className={cn("truncate text-[13px]", active === r.oem && "font-medium text-[var(--t-blue)]")}>{r.oem}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--t-blue-bg)]">
              <div className="h-full rounded-full bg-[var(--s1)]" style={{ width: `${(r.lines / max) * 100}%` }} />
            </div>
            <span className="text-xs tabular text-ink-3">{r.lines} line{r.lines === 1 ? "" : "s"} · {r.deals} deal{r.deals === 1 ? "" : "s"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
