"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { ConfirmDialog, ReasonDialog } from "@/components/crm/dialogs";
import { StatusPill } from "@/components/crm/pills";
import { useActor } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { fmtDate, isoDay, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LineField } from "@/domain/lines";
import type { DealView } from "@/server/services/deals";

type Person = { id: string; fullName: string };
type Presales = DealView["presalesRequests"][number];
type Pricing = DealView["pricingRequests"][number];
type Kind = "presales" | "pricing";
const OPEN = ["REQUESTED", "IN_PROGRESS"];

export function RequestCards({ dealId, stage, canEdit, presales, pricing, presalesPeople, purchasePeople, lineEditable }: { dealId: string; stage: string; canEdit: boolean; presales: Presales[]; pricing: Pricing[]; presalesPeople: Person[]; purchasePeople: Person[]; lineEditable: { thirdParty: LineField[]; ownIp: LineField[] } }) {
  const actor = useActor();
  const open = ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION"].includes(stage);
  const assignedPresales = actor.role === "PRESALES" && lineEditable.thirdParty.includes("spec");
  const canRaisePresales = open && canEdit;
  const canRaisePricing = open && (canEdit || assignedPresales);
  const [raise, setRaise] = useState<Kind | null>(null);
  return (
    <>
      <RequestCard kind="presales" title="Presales (BOQ)" rows={presales} dealId={dealId} people={presalesPeople} canRaise={canRaisePresales} onRaise={() => setRaise("presales")} canEdit={canEdit} />
      <RequestCard kind="pricing" title="Purchase pricing" rows={pricing} dealId={dealId} people={purchasePeople} canRaise={canRaisePricing} onRaise={() => setRaise("pricing")} canEdit={canEdit} />
      {raise && <RaiseDialog kind={raise} dealId={dealId} people={raise === "presales" ? presalesPeople : purchasePeople} onClose={() => setRaise(null)} />}
    </>
  );
}

