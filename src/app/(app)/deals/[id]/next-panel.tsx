"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Circle, CircleDot, Clock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/crm/form";
import { useActor, useLookups } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api, errorMessage } from "@/client/api";
import { fmtDate, isoDay, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Move } from "@/domain/stages";
import type { NextActions, Step } from "@/domain/workflow";
import type { DealView } from "@/server/services/deals";
import { MoveDialog } from "./stage-actions";
import { FinishRequestDialog, RaiseDialog, finishBlocker } from "./request-cards";
import { UploadDialog } from "./documents-panel";
import { SetContactDialog } from "./set-contact-dialog";

type Person = { id: string; fullName: string };
type Deal = Pick<DealView, "id" | "version" | "stage" | "moves" | "facts" | "requestAbility" | "presalesRequests" | "pricingRequests" | "account" | "primaryContactId" | "nextStep" | "nextStepDate" | "canEdit">;
type Dialog = { type: "move"; move: Move } | { type: "raise"; kind: "presales" | "pricing" } | { type: "finish"; kind: "presales" | "pricing"; requestId: string } | { type: "upload"; kindId: string | null; title: string } | { type: "contact" } | { type: "note" };
const OPEN = ["REQUESTED", "IN_PROGRESS"];

/**
 * "What's next": the stage's checklist with the viewer's own step first, one button that does it, and the reason
 * when it cannot be done yet. The rules come from the server (`deal.next`); nothing here decides anything.
 */
