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
import { ConfirmDialog } from "@/components/crm/dialogs";
import { StatusPill } from "@/components/crm/pills";
import { useActor } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { fmtDate, isoDay, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DealFacts } from "@/domain/stages";
import type { DealView } from "@/server/services/deals";
import { DocumentFields, uploadDocument, useDocumentKinds } from "./documents-panel";
import { AiDraftButton } from "./ai-draft";

type Person = { id: string; fullName: string };
type Presales = DealView["presalesRequests"][number];
type Pricing = DealView["pricingRequests"][number];
type Kind = "presales" | "pricing";
type Ability = { enabled: boolean; reason: string | null };
const OPEN = ["REQUESTED", "IN_PROGRESS"];

/** Why the assignee can't finish yet, or null. Mirrors the server's SUBMIT/COMPLETE checks so the button says so up front. */
export function finishBlocker(kind: Kind, facts: Pick<DealFacts, "stage" | "lineCount" | "uncostedThirdPartyLines">): string | null {
  if (facts.stage === "HOLD") return "The deal is on hold.";
  if (kind === "presales") return facts.lineCount === 0 ? "Add at least one line first." : null;
  return facts.uncostedThirdPartyLines > 0 ? `Enter the purchase cost on ${facts.uncostedThirdPartyLines === 1 ? "the remaining line" : `${facts.uncostedThirdPartyLines} lines`} first.` : null;
}

export function RequestCards({ dealId, canEdit, presales, pricing, presalesPeople, purchasePeople, ability, facts }: { dealId: string; canEdit: boolean; presales: Presales[]; pricing: Pricing[]; presalesPeople: Person[]; purchasePeople: Person[]; ability: { presales: Ability; pricing: Ability }; facts: DealFacts }) {
  const [raise, setRaise] = useState<Kind | null>(null);
  return (
    <>
      <RequestCard kind="presales" title="Presales (BOQ)" rows={presales} people={presalesPeople} purchasePeople={purchasePeople} lastBuyerId={pricing[0]?.assignedToId ?? null} ability={ability.presales} onRaise={() => setRaise("presales")} canEdit={canEdit} facts={facts} />
      <RequestCard kind="pricing" title="Purchase pricing" rows={pricing} people={purchasePeople} purchasePeople={purchasePeople} lastBuyerId={null} ability={ability.pricing} onRaise={() => setRaise("pricing")} canEdit={canEdit} facts={facts} />
      {raise && <RaiseDialog kind={raise} dealId={dealId} people={raise === "presales" ? presalesPeople : purchasePeople} needsDocument={raise === "presales" && facts.presalesDocuments === 0} onClose={() => setRaise(null)} />}
    </>
  );
}