function RequestCard({ kind, title, rows, dealId, people, canRaise, onRaise, canEdit }: { kind: Kind; title: string; rows: (Presales | Pricing)[]; dealId: string; people: Person[]; canRaise: boolean; onRaise: () => void; canEdit: boolean }) {
  const actor = useActor();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ type: "finish" | "cancel" | "reassign"; row: Presales | Pricing } | null>(null);
  const current = rows.find((r) => OPEN.includes(r.status));
  const shown = current ? [current, ...rows.filter((r) => r !== current).slice(0, 2)] : rows.slice(0, 3);
  const hasOpen = !!current;
  const act = async (id: string, body: Record<string, unknown>, msg: string) => {
    await api.patch(`/${kind}-requests/${id}`, body);
    toast.success(msg);
    router.refresh();
  };
  const finishLabel = kind === "presales" ? "Submit BOQ" : "Complete pricing";
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {canRaise && !hasOpen && <Button size="xs" variant="outline" onClick={onRaise}><Plus /> {kind === "presales" ? "Ask presales" : "Ask for prices"}</Button>}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{kind === "presales" ? "No presales request yet. One is raised when the deal enters BOQ, or ask here." : "No pricing request yet. Ask purchase once the lines are in."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((r) => {
            const isOpen = OPEN.includes(r.status);
            const overdue = isOpen && new Date(r.dueDate) < new Date(new Date().toDateString());
            const mine = r.assignedToId === actor.id;
            const mayManage = canEdit || r.requestedById === actor.id || actor.role === "ADMIN";
            const text = "scope" in r ? r.scope : r.notes;
            const result = "summary" in r ? r.summary : r.completionNotes;
            return (
              <li key={r.id} className={cn("flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0", !isOpen && "opacity-80")}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{r.assignedTo.fullName}</span>
                  <StatusPill status={overdue ? "OVERDUE" : r.status} />
                  <span className={cn("ml-auto text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>Due {fmtDate(r.dueDate)}{isOpen ? ` · ${relativeDays(r.dueDate)}` : ""}</span>
                </div>
                <div className="text-xs text-muted-foreground">Raised by {r.requestedBy.fullName} on {fmtDate(r.requestedAt)}{text ? ` · ${text}` : ""}</div>
                {result && <div className="text-xs"><span className="text-muted-foreground">{kind === "presales" ? "Summary: " : "Notes: "}</span>{result}</div>}
                {isOpen && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(mine || actor.role === "ADMIN") && r.status === "REQUESTED" && <Button size="xs" onClick={() => act(r.id, { action: "START" }, "Started")}>Start</Button>}
                    {(mine || actor.role === "ADMIN") && <Button size="xs" variant={r.status === "IN_PROGRESS" ? "default" : "outline"} onClick={() => setDialog({ type: "finish", row: r })}>{finishLabel}</Button>}
                    {mayManage && <Button size="xs" variant="outline" onClick={() => setDialog({ type: "reassign", row: r })}>Reassign</Button>}
                    {mayManage && <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDialog({ type: "cancel", row: r })}>Cancel</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog?.type === "finish" && (
        <ReasonDialog open onOpenChange={(o) => !o && setDialog(null)} title={finishLabel} label={kind === "presales" ? "BOQ summary" : "Completion notes"} placeholder={kind === "presales" ? "What was specified, assumptions, open points…" : "Quotes received, validity, anything sales should know…"} confirmLabel={finishLabel}
          description={kind === "presales" ? "Hands the BOQ back to sales. The lines you refined stay on the deal." : "Confirms a purchase cost is set on every line that needs one."}
          onConfirm={async (text) => act(dialog.row.id, { action: kind === "presales" ? "SUBMIT" : "COMPLETE", ...(kind === "presales" ? { summary: text } : { completionNotes: text }) }, kind === "presales" ? "BOQ submitted" : "Pricing completed")} />
      )}
      {dialog?.type === "cancel" && <ConfirmDialog open onOpenChange={(o) => !o && setDialog(null)} title="Cancel this request?" description="It stays in the history as cancelled." destructive confirmLabel="Cancel request" onConfirm={() => act(dialog.row.id, { action: "CANCEL" }, "Request cancelled")} />}
      {dialog?.type === "reassign" && <ReassignRequestDialog kind={kind} row={dialog.row} people={people} onClose={() => setDialog(null)} onDone={() => router.refresh()} dealId={dealId} />}
    </section>
  );
}

function ReassignRequestDialog({ kind, row, people, onClose, onDone }: { kind: Kind; row: Presales | Pricing; people: Person[]; onClose: () => void; onDone: () => void; dealId: string }) {
  const f = useForm({ assignedToId: row.assignedToId as string | null, dueDate: isoDay(row.dueDate) });
  const save = () =>
    f.submit(async (v) => {
      await api.patch(`/${kind}-requests/${row.id}`, { action: "REASSIGN", assignedToId: v.assignedToId ?? undefined, dueDate: v.dueDate || undefined });
      toast.success("Request reassigned");
      onClose();
      onDone();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reassign request</DialogTitle><DialogDescription>Change who it is with, or the due date.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Assigned to" htmlFor="rr-who" error={f.errors.assignedToId}><OptionSelect id="rr-who" value={f.values.assignedToId} onChange={(v) => f.set("assignedToId", v)} options={people.map((p) => ({ id: p.id, name: p.fullName }))} /></Field>
          <Field label="Due date" htmlFor="rr-due" error={f.errors.dueDate}><Input id="rr-due" type="date" value={f.values.dueDate} onChange={(e) => f.set("dueDate", e.target.value)} /></Field>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RaiseDialog({ kind, dealId, people, onClose }: { kind: Kind; dealId: string; people: Person[]; onClose: () => void }) {
  const router = useRouter();
  const [defaultDue] = useState(() => isoDay(new Date(Date.now() + 7 * 86_400_000)));
  const f = useForm({ assignedToId: null as string | null, dueDate: defaultDue, text: "" });
  const save = () =>
    f.submit(async (v) => {
      if (!v.assignedToId) return f.setErrors({ assignedToId: "Pick someone." });
      if (kind === "presales" && v.text.trim().length < 3) return f.setErrors({ text: "Describe the scope." });
      await api.post(`/deals/${dealId}/${kind}-requests`, { assignedToId: v.assignedToId, dueDate: v.dueDate, ...(kind === "presales" ? { scope: v.text } : { notes: v.text || null }) });
      toast.success(kind === "presales" ? "Presales request raised" : "Pricing request raised");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "presales" ? "Ask presales for a BOQ" : "Ask purchase for prices"}</DialogTitle>
          <DialogDescription>{kind === "presales" ? "Presales refines the lines and submits the BOQ by the due date." : "Purchase enters the unit purchase cost on every third-party line."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label={kind === "presales" ? "Presales engineer" : "Buyer"} htmlFor="rq-who" error={f.errors.assignedToId} required><OptionSelect id="rq-who" value={f.values.assignedToId} onChange={(v) => f.set("assignedToId", v)} options={people.map((p) => ({ id: p.id, name: p.fullName }))} invalid={!!f.errors.assignedToId} /></Field>
          <Field label="Due date" htmlFor="rq-due" error={f.errors.dueDate} required><Input id="rq-due" type="date" value={f.values.dueDate} onChange={(e) => f.set("dueDate", e.target.value)} /></Field>
          <Field label={kind === "presales" ? "Scope" : "Notes"} htmlFor="rq-text" error={f.errors.text ?? f.errors.scope ?? f.errors.notes} required={kind === "presales"}><Textarea id="rq-text" rows={3} value={f.values.text} onChange={(e) => f.set("text", e.target.value)} /></Field>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>Raise request</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
