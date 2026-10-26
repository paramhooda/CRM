"use client";
// The deal's stage bar. Only the moves the process allows are clickable; every other stage explains why not
// (the server enforces the same rules, see src/lib/stage-rules.ts).
import { useState } from "react";
import { Check, Trophy, XCircle, PauseCircle, Ban, PlayCircle, RotateCcw, Lock } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { STAGE_META, ACTIVE_STAGES, type StageKey } from "@/lib/constants";
import type { Move } from "@/lib/stage-rules";
import { changeStage } from "@/server/actions/opportunities";
import { useAction } from "@/components/crm/use-action";
import { isoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Pending = { move: Move; title: string; description: string; confirm: string } | null;

export function StagePath({
  id, stage, moves, lossReasons, poNumber, holdReason,
}: { id: string; stage: StageKey; moves: Move[]; lossReasons: string[]; poNumber: string | null; holdReason?: string | null }) {
  const { pending, run } = useAction();
  const [dialog, setDialog] = useState<Pending>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const byStage = new Map(moves.map((m) => [m.to, m]));
  const curOrder = STAGE_META[stage].order;
  const closed = stage === "WON" || stage === "LOST" || stage === "DROPPED";
  const canEdit = moves.some((m) => m.allowed);

  const go = (to: StageKey, extra: Record<string, unknown> = {}) =>
    run(() => changeStage(id, { stage: to, ...extra }), {
      success: `Moved to ${STAGE_META[to].label}`,
      onOk: () => setDialog(null),
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });

  const open = (m: Move) => {
    setErrors({});
    if (!m.needs) return go(m.to);
    const label = STAGE_META[m.to].label;
    const copy: Record<Move["kind"], [string, string, string]> = {
      hold: ["Put on hold", "The deal leaves the forecast until it resumes. It resumes to the stage it is in now.", "Put on hold"],
      back: [`Move back to ${label}`, "Moving a deal back is a correction. The reason is recorded in the stage history.", "Move back"],
      reopen: [`Reopen to ${label}`, "The deal returns to the open pipeline. The reason is recorded in the stage history.", "Reopen"],
      close: [m.to === "WON" ? "Close as won" : m.to === "LOST" ? "Close as lost" : "Drop opportunity", m.to === "WON" ? "Capture the customer purchase order. This locks the line items for billing and accepts the latest quote." : "Loss reasons feed the win/loss report. Be specific in the notes.", m.to === "WON" ? "Mark as won" : "Confirm"],
      forward: [label, "", "Move"],
      resume: [label, "", "Resume"],
    };
    const [title, description, confirm] = copy[m.kind];
    setDialog({ move: m, title, description, confirm });
  };

  const action = (to: StageKey, node: (m: Move) => React.ReactNode) => {
    const m = byStage.get(to);
    if (!m || (!m.allowed && !canEdit)) return null;
    if (m.allowed) return node(m);
    return (
      <Tooltip content={m.reason}>
        <span tabIndex={0} className="inline-flex">{node(m)}</span>
      </Tooltip>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol className="flex w-full min-w-0 overflow-hidden rounded-md border border-border lg:w-auto lg:flex-1" aria-label="Stage">
        {ACTIVE_STAGES.map((s, i) => {
          const done = !closed ? STAGE_META[s].order < curOrder && stage !== "HOLD" : stage === "WON";
          const current = s === stage;
          const m = byStage.get(s);
          const clickable = !!m?.allowed && !pending;
          const segment = (
            <button
              type="button"
              disabled={!clickable}
              aria-current={current ? "step" : undefined}
              onClick={() => m && open(m)}
              className={cn(
                "flex h-8 w-full items-center justify-center gap-1 truncate px-2 text-xs font-medium transition-colors disabled:pointer-events-none",
                i > 0 && "border-l border-border",
                current && "bg-primary text-primary-ink",
                done && !current && "bg-[var(--t-blue-bg)] text-[var(--t-blue)]",
                !done && !current && "bg-surface text-ink-3",
                clickable && "cursor-pointer hover:bg-surface-hover hover:text-ink",
              )}
            >
              {done && !current && <Check className="size-3 shrink-0" />}
              <span className={cn("truncate", !current && "hidden sm:inline")}>{STAGE_META[s].label}</span>
            </button>
          );
          return (
            <li key={s} className={cn("min-w-0", current ? "flex-[3] sm:flex-1" : "flex-1")}>
              {!current && m && !m.allowed && canEdit ? (
                <Tooltip content={m.reason}><span className="block" tabIndex={-1}>{segment}</span></Tooltip>
              ) : (
                segment
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {stage === "HOLD" && (
          <>
            {moves.filter((m) => m.kind === "resume" && m.allowed).map((m) => (
              <Button key={m.to} size="sm" variant="primary" disabled={pending} onClick={() => open(m)}><PlayCircle /> Resume to {STAGE_META[m.to].label}</Button>
            ))}
          </>
        )}
        {!closed && stage !== "HOLD" && action("HOLD", (m) => <Button size="sm" variant="ghost" disabled={pending || !m.allowed} onClick={() => open(m)}><PauseCircle /> Hold</Button>)}
        {!closed && (
          <>
            {stage !== "HOLD" && action("WON", (m) => <Button size="sm" disabled={pending || !m.allowed} onClick={() => open(m)} style={m.allowed ? { color: "var(--t-green)" } : undefined}>{m.allowed ? <Trophy /> : <Lock />} Won</Button>)}
            {action("LOST", (m) => <Button size="sm" disabled={pending || !m.allowed} onClick={() => open(m)} style={{ color: "var(--t-red)" }}><XCircle /> Lost</Button>)}
            {action("DROPPED", (m) => <Button size="sm" variant="ghost" disabled={pending || !m.allowed} onClick={() => open(m)}><Ban /> Drop</Button>)}
          </>
        )}
        {closed && moves.filter((m) => m.kind === "reopen" && m.allowed).map((m) => (
          <Button key={m.to} size="sm" disabled={pending} onClick={() => open(m)}><RotateCcw /> Reopen</Button>
        ))}
      </div>
      {stage === "HOLD" && holdReason && <p className="w-full text-xs text-ink-3">On hold: {holdReason}</p>}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog && (
          <DialogContent title={dialog.title} description={dialog.description}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget).entries());
                go(dialog.move.to, f);
              }}
            >
              {dialog.move.needs === "po" && (
                <>
                  <Field label="Customer PO number" required error={errors.poNumber}>
                    <Input name="poNumber" defaultValue={poNumber ?? ""} autoFocus placeholder="e.g. PO/2026/1187" />
                  </Field>
                  <Field label="PO date" required error={errors.poDate}>
                    <Input name="poDate" type="date" defaultValue={isoDate(new Date())} max={isoDate(new Date())} />
                  </Field>
                </>
              )}
              {dialog.move.needs === "lossReason" && (
                <>
                  <Field label="Reason" required error={errors.lossReason}>
                    <Select name="lossReason" defaultValue="">
                      <option value="" disabled>Select a reason</option>
                      {lossReasons.map((r) => <option key={r}>{r}</option>)}
                    </Select>
                  </Field>
                  <Field label="Notes">
                    <Textarea name="lossNotes" placeholder="Who won, at what price, what we learned…" />
                  </Field>
                </>
              )}
              {dialog.move.needs === "reason" && (
                <Field label="Reason" required error={errors.note}>
                  <Textarea name="note" required minLength={3} autoFocus placeholder={dialog.move.kind === "hold" ? "e.g. Customer budget frozen until April" : "e.g. Stage was set by mistake"} />
                </Field>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setDialog(null)}>Cancel</Button>
                <Button type="submit" variant={dialog.move.to === "LOST" || dialog.move.to === "DROPPED" ? "danger" : "primary"} disabled={pending}>{dialog.confirm}</Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
