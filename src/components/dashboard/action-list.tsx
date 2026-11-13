"use client";
// "Needs your action": one line per deal waiting on sales, most urgent first. Clicking a line opens the deal.
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import type { ActionItem } from "@/lib/action-items";
import { cn } from "@/lib/utils";

const URGENT = new Set(["ANSWER_PRESALES", "QUOTE_EXPIRED", "RECORD_PO", "REVISE_QUOTE", "QUOTE_EXPIRING", "APPROVE_PRICES", "PRICES_APPROVED", "PRICES_REJECTED"]);
const SHOW = 8;

export function ActionList({ items, showOwner }: { items: ActionItem[]; showOwner: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOW);
  return (
    <section aria-label="Needs your action" className="rounded-xl border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-sm font-semibold">Needs your action</h2>
        {items.length > 0 && <span className="text-xs text-ink-3">{items.length} deal{items.length > 1 ? "s" : ""}</span>}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-[13px] text-ink-2">
          <CheckCircle2 className="size-4 text-[var(--t-green)]" /> Nothing waiting on you right now.
        </p>
      ) : (
        <ul>
          {shown.map((i) => (
            <li key={i.dealId} className="border-t border-border">
              <Link href={`/opportunities/${i.dealId}`} className="group flex items-center gap-3 px-5 py-2.5 hover:bg-surface-hover">
                <span className={cn("size-2 shrink-0 rounded-full", URGENT.has(i.kind) ? "bg-[var(--t-red)]" : "bg-[var(--t-amber)]")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{i.label}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {i.deal} · {i.account}{showOwner ? ` · ${i.owner}` : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > SHOW && (
        <button type="button" onClick={() => setAll((x) => !x)} className="w-full border-t border-border px-5 py-2.5 text-left text-xs font-medium text-primary hover:bg-surface-hover cursor-pointer">
          {all ? "Show fewer" : `See all ${items.length}`}
        </button>
      )}
    </section>
  );
}
