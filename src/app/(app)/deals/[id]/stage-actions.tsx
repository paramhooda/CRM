"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { useLookups } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import type { Move } from "@/domain/stages";
import { isoDay } from "@/lib/format";

type Person = { id: string; fullName: string };

/** One Advance button for the next step on the path, and a menu for everything else. Gates come from the server. */
export function StageActions({ dealId, version, moves, presalesPeople, hasPoDocument }: { dealId: string; version: number; moves: Move[]; presalesPeople: Person[]; hasPoDocument: boolean }) {
  const [active, setActive] = useState<Move | null>(null);
  const primary = moves.find((m) => m.primary);
  const rest = moves.filter((m) => !m.primary);
  if (!moves.length) return null;
  return (
    <>
      {primary && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={primary.enabled ? -1 : 0}>
              <Button size="sm" disabled={!primary.enabled} onClick={() => setActive(primary)} aria-describedby={primary.enabled ? undefined : "advance-reason"}>{primary.label} <ArrowRight /></Button>
            </span>
          </TooltipTrigger>
          {!primary.enabled && <TooltipContent id="advance-reason" className="max-w-72">{primary.reason}</TooltipContent>}
        </Tooltip>
      )}
      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="outline">More <ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            {rest.map((m) => (
              <DropdownMenuItem key={m.action} disabled={!m.enabled} onClick={() => setActive(m)} className="flex-col items-start gap-0" variant={m.action === "LOST" || m.action === "DROPPED" ? "destructive" : "default"}>
                <span>{m.label}</span>
                {!m.enabled && m.reason && <span className="text-xs font-normal text-muted-foreground">{m.reason}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {active && <MoveDialog key={active.action} dealId={dealId} version={version} move={active} presalesPeople={presalesPeople} hasPoDocument={hasPoDocument} onClose={() => setActive(null)} />}
    </>
  );
}

function MoveDialog({ dealId, version, move, presalesPeople, hasPoDocument, onClose }: { dealId: string; version: number; move: Move; presalesPeople: Person[]; hasPoDocument: boolean; onClose: () => void }) {
  const router = useRouter();
  const L = useLookups();
  const [defaultDue] = useState(() => isoDay(new Date(Date.now() + 7 * 86_400_000)));
  const f = useForm({ reason: "", lossReasonId: null as string | null, lossNotes: "", poNumber: "", presalesAssigneeId: null as string | null, presalesDueDate: defaultDue, presalesScope: "" });
  const needsForm = move.needsReason || move.needsLossReason || move.needsPo || move.needsPresalesRequest;
  const lossReasons = L.lossReasons.filter((r) => r.appliesTo === "BOTH" || r.appliesTo === (move.action === "LOST" ? "LOST" : "DROPPED"));
  const submit = () =>
    f.submit(async (v) => {
      const errs: Record<string, string> = {};
      if (move.needsReason && v.reason.trim().length < 3) errs.reason = "Give a reason.";
      if (move.needsLossReason && !v.lossReasonId) errs.lossReasonId = "Pick a reason.";
      if (move.needsPo && !v.poNumber.trim()) errs.poNumber = "Enter the PO number.";
      if (move.needsPresalesRequest && !v.presalesAssigneeId) errs.presalesAssigneeId = "Pick a presales engineer.";
      if (move.needsPresalesRequest && !v.presalesDueDate) errs.presalesDueDate = "Set a due date.";
      if (Object.keys(errs).length) {
        f.setErrors(errs);
        return;
      }
      await api.post(`/deals/${dealId}/stage`, {
        action: move.action, version,
        reason: v.reason || null, lossReasonId: v.lossReasonId, lossNotes: v.lossNotes || null, poNumber: v.poNumber || null,
        presalesAssigneeId: v.presalesAssigneeId, presalesDueDate: move.needsPresalesRequest ? v.presalesDueDate : null, presalesScope: v.presalesScope || null,
      });
      toast.success(move.action === "WON" || move.toStage === "CLOSED_WON" ? "Deal closed as won" : `Moved to ${move.label.replace(/^(Advance to|Resume in|Reopen in|Move back to) /, "")}`);
      onClose();
      router.refresh();
    });
  if (!needsForm) {
    return <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={move.label} description="The stage change is recorded with today's date." confirmLabel={move.label} onConfirm={async () => { await submit(); }} />;
  }
  const destructive = move.action === "LOST" || move.action === "DROPPED";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{move.label}</DialogTitle>
          <DialogDescription>
            {move.needsPresalesRequest && "Entering BOQ raises a presales request. Presales refines the lines and submits the BOQ."}
            {move.needsPo && "Closing as won needs the customer's PO number; the PO file is attached under Documents."}
            {move.needsLossReason && "The reason is kept on the deal and shows in reports."}
            {move.needsReason && !move.needsLossReason && "Say why, for the record."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {move.needsPresalesRequest && (
            <>
              <Field label="Presales engineer" htmlFor="mv-assignee" error={f.errors.presalesAssigneeId} required>
                <OptionSelect id="mv-assignee" value={f.values.presalesAssigneeId} onChange={(v) => f.set("presalesAssigneeId", v)} options={presalesPeople.map((p) => ({ id: p.id, name: p.fullName }))} invalid={!!f.errors.presalesAssigneeId} />
              </Field>
              <Field label="Due date" htmlFor="mv-due" error={f.errors.presalesDueDate} required><Input id="mv-due" type="date" value={f.values.presalesDueDate} onChange={(e) => f.set("presalesDueDate", e.target.value)} /></Field>
              <Field label="Scope" htmlFor="mv-scope" error={f.errors.presalesScope} hint="What presales should size and specify."><Textarea id="mv-scope" rows={3} value={f.values.presalesScope} onChange={(e) => f.set("presalesScope", e.target.value)} /></Field>
            </>
          )}
          {move.needsPo && (
            <Field label="Customer PO number" htmlFor="mv-po" error={f.errors.poNumber} required hint={hasPoDocument ? "The PO document is attached." : "Attach the PO document under Documents first."}>
              <Input id="mv-po" value={f.values.poNumber} onChange={(e) => f.set("poNumber", e.target.value)} aria-invalid={!!f.errors.poNumber} autoFocus />
            </Field>
          )}
          {move.needsLossReason && (
            <>
              <Field label="Reason" htmlFor="mv-loss" error={f.errors.lossReasonId} required>
                <OptionSelect id="mv-loss" value={f.values.lossReasonId} onChange={(v) => f.set("lossReasonId", v)} options={lossReasons} invalid={!!f.errors.lossReasonId} />
              </Field>
              <Field label="Notes" htmlFor="mv-notes" error={f.errors.lossNotes}><Textarea id="mv-notes" rows={3} value={f.values.lossNotes} onChange={(e) => f.set("lossNotes", e.target.value)} placeholder="Who won, at what price, what we learned…" /></Field>
            </>
          )}
          {move.needsReason && (
            <Field label="Reason" htmlFor="mv-reason" error={f.errors.reason} required><Textarea id="mv-reason" rows={3} value={f.values.reason} onChange={(e) => f.set("reason", e.target.value)} aria-invalid={!!f.errors.reason} autoFocus /></Field>
          )}
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={f.pending}>{move.label}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
