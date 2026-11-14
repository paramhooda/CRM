"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormError } from "@/components/crm/form";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { Money } from "@/components/crm/money";
import { useActor } from "@/components/crm/providers";
import { api, errorMessage, isApiError } from "@/client/api";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AiDraftButton } from "./ai-draft";

export type QuoteRow = { id: string; quoteNo: string; revision: number; validUntil: string; subtotal: string; documentId: string };
export type DocRow = { id: string; fileName: string; kind: { name: string } };
type Mode = "proposal" | "email";

const splitAddresses = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

/**
 * The proposal goes out from here: the quotation (generated on the spot, or the latest revision) and an email to the
 * customer with it and any other deal document attached. In "proposal" mode sending also moves the deal to Proposal
 * Submitted; "Mark as sent outside the CRM" is the manual move for quotes emailed from elsewhere.
 */
export function SendProposalDialog({ dealId, version, dealName, mode, quotes, documents, contactEmail, mailEnabled, canAdvance, advanceReason, onClose }: { dealId: string; version: number; dealName: string; mode: Mode; quotes: QuoteRow[]; documents: DocRow[]; contactEmail: string | null; mailEnabled: boolean; canAdvance: boolean; advanceReason: string | null; onClose: () => void }) {
  const router = useRouter();
  const actor = useActor();
  const [quoteList, setQuoteList] = useState(quotes);
  const latest = quoteList[0] ?? null;
  const [docs, setDocs] = useState(documents);
  const [validityDays, setValidityDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [to, setTo] = useState(contactEmail ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(`Proposal for ${dealName}${latest ? ` – ${latest.quoteNo}` : ""}`);
  const [body, setBody] = useState(`Dear Sir/Madam,\n\nPlease find attached our quotation for ${dealName}. It covers the items we discussed and is valid for the period stated on the quote.\n\nI would be glad to walk you through it at your convenience.\n\nRegards,\n${actor.fullName}`);
  const [attached, setAttached] = useState<Set<string>>(() => new Set(latest ? [latest.documentId] : []));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [confirmOutside, setConfirmOutside] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const days = Number(validityDays);
      const q = await api.post<QuoteRow & { document: { fileName: string } }>(`/deals/${dealId}/quotes`, { validityDays: Number.isFinite(days) && days > 0 ? days : 30, notes: notes || null });
      setQuoteList((l) => [q, ...l]);
      setDocs((d) => [{ id: q.documentId, fileName: q.document.fileName, kind: { name: "Quotation" } }, ...d]);
      setAttached((a) => { const n = new Set(a); for (const old of quoteList) n.delete(old.documentId); n.add(q.documentId); return n; });
      setSubject((s) => (latest ? s.replace(latest.quoteNo, q.quoteNo) : `${s} – ${q.quoteNo}`));
      toast.success(`${q.quoteNo} generated`);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  };
  const send = async () => {
    setError(null);
    setFieldErrors({});
    const payload = { to: splitAddresses(to), cc: splitAddresses(cc), subject, body, documentIds: [...attached] };
    if (!payload.to.length) return setFieldErrors({ to: "Add at least one recipient." });
    setSending(true);
    try {
      if (mode === "proposal") {
        const r = await api.post<{ moved: boolean }>(`/deals/${dealId}/send-proposal`, { ...payload, version });
        toast.success(r.moved ? "Proposal sent and the deal moved to Proposal Submitted" : "Proposal sent");
      } else {
        await api.post(`/deals/${dealId}/emails`, payload);
        toast.success("Email sent");
      }
      onClose();
      router.refresh();
    } catch (e) {
      if (isApiError(e) && Object.keys(e.fields).length) setFieldErrors(e.fields);
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };
  const markSent = async () => {
    await api.post(`/deals/${dealId}/stage`, { action: "ADVANCE", version, reason: null, lossReasonId: null, lossNotes: null, poNumber: null, presalesAssigneeId: null, presalesDueDate: null, presalesScope: null });
    toast.success("Moved to Proposal Submitted");
    onClose();
    router.refresh();
  };
  const toggle = (id: string) => setAttached((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "proposal" ? "Send the proposal" : "Email the customer"}</DialogTitle>
          <DialogDescription>{mode === "proposal" ? "The quotation and anything else you tick go to the customer from your address; the deal moves to Proposal Submitted when it has gone." : "From your address, with the deal documents you tick attached. The deal stays where it is."}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <section className="rounded-lg border border-border bg-background p-3" aria-label="Quotation">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <div className="font-medium">{latest ? <>{latest.quoteNo}{latest.revision > 1 ? ` · revision ${latest.revision}` : ""}</> : "No quotation yet"}</div>
                <div className="text-xs text-muted-foreground">{latest ? <>Valid until {fmtDate(latest.validUntil)} · <Money value={latest.subtotal} /> excluding GST</> : "Generate it from the deal's lines; it is stored under Documents."}</div>
              </div>
              {latest && <Button asChild size="sm" variant="outline"><a href={`/api/v1/documents/${latest.documentId}/download`}><Download /> Download quote</a></Button>}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[110px_1fr_auto] sm:items-end">
              <Field label="Valid (days)" htmlFor="q-days"><Input id="q-days" inputMode="numeric" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} /></Field>
              <Field label="Notes on the quote" htmlFor="q-notes"><Input id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope, exclusions, delivery (optional)" /></Field>
              <Button type="button" variant={latest ? "outline" : "default"} onClick={generate} disabled={generating}><FileText /> {generating ? "Generating…" : latest ? "New revision" : "Generate quote"}</Button>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="To" htmlFor="em-to" error={fieldErrors.to} required hint="Comma-separated addresses."><Input id="em-to" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <Field label="CC" htmlFor="em-cc" error={fieldErrors.cc} hint="Anyone else, comma-separated."><Input id="em-cc" value={cc} onChange={(e) => setCc(e.target.value)} /></Field>
          </div>
          <Field label="Subject" htmlFor="em-subject" error={fieldErrors.subject} required><Input id="em-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Message" htmlFor="em-body" error={fieldErrors.body} required><Textarea id="em-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <AiDraftButton dealId={dealId} kind="email" onDraft={setBody} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-medium text-muted-foreground">Attach</legend>
            {docs.length === 0 && <p className="text-sm text-muted-foreground">No documents on the deal yet.</p>}
            {docs.map((d) => (
              <label key={d.id} className={cn("flex items-center gap-2 text-sm", attached.has(d.id) && "font-medium")}>
                <Checkbox checked={attached.has(d.id)} onCheckedChange={() => toggle(d.id)} aria-label={`Attach ${d.fileName}`} /> {d.fileName} <span className="text-xs text-muted-foreground">· {d.kind.name}</span>
              </label>
            ))}
          </fieldset>
          {!mailEnabled && <p className="rounded-md bg-tint-amber px-3 py-2 text-sm text-tint-amber-foreground">Email is not set up on this server, so sending from here is off: download the quote and send it yourself{mode === "proposal" ? ", then mark the proposal as sent" : ""}. An administrator adds the mail server under Settings.</p>}
          {mode === "proposal" && !canAdvance && advanceReason && <p className="text-sm text-muted-foreground">Not ready to go out yet: {advanceReason}</p>}
          <FormError message={error} />
        </div>
        <DialogFooter className="sm:justify-between">
          <div>{mode === "proposal" && <Button type="button" variant="ghost" onClick={() => setConfirmOutside(true)} disabled={!canAdvance}>Mark as sent outside the CRM</Button>}</div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="button" onClick={send} disabled={sending || !mailEnabled || (mode === "proposal" && !canAdvance)}><Send /> {sending ? "Sending…" : mode === "proposal" ? "Send and move to Proposal Submitted" : "Send"}</Button>
          </div>
        </DialogFooter>
        <ConfirmDialog open={confirmOutside} onOpenChange={setConfirmOutside} title="Mark the proposal as sent?" description="Use this when the quote went to the customer from your own mailbox. The deal moves to Proposal Submitted now." confirmLabel="Mark as sent" onConfirm={markSent} />
      </DialogContent>
    </Dialog>
  );
}

/** The hero's button once the proposal is out: email the customer again or send a revised quote, without a stage move. */
export function EmailCustomerButton(props: Omit<Parameters<typeof SendProposalDialog>[0], "mode" | "onClose" | "canAdvance" | "advanceReason">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Send /> Email customer</Button>
      {open && <SendProposalDialog {...props} mode="email" canAdvance={false} advanceReason={null} onClose={() => setOpen(false)} />}
    </>
  );
}
