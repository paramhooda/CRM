"use client";
import Link from "next/link";
import { useState } from "react";
import { Flame, Skull, History, AlertTriangle, ArrowRight } from "lucide-react";
import { Avatar, HealthBadge } from "@/components/crm/badges";
import { FlagChips, SeverityIcon } from "@/components/crm/flag-chips";
import { FLAG_META, type FlagCode } from "@/lib/rules/flags";
import { inr, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MiniSelect } from "@/components/ui/segmented";

type Deal = {
  id: string; name: string; account: string; amount: number; healthLabel: string; healthScore: number; flags: string[];
  owner: string; expectedCloseDate: Date; lastActivityAt: Date | null;
};
type Change = { id: string; name: string; account: string; owner: string; amount: number; summary: string; tone: string };
type Concern = { code: string; count: number; amount: number; href: string };

export function NeedsAttention({
  hot, dying, changes, concerns, links, sinceLabel,
}: {
  hot: Deal[]; dying: Deal[]; changes: Change[]; concerns: Concern[];
  links: { hot: string; dying: string; changes: string; concerns: string };
  sinceLabel: string;
}) {
  const tabs = [
    { key: "dying", label: "Dying", icon: Skull, color: "var(--critical)", n: dying.length },
    { key: "hot", label: "Hot", icon: Flame, color: "var(--serious)", n: hot.length },
    { key: "changes", label: "Changed", icon: History, color: "var(--primary)", n: changes.length },
    { key: "concerns", label: "Concerns", icon: AlertTriangle, color: "var(--warning)", n: concerns.reduce((a, c) => a + c.count, 0) },
  ] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]["key"]>("dying");
  // Local filters for the deal lists: sort and owner. Lists come pre-sorted by value, up to 20 each.
  const [sort, setSort] = useState<"value" | "close" | "idle">("value");
  const [owner, setOwner] = useState("all");
  const owners = [...new Set([...hot, ...dying].map((d) => d.owner))].sort();
  const shape = (xs: Deal[]) =>
    xs
      .filter((d) => owner === "all" || d.owner === owner)
      .sort((a, b) =>
        sort === "close"
          ? new Date(a.expectedCloseDate).getTime() - new Date(b.expectedCloseDate).getTime()
          : sort === "idle"
            ? new Date(a.lastActivityAt ?? 0).getTime() - new Date(b.lastActivityAt ?? 0).getTime()
            : b.amount - a.amount,
      )
      .slice(0, 6);
  const blurb = {
    dying: "No activity in 21+ days, stuck in stage, or well past the close date",
    hot: "Late stage, engaged in the last 7 days and on schedule",
    changes: `What moved ${sinceLabel}`,
    concerns: "Flagged issues across open deals",
  }[tab];

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Needs attention</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">{blurb}</p>
        </div>
        <div className="inline-flex flex-wrap rounded-lg bg-surface-2 p-0.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer",
                tab === t.key ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink",
              )}
            >
              <t.icon className="size-3.5" style={{ color: t.color }} />
              {t.label}
              <span className="tabular text-ink-3">{t.n}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        {(tab === "hot" || tab === "dying") && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
              <MiniSelect
                label="Sort deals"
                value={sort}
                onChange={setSort}
                options={[{ value: "value", label: "Largest first" }, { value: "close", label: "Closing soonest" }, { value: "idle", label: "Longest idle" }]}
              />
              {owners.length > 1 && (
                <MiniSelect label="Sales person" value={owner} onChange={setOwner} options={[{ value: "all", label: "All sales people" }, ...owners.map((o) => ({ value: o, label: o }))]} />
              )}
            </div>
            <DealList deals={shape(tab === "hot" ? hot : dying)} mode={tab} empty={owner !== "all" ? "None for this sales person." : tab === "hot" ? "No hot deals right now." : "Nothing dying. Nice."} />
          </>
        )}
        {tab === "changes" && (
          changes.length === 0 ? <Empty text="No changes since your last review." /> : (
            <ul>
              {changes.map((c) => (
                <li key={c.id}>
                  <Link href={`/opportunities/${c.id}?tab=history`} className="flex items-center gap-3 border-t border-border px-5 py-3 hover:bg-surface-2/70">
                    <Avatar name={c.owner} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{c.name}</p>
                      <p className="truncate text-xs text-ink-3">{c.account} · {c.owner}</p>
                    </div>
                    <span className="hidden rounded-md px-1.5 py-0.5 text-xs sm:inline" style={{ background: `var(--t-${c.tone}-bg)`, color: `var(--t-${c.tone})` }}>{c.summary}</span>
                    <span className="w-20 text-right text-[13px] font-medium tabular">{inr(c.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "concerns" && (
          concerns.length === 0 ? <Empty text="No concerns flagged." /> : (
            <ul>
              {concerns.slice(0, 7).map((c) => {
                const m = FLAG_META[c.code as FlagCode];
                return (
                  <li key={c.code}>
                    <Link href={c.href} className="flex items-center gap-3 border-t border-border px-5 py-3 hover:bg-surface-2/70">
                      <SeverityIcon severity={m.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{m.label}</p>
                        <p className="truncate text-xs text-ink-3">{m.hint}</p>
                      </div>
                      <span className="text-xs tabular text-ink-3">{inr(c.amount)}</span>
                      <span className="min-w-7 rounded-md bg-surface-2 px-1.5 py-0.5 text-center text-xs font-medium tabular">{c.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
      <div className="border-t border-border px-5 py-3">
        <Link href={links[tab]} className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
          {tab === "changes" ? "Open pipeline review" : "View all"} <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="border-t border-border px-5 py-10 text-center text-[13px] text-ink-3">{text}</p>;
}

function DealList({ deals, mode, empty }: { deals: Deal[]; mode: "hot" | "dying"; empty: string }) {
  if (!deals.length) return <Empty text={empty} />;
  return (
    <ul>
      {deals.map((o) => (
        <li key={o.id}>
          <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 border-t border-border px-5 py-3 hover:bg-surface-2/70">
            <Avatar name={o.owner} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{o.name}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-ink-3">
                <span className="truncate">{o.account}</span><span>·</span>
                <span>{mode === "hot" ? `closes ${relativeDays(o.expectedCloseDate)}` : `last touch ${relativeDays(o.lastActivityAt)}`}</span>
              </p>
            </div>
            {mode === "dying" && <FlagChips flags={o.flags} max={1} className="hidden lg:inline-flex" />}
            <HealthBadge label={o.healthLabel} score={o.healthScore} compact />
            <span className="w-20 text-right text-[13px] font-medium tabular">{inr(o.amount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
