"use client";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { changeStage } from "@/server/actions/opportunities";
import { STAGE_META, type StageKey } from "@/lib/constants";
import { inr, fmtDate } from "@/lib/format";
import { HealthBadge, Avatar } from "@/components/crm/badges";
import { sortFlags, FLAG_META } from "@/lib/rules/flags";
import { cn } from "@/lib/utils";

export type Card = {
  id: string; name: string; code: string; account: string; amount: number; /** Whole deal, when amount is a filtered share */ dealAmount?: number; stage: string; probability: number; healthLabel: string;
  healthScore: number; flags: string[]; expectedCloseDate: string; owner: string; salesOwnerId: string; forecastCategory: string;
};

const COLUMNS: StageKey[] = ["IDENTIFIED", "QUALIFIED", "BOQ", "PRICING", "PROPOSAL", "NEGOTIATION", "HOLD"];

export function Kanban({ cards, editableIds }: { cards: Card[]; editableIds: string[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [optimistic, move] = useOptimistic(cards, (state, a: { id: string; stage: string }) =>
    state.map((c) => (c.id === a.id ? { ...c, stage: a.stage } : c)),
  );
  const [over, setOver] = useState<string | null>(null);
  const editable = new Set(editableIds);

  function drop(stage: StageKey, id: string) {
    const c = optimistic.find((x) => x.id === id);
    if (!c || c.stage === stage) return;
    if (!editable.has(id)) return void toast.error("Only the deal owner or a manager can move this deal.");
    start(async () => {
      move({ id, stage });
      const r = await changeStage(id, { stage });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`${c.name} → ${STAGE_META[stage].label}`);
        if (r.warning) toast.warning(r.warning);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
      {COLUMNS.map((s) => {
        const items = optimistic.filter((c) => c.stage === s).sort((a, b) => b.amount - a.amount);
        const total = items.reduce((a, c) => a + c.amount, 0);
        const weighted = items.reduce((a, c) => a + (c.amount * c.probability) / 100, 0);
        return (
          <div
            key={s}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); drop(s, e.dataTransfer.getData("text/plain")); }}
            className={cn(
              "flex w-[288px] shrink-0 flex-col rounded-xl border bg-surface-2/60 transition-colors",
              over === s ? "border-primary bg-primary-soft" : "border-border",
            )}
          >
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: `var(--t-${STAGE_META[s].tone})` }} />
                <p className="text-[13px] font-semibold">{STAGE_META[s].label}</p>
                <span className="ml-auto rounded-full bg-surface px-1.5 text-[11px] tabular text-ink-2">{items.length}</span>
              </div>
              <p className="mt-0.5 text-xs tabular text-ink-3">
                {inr(total)} {s !== "HOLD" && <>· weighted {inr(weighted)}</>}
              </p>
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-2.5 p-2.5">
              {items.map((c) => {
                const flags = sortFlags(c.flags);
                const overdue = new Date(c.expectedCloseDate) < new Date();
                return (
                  <div
                    key={c.id}
                    draggable={editable.has(c.id)}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                    className={cn("group rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-border-strong", editable.has(c.id) && "cursor-grab active:cursor-grabbing")}
                  >
                    <Link href={`/opportunities/${c.id}`} className="block text-[13px] font-medium leading-snug hover:text-primary">{c.name}</Link>
                    <p className="mt-0.5 truncate text-xs text-ink-3">{c.account}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[13px] font-semibold tabular" title={c.dealAmount && c.dealAmount !== c.amount ? `Filtered share of a ${inr(c.dealAmount)} deal` : undefined}>
                        {inr(c.amount)}
                        {c.dealAmount !== undefined && Math.round(c.dealAmount) !== Math.round(c.amount) && <span className="ml-1 text-[11px] font-normal text-ink-3">of {inr(c.dealAmount)}</span>}
                      </span>
                      <HealthBadge label={c.healthLabel} score={c.healthScore} compact />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                      <Avatar name={c.owner} className="size-5 text-[9px]" />
                      <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-[var(--t-red)]")}>
                        <CalendarClock className="size-3" /> {fmtDate(c.expectedCloseDate, "short")}
                      </span>
                      {flags.length > 0 && (
                        <span className="ml-auto inline-flex items-center gap-0.5" title={flags.map((f) => FLAG_META[f].label).join(", ")} style={{ color: "var(--t-orange)" }}>
                          <AlertTriangle className="size-3" /> {flags.length}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <p className="py-6 text-center text-xs text-ink-3">Drop deals here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
