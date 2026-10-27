"use client";
// The deal's stage path (as in Salesforce Path): the stages show progress and cannot be clicked. One button moves the
// deal to its next stage; moving into BOQ, Pricing or Proposal Submitted is the hand-over itself, so that button opens
// it (request the BOQ, submit it, send the quote). Hold, lost, drop, move back, skip and reopen sit under More.
// The server enforces the same rules (src/lib/stage-rules.ts).
import { useState } from "react";
import { Check, Trophy, XCircle, PauseCircle, Ban, PlayCircle, RotateCcw, Lock, ArrowRight, ChevronDown, Undo2, SkipForward } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { ActionDialog, type DealAction } from "@/components/opportunities/deal-actions";
import type { Advance } from "@/components/opportunities/deal-status";
import { STAGE_META, type StageKey } from "@/lib/constants";
import type { Move } from "@/lib/stage-rules";
import { changeStage, skipStage } from "@/server/actions/opportunities";
import { useAction } from "@/components/crm/use-action";
import { isoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Pending = { move: Move; title: string; description: string; confirm: string } | { skip: true } | null;

const HOW_REACHED: Partial<Record<StageKey, string>> = {
  BOQ: "Reached when the BOQ is requested from presales",
  PRICING: "Reached when presales submits the BOQ, or pricing is requested",
  PROPOSAL: "Reached when the quote is sent",
};

export function StagePath({
  id, stage, path, moves, advance, canSkip, lossReasons, poNumber, holdReason,
}: {
  id: string;
  stage: StageKey;
  /** The stages this deal goes through (resale deals have no BOQ) */
  path: StageKey[];
  moves: Move[];
  advance: Advance | null;
  canSkip: boolean;
  lossReasons: string[];
  poNumber: string | null;
  holdReason?: string | null;
}) {
  const { pending, run } = useAction();
  const [dialog, setDialog] = useState<Pending>(null);
  const [action, setAction] = useState<DealAction | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const allowed = (pred: (m: Move) => boolean) => moves.filter((m) => m.allowed && pred(m));
  const closed = stage === "WON" || stage === "LOST" || stage === "DROPPED";
  const cur = path.indexOf(stage);
  const heldFrom = stage === "HOLD" ? moves.find((m) => m.kind === "resume")?.to : undefined;
  const reached = (s: StageKey) => {
    const i = path.indexOf(s);
    if (stage === "WON") return true;
    if (stage === "HOLD" && heldFrom) return i < path.indexOf(heldFrom);
    return cur >= 0 && i < cur;
  };

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
      hold: ["Put on hold", "The deal leaves the forecast until it resumes, and resumes to the stage it is in now.", "Put on hold"],
      back: [`Move back to ${label}`, "Moving a deal back is a correction. The reason is recorded in the stage history.", "Move back"],
      reopen: [`Reopen to ${label}`, "The deal returns to the open pipeline. The reason is recorded in the stage history.", "Reopen"],
      close: [
        m.to === "WON" ? "Close as won" : m.to === "LOST" ? "Close as lost" : "Drop opportunity",
        m.to === "WON" ? "Capture the customer purchase order. This locks the line items for billing and accepts the latest quote." : "Loss reasons feed the win/loss report. Be specific in the notes.",
        m.to === "WON" ? "Mark as won" : "Confirm",
      ],
      forward: [label, "", "Advance"],
      resume: [label, "", "Resume"],
    };
    const [title, description, confirm] = copy[m.kind];
    setDialog({ move: m, title, description, confirm });
  };

  const moveFor = (to: StageKey) => moves.find((m) => m.to === to);
  const won = moveFor("WON");
  const menu = [
    ...allowed((m) => m.kind === "hold").map((m) => ({ key: "hold", icon: <PauseCircle />, label: "Put on hold", onSelect: () => open(m) })),
    ...allowed((m) => m.kind === "back").map((m) => ({ key: "back", icon: <Undo2 />, label: `Move back to ${STAGE_META[m.to].label}`, onSelect: () => open(m) })),
    ...(canSkip ? [{ key: "skip", icon: <SkipForward />, label: "Skip BOQ (no presales needed)", onSelect: () => { setErrors({}); setDialog({ skip: true }); } }] : []),
    ...(won?.allowed && !(advance?.kind === "move" && advance.to === "WON") ? [{ key: "won", icon: <Trophy />, label: "Close as won", onSelect: () => open(won) }] : []),
    ...allowed((m) => m.to === "LOST" || m.to === "DROPPED").map((m) => ({
      key: m.to, icon: m.to === "LOST" ? <XCircle /> : <Ban />, label: m.to === "LOST" ? "Close as lost" : "Drop", onSelect: () => open(m), danger: m.to === "LOST",
    })),
    ...allowed((m) => m.kind === "reopen").map((m) => ({ key: "reopen", icon: <RotateCcw />, label: `Reopen to ${STAGE_META[m.to].label}`, onSelect: () => open(m) })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol className="flex w-full min-w-0 overflow-hidden rounded-md border border-border lg:w-auto lg:flex-1" aria-label="Stage">
        {path.map((s, i) => {
          const current = s === stage || (stage === "HOLD" && s === heldFrom);
          const done = reached(s) && !current;
          return (
            <li
              key={s}
              aria-current={current ? "step" : undefined}
              title={current ? (stage === "HOLD" ? "On hold at this stage" : "Current stage") : done ? "Done" : HOW_REACHED[s] ?? "Reached with Advance"}
              className={cn(
                "flex h-8 min-w-0 items-center justify-center gap-1 truncate px-2 text-xs font-medium",
                current ? "flex-[3] sm:flex-1" : "flex-1",
                i > 0 && "border-l border-border",
                current && stage !== "HOLD" && "bg-primary text-primary-ink",
                current && stage === "HOLD" && "bg-[var(--t-amber-bg)] text-[var(--t-amber)]",
                done && "bg-[var(--t-blue-bg)] text-[var(--t-blue)]",
                !done && !current && "bg-surface text-ink-3",
              )}
            >
              {done && <Check className="size-3 shrink-0" />}
              {current && stage === "HOLD" && <PauseCircle className="size-3 shrink-0" />}
              <span className={cn("truncate", !current && "hidden sm:inline")}>{STAGE_META[s].label}</span>
            </li>
          );
        })}
        {closed && (
          <li className={cn("flex h-8 flex-1 items-center justify-center gap-1 border-l border-border px-2 text-xs font-medium", stage === "WON" ? "bg-[var(--t-green-bg)] text-[var(--t-green)]" : "bg-[var(--t-red-bg)] text-[var(--t-red)]")}>
            {stage === "WON" ? <Trophy className="size-3" /> : <XCircle className="size-3" />} {STAGE_META[stage].label}
          </li>
        )}
      </ol>

      <div className="flex flex-wrap items-center gap-1.5">
        {advance?.kind === "move" && (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => { const m = moveFor(advance.to); if (m) open(m); }}>
            {advance.to === "WON" ? <Trophy /> : stage === "HOLD" ? <PlayCircle /> : <ArrowRight />} {advance.label}
          </Button>
        )}
        {advance?.kind === "action" && (
          <Button size="sm" variant="primary" disabled={pending} onClick={() => setAction(advance.action)}>
            <ArrowRight /> {advance.label}
          </Button>
        )}
        {advance?.kind === "blocked" && (
          <Tooltip content={advance.reason}>
            <span tabIndex={0} className="inline-flex">
              <Button size="sm" disabled aria-label={`${advance.label} (not available: ${advance.reason})`}><Lock /> {advance.label}</Button>
            </span>
          </Tooltip>
        )}
        {menu.length > 0 && (
          <Dropdown>
            <DropdownTrigger asChild>
              <Button size="sm" disabled={pending}>More <ChevronDown /></Button>
            </DropdownTrigger>
            <DropdownContent>
              {menu.map((m, i) => (
                <div key={m.key}>
                  {m.key === "LOST" && i > 0 && <DropdownSeparator />}
                  <DropdownItem onSelect={m.onSelect} className={cn("danger" in m && !!m.danger && "text-[var(--t-red)]")}>{m.icon} {m.label}</DropdownItem>
                </div>
              ))}
            </DropdownContent>
          </Dropdown>
        )}
      </div>
      {stage === "HOLD" && holdReason && <p className="w-full text-xs text-ink-3">On hold: {holdReason}</p>}

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        {action && <ActionDialog a={action} close={() => setAction(null)} />}
      </Dialog>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog && "skip" in dialog && (
          <DialogContent title="Skip BOQ" description="Presales is not needed after all. The deal becomes a resale deal, any open BOQ request is cancelled, and the deal moves to Pricing.">
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const note = String(new FormData(e.currentTarget).get("note") ?? "");
                run(() => skipStage(id, { note }), { success: "BOQ skipped. The deal is in Pricing.", onOk: () => setDialog(null), onError: (r) => setErrors(r.fieldErrors ?? {}) });
              }}
            >
              <Field label="Reason" required error={errors.note}>
                <Textarea name="note" required minLength={3} autoFocus placeholder="e.g. Customer gave an exact bill of materials; standard catalogue items" />
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" onClick={() => setDialog(null)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={pending}><SkipForward /> Skip BOQ</Button>
              </div>
            </form>
          </DialogContent>
        )}
        {dialog && "move" in dialog && (
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
