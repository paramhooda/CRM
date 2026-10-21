"use client";
import { useState } from "react";
import { Check, Trophy, XCircle, PauseCircle, Ban } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { STAGE_META, ACTIVE_STAGES, type StageKey } from "@/lib/constants";
import { changeStage } from "@/server/actions/opportunities";
import { useAction } from "@/components/crm/use-action";
import { isoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StagePath({
  id, stage, canEdit, lossReasons, poNumber,
}: { id: string; stage: StageKey; canEdit: boolean; lossReasons: string[]; poNumber: string | null }) {
  const { pending, run } = useAction();
  const [dialog, setDialog] = useState<null | "WON" | "LOST" | "DROPPED">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const curOrder = STAGE_META[stage].order;
  const closed = stage === "WON" || stage === "LOST" || stage === "DROPPED";

  const move = (to: StageKey, extra: Record<string, unknown> = {}) =>
    run(() => changeStage(id, { stage: to, ...extra }), {
      success: `Moved to ${STAGE_META[to].label}`,
      onOk: () => setDialog(null),
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-border">
        {ACTIVE_STAGES.map((s, i) => {
          const done = !closed ? STAGE_META[s].order < curOrder && stage !== "HOLD" : stage === "WON";
          const current = s === stage;
          return (
            <li key={s} className="min-w-0 flex-1">
              <button
                disabled={!canEdit || pending || current}
                onClick={() => move(s)}
                title={canEdit ? `Move to ${STAGE_META[s].label}` : STAGE_META[s].label}
                className={cn(
                  "flex h-8 w-full items-center justify-center gap-1 truncate px-2 text-xs font-medium transition-colors",
                  i > 0 && "border-l border-border",
                  current && "bg-primary text-primary-ink",
                  done && !current && "bg-[var(--t-blue-bg)] text-[var(--t-blue)]",
                  !done && !current && "bg-surface text-ink-3",
                  canEdit && !current && "hover:bg-surface-hover hover:text-ink cursor-pointer",
                )}
              >
                {done && !current && <Check className="size-3 shrink-0" />}
                <span className="truncate">{STAGE_META[s].label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <div className="flex gap-1.5">
          {!closed && stage !== "HOLD" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => move("HOLD")}><PauseCircle /> Hold</Button>
          )}
          {!closed && (
            <>
              <Button size="sm" disabled={pending} onClick={() => { setErrors({}); setDialog("WON"); }} style={{ color: "var(--t-green)" }}><Trophy /> Won</Button>
              <Button size="sm" disabled={pending} onClick={() => { setErrors({}); setDialog("LOST"); }} style={{ color: "var(--t-red)" }}><XCircle /> Lost</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setErrors({}); setDialog("DROPPED"); }}><Ban /> Drop</Button>
            </>
          )}
          {closed && (
            <Button size="sm" disabled={pending} onClick={() => move("NEGOTIATION")}>Reopen</Button>
          )}
        </div>
      )}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog === "WON" && (
          <DialogContent title="Close as won" description="Capture the customer purchase order. This locks the BOQ and accepts the latest quote.">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                move("WON", { poNumber: f.get("poNumber"), poDate: f.get("poDate") });
              }}
            >
              <Field label="Customer PO number" required error={errors.poNumber}>
                <Input name="poNumber" defaultValue={poNumber ?? ""} autoFocus placeholder="e.g. PO/2026/1187" />
              </Field>
              <Field label="PO date" required error={errors.poDate}>
                <Input name="poDate" type="date" defaultValue={isoDate(new Date())} max={isoDate(new Date())} />
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setDialog(null)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={pending}><Trophy /> Mark as won</Button>
              </div>
            </form>
          </DialogContent>
        )}
        {(dialog === "LOST" || dialog === "DROPPED") && (
          <DialogContent
            title={dialog === "LOST" ? "Close as lost" : "Drop opportunity"}
            description="Loss reasons feed the win/loss report. Be specific in the notes."
          >
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                move(dialog, { lossReason: f.get("lossReason"), lossNotes: f.get("lossNotes") });
              }}
            >
              <Field label="Reason" required error={errors.lossReason}>
                <Select name="lossReason" defaultValue="">
                  <option value="" disabled>Select a reason</option>
                  {lossReasons.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Notes">
                <Textarea name="lossNotes" placeholder="Who won, at what price, what we learned…" />
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setDialog(null)}>Cancel</Button>
                <Button type="submit" variant="danger" disabled={pending}>Confirm</Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