function RequestCard({ kind, title, rows, people, purchasePeople, lastBuyerId, ability, onRaise, canEdit, facts }: { kind: Kind; title: string; rows: (Presales | Pricing)[]; people: Person[]; purchasePeople: Person[]; lastBuyerId: string | null; ability: Ability; onRaise: () => void; canEdit: boolean; facts: DealFacts }) {
  const actor = useActor();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ type: "finish" | "cancel" | "reassign"; row: Presales | Pricing } | null>(null);
  const current = rows.find((r) => OPEN.includes(r.status));
  const shown = current ? [current, ...rows.filter((r) => r !== current).slice(0, 2)] : rows.slice(0, 3);
  const act = async (id: string, body: Record<string, unknown>, msg: string) => {
    await api.patch(`/${kind}-requests/${id}`, body);
    toast.success(msg);
    router.refresh();
  };
  const finishLabel = kind === "presales" ? "Submit BOQ" : "Complete pricing";
  const blocker = finishBlocker(kind, facts);
  const onHold = facts.stage === "HOLD";
  // The reason is worth showing only to someone who could otherwise ask: a sales person on their deal, or presales for pricing
  const showReason = !ability.enabled && !current && ability.reason && (canEdit || (kind === "pricing" && actor.role === "PRESALES")) && !/^Only /.test(ability.reason);
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {ability.enabled && <Button size="xs" variant="outline" onClick={onRaise}><Plus /> {kind === "presales" ? "Ask presales" : "Ask for prices"}</Button>}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{showReason ? ability.reason : kind === "presales" ? "No presales request yet. Advance to BOQ hands the deal to presales." : "No pricing request yet. Ask purchase once the lines are in."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((r) => {
            const isOpen = OPEN.includes(r.status);
            const overdue = isOpen && new Date(r.dueDate) < new Date(new Date().toDateString());
            const mine = r.assignedToId === actor.id;
            const mayManage = canEdit || r.requestedById === actor.id || actor.role === "ADMIN";
            const mayWork = (mine || actor.role === "ADMIN") && !onHold;
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
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {mayWork && <Button size="xs" disabled={!!blocker} title={blocker ?? undefined} onClick={() => setDialog({ type: "finish", row: r })}>{finishLabel}</Button>}
                    {mayWork && blocker && <span className="text-xs text-muted-foreground">{blocker}</span>}
                    {mayManage && <Button size="xs" variant="outline" onClick={() => setDialog({ type: "reassign", row: r })}>Reassign</Button>}
                    {mayManage && <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDialog({ type: "cancel", row: r })}>Cancel</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {showReason && shown.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{ability.reason}</p>}
      {dialog?.type === "finish" && <FinishRequestDialog kind={kind} dealId={dialog.row.dealId} requestId={dialog.row.id} facts={facts} purchasePeople={purchasePeople} lastBuyerId={lastBuyerId} onClose={() => setDialog(null)} />}
      {dialog?.type === "cancel" && <ConfirmDialog open onOpenChange={(o) => !o && setDialog(null)} title="Cancel this request?" description="It stays in the history as cancelled." destructive confirmLabel="Cancel request" onConfirm={() => act(dialog.row.id, { action: "CANCEL" }, "Request cancelled")} />}
      {dialog?.type === "reassign" && <ReassignRequestDialog kind={kind} row={dialog.row} people={people} onClose={() => setDialog(null)} onDone={() => router.refresh()} />}
    </section>
  );
}

/**
 * Submit BOQ (summary) or Complete pricing (notes). Submitting a BOQ that still has uncosted third-party lines
 * names the buyer, so purchase has something due the moment presales is done. The textarea keeps the id `reason`.
 */
export function FinishRequestDialog({ kind, dealId, requestId, facts, purchasePeople, lastBuyerId, onClose }: { kind: Kind; dealId: string; requestId: string; facts: Pick<DealFacts, "uncostedThirdPartyLines" | "openPricingRequest">; purchasePeople: Person[]; lastBuyerId: string | null; onClose: () => void }) {
  const router = useRouter();
  const needsBuyer = kind === "presales" && facts.uncostedThirdPartyLines > 0 && !facts.openPricingRequest;
  const [defaultDue] = useState(() => isoDay(new Date(Date.now() + 3 * 86_400_000)));
  const f = useForm({ text: "", pricingAssigneeId: (lastBuyerId && purchasePeople.some((p) => p.id === lastBuyerId) ? lastBuyerId : purchasePeople[0]?.id ?? null) as string | null, pricingDueDate: defaultDue, pricingNotes: "" });
  const finishLabel = kind === "presales" ? "Submit BOQ" : "Complete pricing";
  const submit = () =>
    f.submit(async (v) => {
      const errs: Record<string, string> = {};
      if (kind === "presales" && v.text.trim().length < 3) errs.text = "Add a short summary of the BOQ.";
      if (needsBuyer && !v.pricingAssigneeId) errs.pricingAssigneeId = "Pick the buyer.";
      if (needsBuyer && !v.pricingDueDate) errs.pricingDueDate = "Set a due date.";
      if (Object.keys(errs).length) return f.setErrors(errs);
      await api.patch(`/${kind}-requests/${requestId}`, {
        action: kind === "presales" ? "SUBMIT" : "COMPLETE",
        ...(kind === "presales" ? { summary: v.text } : { completionNotes: v.text || null }),
        ...(needsBuyer ? { pricingAssigneeId: v.pricingAssigneeId, pricingDueDate: v.pricingDueDate, pricingNotes: v.pricingNotes || null } : {}),
      });
      toast.success(kind === "presales" ? (needsBuyer ? "BOQ submitted and sent to purchase" : "BOQ submitted") : "Pricing completed");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{finishLabel}</DialogTitle>
          <DialogDescription>{kind === "presales" ? (needsBuyer ? "Hands the BOQ to purchase for prices, with your summary for sales. The lines you refined stay on the deal." : "Hands the BOQ back to sales. The lines you refined stay on the deal.") : "Confirms a purchase cost is set on every line that needs one. Sales takes it from here."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label={kind === "presales" ? "BOQ summary" : "Completion notes"} htmlFor="reason" error={f.errors.text ?? f.errors.summary} required={kind === "presales"}>
            <Textarea id="reason" rows={4} value={f.values.text} onChange={(e) => f.set("text", e.target.value)} placeholder={kind === "presales" ? "What was specified, assumptions, open points…" : "Quotes received, validity, anything sales should know…"} aria-invalid={!!(f.errors.text ?? f.errors.summary)} autoFocus />
          </Field>
          {kind === "presales" && <AiDraftButton dealId={dealId} kind="boq_summary" onDraft={(t) => f.set("text", t)} />}
          {needsBuyer && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">{facts.uncostedThirdPartyLines} third-party line{facts.uncostedThirdPartyLines === 1 ? "" : "s"} still need{facts.uncostedThirdPartyLines === 1 ? "s" : ""} a purchase cost. Purchase is asked as you submit.</p>
              <Field label="Buyer" htmlFor="fin-buyer" error={f.errors.pricingAssigneeId} required><OptionSelect id="fin-buyer" value={f.values.pricingAssigneeId} onChange={(v) => f.set("pricingAssigneeId", v)} options={purchasePeople.map((p) => ({ id: p.id, name: p.fullName }))} invalid={!!f.errors.pricingAssigneeId} /></Field>
              <Field label="Prices due" htmlFor="fin-due" error={f.errors.pricingDueDate} required><Input id="fin-due" type="date" value={f.values.pricingDueDate} onChange={(e) => f.set("pricingDueDate", e.target.value)} /></Field>
              <Field label="Note for purchase" htmlFor="fin-notes" error={f.errors.pricingNotes}><Input id="fin-notes" value={f.values.pricingNotes} onChange={(e) => f.set("pricingNotes", e.target.value)} placeholder="Optional" /></Field>
            </div>
          )}
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>{needsBuyer ? "Submit BOQ and ask purchase" : finishLabel}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReassignRequestDialog({ kind, row, people, onClose, onDone }: { kind: Kind; row: Presales | Pricing; people: Person[]; onClose: () => void; onDone: () => void }) {
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

/** Ask presales (BOQ) or purchase (prices). For presales the customer's requirement is attached here when none is on the deal yet. */
export function RaiseDialog({ kind, dealId, people, needsDocument, onClose }: { kind: Kind; dealId: string; people: Person[]; needsDocument?: boolean; onClose: () => void }) {
  const router = useRouter();
  const actor = useActor();
  const kinds = useDocumentKinds(actor.role !== "PRESALES" && actor.role !== "PURCHASE").filter((k) => !k.restrictedToSales);
  const [defaultDue] = useState(() => isoDay(new Date(Date.now() + 7 * 86_400_000)));
  const [file, setFile] = useState<File | null>(null);
  const f = useForm({ assignedToId: null as string | null, dueDate: defaultDue, text: "", documentKindId: null as string | null });
  const save = () =>
    f.submit(async (v) => {
      const errs: Record<string, string> = {};
      if (!v.assignedToId) errs.assignedToId = "Pick someone.";
      if (kind === "presales" && v.text.trim().length < 3) errs.text = "Describe the scope.";
      if (needsDocument && !v.documentKindId) errs.documentKindId = "Pick the kind of document.";
      if (needsDocument && !file) errs.file = "Attach the customer's requirement.";
      if (Object.keys(errs).length) return f.setErrors(errs);
      if (needsDocument) await uploadDocument(dealId, v.documentKindId!, file!);
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
          <DialogDescription>{kind === "presales" ? "Presales refines the lines and submits the BOQ by the due date." : "Purchase enters the unit purchase cost on every third-party line. What is sold is frozen until they complete."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label={kind === "presales" ? "Presales engineer" : "Buyer"} htmlFor="rq-who" error={f.errors.assignedToId} required><OptionSelect id="rq-who" value={f.values.assignedToId} onChange={(v) => f.set("assignedToId", v)} options={people.map((p) => ({ id: p.id, name: p.fullName }))} invalid={!!f.errors.assignedToId} /></Field>
          <Field label="Due date" htmlFor="rq-due" error={f.errors.dueDate} required><Input id="rq-due" type="date" value={f.values.dueDate} onChange={(e) => f.set("dueDate", e.target.value)} /></Field>
          <Field label={kind === "presales" ? "Scope" : "Notes"} htmlFor="rq-text" error={f.errors.text ?? f.errors.scope ?? f.errors.notes} required={kind === "presales"}><Textarea id="rq-text" rows={3} value={f.values.text} onChange={(e) => f.set("text", e.target.value)} /></Field>
          {kind === "presales" && <AiDraftButton dealId={dealId} kind="scope" onDraft={(t) => f.set("text", t)} />}
          {needsDocument && (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Presales works from the customer&apos;s requirement. Attach it here (RFP, SoW or similar).</p>
              <DocumentFields idPrefix="rq-doc" kinds={kinds} kindId={f.values.documentKindId} onKind={(v) => f.set("documentKindId", v)} onFile={(x) => { setFile(x); f.setErrors((e) => { const { file: _f, ...rest } = e; return rest; }); }} errors={f.errors} required />
            </div>
          )}
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>Raise request</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
