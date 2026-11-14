import { ArrowRight } from "lucide-react";
import { StagePill } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { EmptyState } from "@/components/crm/states";
import { fmtDateTime } from "@/lib/format";
import { ACTION_LABEL, entityLabel, fieldLabel } from "@/lib/labels";
import type { dealHistory } from "@/server/services/deals";
import { STAGE_META, type Stage } from "@/domain/stages";

type History = Awaited<ReturnType<typeof dealHistory>>;

/** Audit values are stored raw; stages read better by their label. */
function auditValue(field: string | null, v: string | null) {
  if (v === null || v === undefined) return "—";
  if (field === "stage" && v in STAGE_META) return STAGE_META[v as Stage].label;
  return v;
}

/** Stage changes with dates, then every audited change with its old and new value. */
export function HistoryPanel({ stages, audit, sales }: { stages: History["stages"]; audit: History["audit"]; sales: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-label="Stage history">
        <h2 className="mb-2 text-sm font-semibold">Stage history</h2>
        {stages.length === 0 ? (
          <EmptyState title="No stage changes yet" className="py-8" />
        ) : (
          <ol className="flex flex-col gap-0 rounded-xl border border-border bg-card p-4">
            {stages.map((s, i) => (
              <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                {i < stages.length - 1 && <span className="absolute top-5 left-[5px] h-full w-px bg-border" aria-hidden />}
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/15" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.fromStage && <><StagePill stage={s.fromStage as Stage} /><ArrowRight className="size-3 text-muted-foreground" /></>}
                    <StagePill stage={s.toStage as Stage} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {fmtDateTime(s.changedAt)} · {s.changedBy.fullName}
                    {s.daysInPreviousStage !== null && s.fromStage ? ` · ${s.daysInPreviousStage} days in ${s.fromLabel}` : ""}
                    {sales && s.dealValueAtChange ? <> · <Money value={s.dealValueAtChange} /></> : null}
                  </div>
                  {s.note && <div className="mt-1 text-xs">{s.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section aria-label="Changes">
        <h2 className="mb-2 text-sm font-semibold">All changes</h2>
        {audit.length === 0 ? (
          <EmptyState title="No changes recorded" className="py-8" />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Who</th><th className="px-3 py-2 font-medium">What</th><th className="px-3 py-2 font-medium">From</th><th className="px-3 py-2 font-medium">To</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {audit.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(a.changedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{a.changedBy?.fullName ?? "System"}</td>
                    <td className="px-3 py-2 text-xs"><span className="font-medium">{a.field ? fieldLabel(a.field) : ACTION_LABEL[a.action] ?? a.action}</span><span className="block text-muted-foreground">{entityLabel(a.entityType)}{a.field ? ` · ${ACTION_LABEL[a.action] ?? a.action}` : ""}</span></td>
                    <td className="max-w-48 break-words px-3 py-2 text-xs text-muted-foreground">{auditValue(a.field, a.oldValue)}</td>
                    <td className="max-w-48 break-words px-3 py-2 text-xs">{auditValue(a.field, a.newValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