export function NextPanel({ deal, next, presalesPeople, purchasePeople, sales }: { deal: Deal; next: NextActions; presalesPeople: Person[]; purchasePeople: Person[]; sales: boolean }) {
  const actor = useActor();
  const router = useRouter();
  const L = useLookups();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const current = next.steps.find((s) => s.current);
  const openRequest = (owner: Step["owner"]) => (owner === "PURCHASE" ? deal.pricingRequests : deal.presalesRequests).find((r) => OPEN.includes(r.status));
  const moveFor = (step: Step): Move | undefined => {
    if (step.action === "ADVANCE") return deal.moves.find((m) => m.primary);
    if (step.action === "CLOSE_WON") return deal.moves.find((m) => m.toStage === "CLOSED_WON");
    if (step.action === "RESUME") return deal.moves.find((m) => m.action === "RESUME");
    if (step.action === "REOPEN") return deal.moves.find((m) => m.action === "REOPEN");
    return undefined;
  };
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const poKind = L.documentKinds.find((k) => k.requiredAtWon)?.id ?? null;

  /** The one button for the current step, when it is the viewer's. Disabled with the reason when the server says not yet. */
  const action = (step: Step) => {
    const lines = <Button asChild size="sm"><Link href={`/deals/${deal.id}?tab=lines`}>Open lines <ArrowRight /></Link></Button>;
    switch (step.action) {
      case "SET_CONTACT": return <Button size="sm" onClick={() => setDialog({ type: "contact" })}>Set contact</Button>;
      case "FIX_CLOSE_DATE": return <Button asChild size="sm"><Link href={`/deals/${deal.id}/edit`}>Edit details</Link></Button>;
      case "ATTACH_DOCUMENT": return <Button size="sm" onClick={() => setDialog({ type: "upload", kindId: null, title: "Attach the customer's requirement" })}>Attach document</Button>;
      case "ATTACH_PO": return <Button size="sm" onClick={() => setDialog({ type: "upload", kindId: poKind, title: "Attach the customer's PO" })}>Attach PO</Button>;
      case "ADD_LINES": case "SET_PRICES": case "ENTER_COSTS": return lines;
      case "ADVANCE": case "CLOSE_WON": case "RESUME": case "REOPEN": {
        const move = moveFor(step);
        if (!move) return null;
        return <Gated reason={move.enabled ? null : move.reason ?? null}><Button size="sm" disabled={!move.enabled} onClick={() => setDialog({ type: "move", move })}>{move.label} <ArrowRight /></Button></Gated>;
      }
      case "ASK_PRESALES": case "ASK_PRICING": {
        const kind = step.action === "ASK_PRESALES" ? "presales" : "pricing";
        const a = deal.requestAbility[kind];
        return <Gated reason={a.enabled ? null : a.reason}><Button size="sm" disabled={!a.enabled} onClick={() => setDialog({ type: "raise", kind })}>{kind === "presales" ? "Ask presales" : "Ask for prices"}</Button></Gated>;
      }
      case "START_REQUEST": {
        const r = openRequest(step.owner);
        if (!r) return null;
        const kind = step.owner === "PURCHASE" ? "pricing" : "presales";
        return <Button size="sm" disabled={busy} onClick={() => run(() => api.patch(`/${kind}-requests/${r.id}`, { action: "START" }), "Started")}>Start</Button>;
      }
      case "SUBMIT_BOQ": case "COMPLETE_PRICING": {
        const kind = step.action === "SUBMIT_BOQ" ? "presales" : "pricing";
        const r = openRequest(kind === "pricing" ? "PURCHASE" : "PRESALES");
        if (!r) return null;
        const blocker = finishBlocker(kind, deal.facts);
        return <Gated reason={blocker}><Button size="sm" disabled={!!blocker} onClick={() => setDialog({ type: "finish", kind, requestId: r.id })}>{kind === "presales" ? "Submit BOQ" : "Complete pricing"}</Button></Gated>;
      }
      case "ASK_APPROVAL": return <Button size="sm" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ approval: { status: string } }>(`/deals/${deal.id}/approvals`); if (r.approval.status === "APPROVED") toast.success("Approved: no other approver was needed"); }, "Approval requested")}>Ask for approval</Button>;
      case "DECIDE_APPROVAL": return <Button asChild size="sm"><a href="#approval">Go to the approval</a></Button>;
      default: return null;
    }
  };

  const waiting = next.waitingOn;
  const overdue = waiting?.due && new Date(waiting.due) < new Date(new Date().toDateString());
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card" aria-label="What's next">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">What&apos;s next</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight" data-slot="next-headline">{next.headline}</h2>
          {next.detail && <p className="mt-1 text-sm text-muted-foreground">{next.detail}</p>}
          {waiting && (
            <p className={cn("mt-1 inline-flex items-center gap-1.5 text-sm", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
              <Clock className="size-3.5" />
              {waiting.due ? `Due ${fmtDate(waiting.due)} · ${relativeDays(waiting.due)}` : "Not yours to do; you will see it move here."}
            </p>
          )}
        </div>
        {current?.mine && <div className="shrink-0">{action(current)}</div>}
      </div>
      {next.steps.length > 0 && (
        <ol className="mt-4 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Steps">
          {next.steps.map((s) => (
            <li key={s.key} className={cn("flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm", s.current && "bg-selected text-selected-foreground", s.done && "text-muted-foreground")} aria-current={s.current ? "step" : undefined}>
              {s.done ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : s.current ? <CircleDot className="mt-0.5 size-4 shrink-0" /> : <Circle className="mt-0.5 size-4 shrink-0 text-border-strong" />}
              <span className={cn("min-w-0", s.done && "line-through decoration-border-strong")}>
                {s.label}
                {!s.done && !s.current && s.owner !== "SALES" && <span className="ml-1 text-xs text-muted-foreground">· {s.owner === "PRESALES" ? "presales" : s.owner === "PURCHASE" ? "purchase" : s.owner === "APPROVER" ? "approvers" : "manager"}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {sales && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Your note</span>
          <span className={cn("min-w-0 flex-1 truncate", !deal.nextStep && "text-muted-foreground")}>{deal.nextStep ?? "Nothing noted. Say what happens next with the customer, and when."}</span>
          {deal.nextStepDate && <span className={cn("text-xs", new Date(deal.nextStepDate) < new Date() && !["CLOSED_WON", "CLOSED_LOST", "DROPPED"].includes(deal.stage) ? "text-destructive" : "text-muted-foreground")}>{fmtDate(deal.nextStepDate)} · {relativeDays(deal.nextStepDate)}</span>}
          {deal.canEdit && <Button size="xs" variant="ghost" onClick={() => setDialog({ type: "note" })} aria-label="Edit note"><Pencil /> Edit</Button>}
        </div>
      )}

      {dialog?.type === "move" && <MoveDialog key={dialog.move.action} dealId={deal.id} version={deal.version} move={dialog.move} presalesPeople={presalesPeople} hasPoDocument={deal.facts.hasPoDocument} onClose={() => setDialog(null)} />}
      {dialog?.type === "raise" && <RaiseDialog kind={dialog.kind} dealId={deal.id} people={dialog.kind === "presales" ? presalesPeople : purchasePeople} needsDocument={dialog.kind === "presales" && deal.facts.presalesDocuments === 0} onClose={() => setDialog(null)} />}
      {dialog?.type === "finish" && <FinishRequestDialog kind={dialog.kind} dealId={deal.id} requestId={dialog.requestId} onClose={() => setDialog(null)} />}
      {dialog?.type === "upload" && <UploadDialog dealId={deal.id} sales={actor.role !== "PRESALES" && actor.role !== "PURCHASE"} kindId={dialog.kindId} title={dialog.title} onClose={() => setDialog(null)} />}
      {dialog?.type === "contact" && <SetContactDialog dealId={deal.id} version={deal.version} account={deal.account} current={deal.primaryContactId} onClose={() => setDialog(null)} />}
      {dialog?.type === "note" && <NoteDialog dealId={deal.id} version={deal.version} nextStep={deal.nextStep} nextStepDate={deal.nextStepDate} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** A disabled button with its reason under it, so nobody wonders why. */
function Gated({ reason, children }: { reason: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {children}
      {reason && <span className="max-w-72 text-right text-xs text-muted-foreground" data-slot="next-reason">{reason}</span>}
    </div>
  );
}

function NoteDialog({ dealId, version, nextStep, nextStepDate, onClose }: { dealId: string; version: number; nextStep: string | null; nextStepDate: Date | string | null; onClose: () => void }) {
  const router = useRouter();
  const f = useForm({ nextStep: nextStep ?? "", nextStepDate: isoDay(nextStepDate) });
  const save = () =>
    f.submit(async (v) => {
      await api.patch(`/deals/${dealId}`, { version, nextStep: v.nextStep.trim() || null, nextStepDate: v.nextStepDate || null });
      toast.success("Note saved");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Your note</DialogTitle><DialogDescription>What happens next with the customer, and when. Pipeline review flags deals with nothing here.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Next step" htmlFor="note-text" error={f.errors.nextStep}><Textarea id="note-text" rows={3} value={f.values.nextStep} onChange={(e) => f.set("nextStep", e.target.value)} placeholder="e.g. Demo with the CIO" maxLength={300} autoFocus /></Field>
          <Field label="When" htmlFor="note-date" error={f.errors.nextStepDate}><Input id="note-date" type="date" value={f.values.nextStepDate} onChange={(e) => f.set("nextStepDate", e.target.value)} /></Field>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
