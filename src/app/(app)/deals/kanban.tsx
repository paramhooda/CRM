import Link from "next/link";
import type { DealListRow } from "@/server/services/deals";
import { STAGE_META, type Stage } from "@/domain/stages";
import { ForecastPill, BuTag } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { EmptyState } from "@/components/crm/states";
import { fmtDate, inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLUMNS: Stage[] = ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD"];
const HEAD: Record<string, string> = {
  QUALIFIED: "border-t-stage-qualified-foreground", BOQ: "border-t-stage-boq-foreground", PROPOSAL_SUBMITTED: "border-t-stage-proposal-foreground", NEGOTIATION: "border-t-stage-negotiation-foreground", HOLD: "border-t-stage-hold-foreground",
};

/** Read-only board of open deals. Moves happen on the deal page so every gate applies. */
export function Kanban({ rows, sales }: { rows: DealListRow[]; sales: boolean }) {
  if (!rows.length) return <EmptyState title="No open deals match" description="Change the filters, or start a new deal." />;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid min-w-[1100px] grid-cols-5 gap-3">
        {COLUMNS.map((stage) => {
          const cards = rows.filter((r) => r.stage === stage);
          const total = cards.reduce((s, r) => s + Number(r.dealValue ?? 0), 0);
          return (
            <section key={stage} className={cn("flex flex-col rounded-xl border border-border border-t-4 bg-card-tint", HEAD[stage])} aria-label={STAGE_META[stage].label}>
              <header className="flex items-baseline justify-between px-3 pt-3 pb-2">
                <h2 className="text-sm font-semibold">{STAGE_META[stage].label}</h2>
                <span className="text-xs text-muted-foreground">{cards.length}{sales ? ` · ${inr(total)}` : ""}</span>
              </header>
              <div className="flex flex-col gap-2 px-2 pb-2">
                {cards.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>}
                {cards.map((r) => (
                  <Link key={r.id} href={`/deals/${r.id}`} className="rounded-lg border border-border bg-card p-3 text-sm shadow-xs transition-colors hover:border-primary/40">
                    <div className="line-clamp-2 font-medium">{r.name}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.account.name}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {r.businessUnits.slice(0, 2).map((b) => <BuTag key={b.id} name={b.name} colourToken={b.colourToken} />)}
                      {sales && r.forecastCategory && <ForecastPill forecast={r.forecastCategory} />}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{r.owner.fullName.split(" ")[0]} · {fmtDate(r.expectedCloseDate)}</span>
                      {sales ? <Money value={r.dealValue} className="font-medium text-foreground" /> : <span>{r.lineCount} line{r.lineCount === 1 ? "" : "s"}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
