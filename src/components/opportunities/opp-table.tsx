"use client";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { OppRow } from "@/server/queries/opportunities";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { StageBadge, HealthBadge, ForecastBadge, PersonCell } from "@/components/crm/badges";
import { FlagChips } from "@/components/crm/flag-chips";
import { inr, fmtDate, relativeDays, pct } from "@/lib/format";
import { REVENUE_MODEL_LABEL, ACCOUNT_TYPE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Col = { id: string; label: string; sort?: string; align?: "right"; def: boolean; render: (o: OppRow) => React.ReactNode; className?: string };

const COLS: Col[] = [
  {
    id: "name", label: "Opportunity", sort: "name", def: true, className: "min-w-[240px]",
    render: (o) => (
      <div className="min-w-0">
        <Link href={`/opportunities/${o.id}`} className="block truncate font-medium text-ink hover:text-primary">{o.name}</Link>
        <span className="text-xs text-ink-3">{o.code} · {o.account.name}</span>
      </div>
    ),
  },
  { id: "amount", label: "Deal value", sort: "amount", align: "right", def: true, render: (o) => <span className="font-medium tabular">{inr(o.amount)}</span> },
  { id: "stage", label: "Stage", sort: "stage", def: true, render: (o) => <StageBadge stage={o.stage} /> },
  { id: "health", label: "Health", sort: "health", def: true, render: (o) => <HealthBadge label={o.healthLabel} score={o.healthScore} /> },
  { id: "flags", label: "Concerns", def: false, className: "min-w-[180px]", render: (o) => <FlagChips flags={o.flags} max={2} /> },
  { id: "close", label: "Close date", sort: "close", def: true, render: (o) => (
      <span className={cn("tabular", o.expectedCloseDate < new Date() && !["WON", "LOST", "DROPPED"].includes(o.stage) && "text-[var(--t-red)] font-medium")}>
        {fmtDate(o.expectedCloseDate)}
        {o.closeDateSlipCount > 0 && <span className="ml-1 text-xs text-ink-3">↻{o.closeDateSlipCount}</span>}
      </span>
    ) },
  { id: "forecast", label: "Forecast", def: false, render: (o) => <ForecastBadge value={o.forecastCategory} /> },
  { id: "owner", label: "Sales person", def: true, render: (o) => <PersonCell name={o.salesOwner.name} /> },
  { id: "bu", label: "BU / Category", def: false, render: (o) => <span className="text-xs"><span className="block">{o.businessUnit.name}</span><span className="text-ink-3">{o.category.name}</span></span> },
  { id: "oem", label: "OEM", def: false, render: (o) => o.oem?.name ?? "—" },
  { id: "activity", label: "Last activity", sort: "activity", def: false, render: (o) => <span className="text-xs text-ink-2">{relativeDays(o.lastActivityAt)}</span> },
  { id: "presales", label: "Presales", def: false, render: (o) => <PersonCell name={o.presalesOwner?.name} /> },
  { id: "rev", label: "Revenue model", def: false, render: (o) => REVENUE_MODEL_LABEL[o.revenueModel] },
  { id: "atype", label: "Account type", def: false, render: (o) => ACCOUNT_TYPE_LABEL[o.accountType] },
  { id: "prob", label: "Prob.", align: "right", def: false, render: (o) => <span className="tabular">{o.probability}%</span> },
  { id: "margin", label: "Margin", align: "right", def: false, render: (o) => (o.expectedMarginPct === null ? "—" : <span className="tabular">{pct(o.expectedMarginPct, 1)}</span>) },
  { id: "next", label: "Next step", def: false, className: "max-w-[220px]", render: (o) => <span className="block truncate text-xs text-ink-2">{o.nextStep ?? "—"}</span> },
  { id: "created", label: "Created", sort: "created", def: false, render: (o) => <span className="text-xs tabular">{fmtDate(o.createdAt)}</span> },
];

const STORAGE_KEY = "crm.oppTable.cols.v2";

export function OppTable({
  rows, total, page, pageSize, sortKey, dir, hideCost, scopeLabel,
}: {
  rows: OppRow[]; total: number; page: number; pageSize: number; sortKey: string; dir: "asc" | "desc"; hideCost?: boolean;
  /** Active BU / category / OEM filter name: adds a "<name> value" column with each deal's matching share */
  scopeLabel?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [visible, setVisible] = useState<string[]>(COLS.filter((c) => c.def).map((c) => c.id));
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setVisible(JSON.parse(saved));
    } catch {}
  }, []);
  const toggle = (id: string) => {
    const next = visible.includes(id) ? visible.filter((x) => x !== id) : [...visible, id];
    setVisible(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  };
  const cols = COLS.filter((c) => visible.includes(c.id) && !(hideCost && c.id === "margin"));
  if (scopeLabel) {
    const at = Math.max(1, cols.findIndex((c) => c.id === "amount") + 1);
    cols.splice(at, 0, {
      id: "scoped", label: `${scopeLabel} value`, align: "right", def: true,
      render: (o) => (
        <span className={cn("font-medium tabular text-[var(--t-blue)]", o.scopedAmount !== null && Math.round(o.scopedAmount) === Math.round(o.amount) && "text-ink-2")}>
          {o.scopedAmount === null ? "—" : inr(o.scopedAmount)}
        </span>
      ),
    });
  }

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost"><Columns3 /> Columns</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52">
            {COLS.filter((c) => c.id !== "name").map((c) => (
              <button key={c.id} onClick={() => toggle(c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-hover cursor-pointer">
                <Check className={cn("size-3.5 text-primary", visible.includes(c.id) ? "opacity-100" : "opacity-0")} strokeWidth={3} />
                {c.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <Table>
        <THead>
          <tr>
            {cols.map((c) => (
              <TH key={c.id} className={cn(c.align === "right" && "text-right", c.className)}>
                {c.sort ? (
                  <button
                    onClick={() => go({ sort: c.sort!, dir: sortKey === c.sort && dir === "desc" ? "asc" : "desc", page: null })}
                    className={cn("inline-flex items-center gap-1 hover:text-ink cursor-pointer", sortKey === c.sort && "text-ink")}
                  >
                    {c.label}
                    {sortKey === c.sort && (dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                ) : (
                  c.label
                )}
              </TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {rows.map((o) => (
            <TR key={o.id}>
              {cols.map((c) => (
                <TD key={c.id} className={cn(c.align === "right" && "text-right", c.className)}>{c.render(o)}</TD>
              ))}
            </TR>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="py-12 text-center text-sm text-ink-3">No opportunities match these filters.</td>
            </tr>
          )}
        </TBody>
      </Table>
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-ink-3">
        <span>
          {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
        </span>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft /></Button>
          <span className="tabular">{page} / {pages}</span>
          <Button size="icon-sm" variant="ghost" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })} aria-label="Next page"><ChevronRight /></Button>
        </div>
      </div>
    </div>
  );
}
