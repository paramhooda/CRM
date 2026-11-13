"use client";
// The actions a viewer can take on a deal right now. The server decides which apply (see deal-status.tsx);
// this renders the main one or two as buttons, the rest under "More", and owns every dialog.
import { useState } from "react";
import {
  UserPlus, Send, Calculator, FileText, PlayCircle, CheckCircle2, GitBranch, MessageCircleQuestion, Reply, Undo2,
  UserCog, XCircle, MessageSquare, ChevronDown, CalendarClock, CalendarPlus,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import {
  requestPresales, startPresales, submitBoq, requestPricing, startPricing, completePricing,
  askSales, answerPresales, returnToPresales, reassignRequest, cancelRequest, recordQuoteResponse, extendQuoteValidity, changeDueDate,
} from "@/server/actions/workflow";
import { fmtDate, isoDate } from "@/lib/format";
import { AttachFiles, uploadAll, type ExistingDoc, type PickedFile } from "@/components/opportunities/attach-files";
import { MoreOptions } from "@/components/ui/more-options";
import { PricingForm, type PricingAction } from "@/components/opportunities/pricing-form";
import type { ActionResult } from "@/lib/validation";
import { PRESALES_DELIVERABLES } from "@/lib/deal-setup";
import { cn } from "@/lib/utils";

const plusDays = (n: number) => isoDate(new Date(Date.now() + n * 86_400_000));
type U = { id: string; name: string };
type Base = { id: string; label: string; primary?: boolean; disabledReason?: string };
/** Documents already on the deal, and a reminder when the expected one is missing (attachments stay optional) */
type Docs = { oppId: string; docs?: ExistingDoc[]; docHint?: string | null; /** Kinds this viewer may add */ canAdd?: string[] };

export type DealAction = Base &
  (
    | (Docs & {
        kind: "pullPresales"; presales: U[]; revision?: { number: number; assigneeId: string | null; scope: string; note: string | null };
        /** Bringing presales into a resale deal: what that changes, shown before sending */
        involve?: string[];
      })
    | (Docs & { kind: "submitBoq"; requestId: string; purchase: U[]; lineCount: number; toPrice: number; asked?: string[]; missingDocs?: string[] })
    | { kind: "askSales"; requestId: string }
    | { kind: "answer"; requestId: string; question: string; askedBy: string }
    | (Docs & { kind: "requestPricing"; purchase: U[]; toPrice: number; first: boolean; expired?: number })
    | (Docs & { kind: "completePricing"; requestId: string; quotesAttached?: number })
    | { kind: "sendBack"; requestId: string; presalesName: string | null }
    | { kind: "reassign"; reqKind: "presales" | "pricing"; requestId: string; people: U[]; currentId: string; due: Date; overdue: boolean }
    | { kind: "cancel"; reqKind: "presales" | "pricing"; requestId: string }
    | { kind: "dueDate"; reqKind: "presales" | "pricing"; requestId: string; due: Date }
    | PricingAction
    | { kind: "response"; quoteId: string; version: number }
    | { kind: "extend"; quoteId: string; version: number; validTill: Date; maxValidTill: Date | null }
  );

const ICON: Record<DealAction["kind"], React.ReactNode> = {
  pullPresales: <UserPlus />, submitBoq: <Send />, askSales: <MessageCircleQuestion />, answer: <Reply />, requestPricing: <Calculator />,
  completePricing: <CheckCircle2 />, sendBack: <Undo2 />, reassign: <UserCog />, cancel: <XCircle />, quote: <FileText />, response: <MessageSquare />,
  dueDate: <CalendarClock />, extend: <CalendarPlus />,
};

/** Kinds each hand-over offers to attach */
const ATTACH: Record<"pullPresales" | "submitBoq" | "requestPricing" | "completePricing", Parameters<typeof AttachFiles>[0]["kinds"]> = {
  pullPresales: ["CUSTOMER_RFP", "SOW", "OTHER"],
  submitBoq: ["SOLUTION_DOC", "BOQ_SHEET", "PRESENTATION", "SITE_SURVEY", "SOW", "OTHER"],
  requestPricing: ["BOQ_SHEET", "OEM_QUOTE", "OTHER"],
  completePricing: ["SUPPLIER_QUOTE", "OEM_QUOTE", "OTHER"],
};

/**
 * Run a hand-over with its attachments. Files go up first when the request already exists (submit, pricing done), so
 * they link to it; after the action when it creates the request (the action returns its id). A failed upload after a
 * successful hand-over is a warning, not a failure: the hand-over stands and the file can be added on Documents.
 */
async function withFiles<T>(
  oppId: string,
  files: PickedFile[],
  clear: () => void,
  action: () => Promise<ActionResult<T>>,
  link?: (data: T | undefined) => { presalesRequestId?: string; pricingRequestId?: string },
): Promise<ActionResult<T>> {
  if (!files.length) return action();
  if (!link) {
    const failed = await uploadAll(oppId, files);
    if (failed.length) return { ok: false, error: `Could not attach: ${failed.join(" ")}` };
    clear();
    return action();
  }
  const r = await action();
  if (!r.ok) return r;
  const failed = await uploadAll(oppId, files, link(r.data));
  clear();
  return failed.length ? { ...r, warning: `Sent, but these files could not be attached: ${failed.join(" ")} Add them on the Documents tab.` } : r;
}

export function DealActions({ actions }: { actions: DealAction[] }) {
  const [active, setActive] = useState<DealAction | null>(null);
  const primary = actions.filter((a) => a.primary);
  const more = actions.filter((a) => !a.primary);
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {primary.map((a) => (
        <Button key={a.id} variant="primary" size="sm" disabled={!!a.disabledReason} title={a.disabledReason} onClick={() => setActive(a)}>
          {a.kind === "pullPresales" && a.revision && !a.involve ? <GitBranch /> : ICON[a.kind]} {a.label}
        </Button>
      ))}
      {more.length > 0 && (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button size="sm">{primary.length ? "More" : "Actions"} <ChevronDown /></Button>
          </DropdownTrigger>
          <DropdownContent>
            {more.map((a) => (
              <DropdownItem key={a.id} disabled={!!a.disabledReason} onSelect={() => setActive(a)} className={cn(a.kind === "cancel" && "text-[var(--t-red)]")}>
                {a.kind === "pullPresales" && a.revision && !a.involve ? <GitBranch /> : ICON[a.kind]} {a.label}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      )}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        {active && <ActionDialog a={active} close={() => setActive(null)} />}
      </Dialog>
    </div>
  );
}

function Footer({ onCancel, pending, label, icon, danger }: { onCancel: () => void; pending: boolean; label: string; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={pending}>{icon}{label}</Button>
    </div>
  );
}

/** One form per action. Each submits, toasts and closes; field errors show under their field. */
export function ActionDialog({ a, close }: { a: DealAction; close: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<PickedFile[]>([]);
  const { pending, run } = useAction();
  const attach = (kind: keyof typeof ATTACH, docs: ExistingDoc[] = []) => {
    const kinds = ATTACH[kind].filter((k) => !("canAdd" in a) || !a.canAdd || a.canAdd.includes(k));
    return kinds.length ? <AttachFiles kinds={kinds} files={files} onChange={setFiles} existing={docs} /> : null;
  };
  // A gentle reminder stays in view even when the attachments are tucked under More options
  const reminder = (text: string | null | undefined) =>
    text && !files.length ? <p className="text-xs text-[var(--t-amber)]">{text} Add it under More options, or carry on without.</p> : null;
  const filesHint = files.length ? `${files.length} file${files.length > 1 ? "s" : ""} attached` : undefined;
  const submit = (fn: (f: Record<string, FormDataEntryValue>) => Parameters<typeof run>[0], success: string, onOk?: (data: unknown) => void) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget).entries());
      run(fn(f), { success, onOk: (r) => { close(); onOk?.(r.data); }, onError: (r) => setErrors(r.fieldErrors ?? {}) });
    };
  const form = "flex flex-col gap-3";

  switch (a.kind) {
    case "pullPresales":
      return <PresalesRequestForm a={a} close={close} />;
    case "submitBoq":
      return (
        <DialogContent
          title="Submit BOQ"
          description={a.toPrice ? `${a.toPrice} of ${a.lineCount} lines go to purchase for a supplier price. The deal moves to Pricing.` : `None of the ${a.lineCount} lines needs a price from purchase. Sales can quote straight away.`}
        >
          <form className={form} onSubmit={submit((f) => () => withFiles(a.oppId, files, () => setFiles([]), () => submitBoq(a.requestId, f)), a.toPrice ? "BOQ submitted. Purchase notified." : "BOQ submitted. Sales notified.")}>
            {a.asked && a.asked.length > 0 && <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">Sales asked for: {a.asked.join(", ")}</p>}
            <Field label="Solution summary" required error={errors.solutionSummary}>
              <Textarea name="solutionSummary" placeholder="What was designed and how it was sized" />
            </Field>
            {reminder(a.missingDocs?.length ? `Asked for but not attached yet: ${a.missingDocs.join(", ")}.` : null)}
            <MoreOptions hint={filesHint} forceOpen={!!errors.assumptions || !!errors.dueDate}>
              <Field label="Assumptions and exclusions" error={errors.assumptions}>
                <Textarea name="assumptions" className="min-h-14" placeholder="e.g. Customer provides rack space and power; cabling excluded" />
              </Field>
              {a.toPrice > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Purchase owner">
                    <Select name="purchaseUserId" defaultValue="">
                      <option value="">Auto-assign</option>
                      {a.purchase.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Pricing needed by" error={errors.dueDate}>
                    <Input name="dueDate" type="date" defaultValue={plusDays(5)} min={isoDate(new Date())} />
                  </Field>
                </div>
              )}
              {attach("submitBoq", a.docs)}
            </MoreOptions>
            <Footer onCancel={close} pending={pending} label="Submit" icon={<Send />} />
          </form>
        </DialogContent>
      );
    case "askSales":
      return (
        <DialogContent title="Ask sales a question" description="Your due date pauses until sales answers.">
          <form className={form} onSubmit={submit((f) => () => askSales(a.requestId, f), "Question sent to sales")}>
            <Field label="Question" required error={errors.question}>
              <Textarea name="question" placeholder="e.g. Does the customer need DR at the second site?" />
            </Field>
            <Footer onCancel={close} pending={pending} label="Send question" icon={<Send />} />
          </form>
        </DialogContent>
      );
    case "answer":
      return (
        <DialogContent title={`Answer ${a.askedBy}`} description="Presales resumes as soon as you reply.">
          <form className={form} onSubmit={submit((f) => () => answerPresales(a.requestId, f), "Answer sent. Presales has resumed.")}>
            <p className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">{a.question}</p>
            <Field label="Your answer" required error={errors.answer}>
              <Textarea name="answer" />
            </Field>
            <Footer onCancel={close} pending={pending} label="Send answer" icon={<Reply />} />
          </form>
        </DialogContent>
      );
    case "requestPricing": {
      const revalidate = a.toPrice === 0;
      return (
        <DialogContent
          title={a.label}
          description={
            revalidate
              ? a.expired
                ? `The ${a.expired} line${a.expired > 1 ? "s" : ""} whose supplier price lapsed go${a.expired > 1 ? "" : "es"} back to purchase to re-confirm.`
                : "Purchase re-confirms the supplier price of every purchase line."
              : `${a.toPrice} line${a.toPrice > 1 ? "s" : ""} go to purchase for a supplier price. The deal moves to Pricing.`
          }
        >
          <form className={form} onSubmit={submit((f) => () => withFiles(a.oppId, files, () => setFiles([]), () => requestPricing(a.oppId, f), (d) => ({ pricingRequestId: d?.requestId })), "Purchase notified")}>
            {(!a.first || revalidate) && (
              <Field label={revalidate ? "Why" : "What changed"} required error={errors.reason}>
                <Textarea name="reason" className="min-h-14" placeholder={revalidate ? "e.g. Supplier pricing expired" : "e.g. Switch quantity changed from 8 to 12"} />
              </Field>
            )}
            <Field label="Needed by" required error={errors.dueDate}>
              <Input name="dueDate" type="date" defaultValue={plusDays(5)} min={isoDate(new Date())} className="w-44" />
            </Field>
            <MoreOptions hint={filesHint ?? "auto-assigned"}>
              <Field label="Purchase owner">
                <Select name="assignedToId" defaultValue="">
                  <option value="">Auto-assign</option>
                  {a.purchase.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
              {attach("requestPricing", a.docs)}
            </MoreOptions>
            <Footer onCancel={close} pending={pending} label="Send to purchase" icon={<Send />} />
          </form>
        </DialogContent>
      );
    }
    case "completePricing":
      return (
        <DialogContent title="Pricing complete" description="Sales is notified to add margin and send the quote. Set each supplier's validity on its lines; this date applies to lines without one.">
          <form className={form} onSubmit={submit((f) => () => withFiles(a.oppId, files, () => setFiles([]), () => completePricing(a.requestId, f)), "Pricing sent to sales")}>
            {!!a.quotesAttached && (
              <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">{a.quotesAttached} supplier or OEM quote{a.quotesAttached > 1 ? "s" : ""} attached to this request.</p>
            )}
            <Field label="Valid till, for lines without their own date" required error={errors.quoteValidTill}>
              <Input name="quoteValidTill" type="date" defaultValue={plusDays(30)} min={isoDate(new Date())} className="w-44" />
            </Field>
            {reminder(a.quotesAttached ? null : "No supplier quote attached yet.")}
            <MoreOptions hint={filesHint}>
              {attach("completePricing", [])}
              <Field label="Notes for sales"><Textarea name="responseNotes" className="min-h-14" placeholder="Stock, price hold, lead times" /></Field>
            </MoreOptions>
            <Footer onCancel={close} pending={pending} label="Send to sales" icon={<Send />} />
          </form>
        </DialogContent>
      );
    case "sendBack":
      return (
        <DialogContent title={a.presalesName ? "Send back to presales" : "Send back to sales"} description={a.presalesName ? `${a.presalesName} gets the BOQ back to fix. The deal returns to the BOQ stage.` : "Sales fixes the lines and requests pricing again."}>
          <form className={form} onSubmit={submit((f) => () => returnToPresales(a.requestId, f), "Sent back")}>
            <Field label="What needs fixing" required error={errors.reason}>
              <Textarea name="reason" placeholder="e.g. Part is end-of-sale; use the successor model" />
            </Field>
            <Footer onCancel={close} pending={pending} label="Send back" icon={<Undo2 />} />
          </form>
        </DialogContent>
      );
    case "reassign":
      return (
        <DialogContent title={a.label} description={a.overdue ? "The new owner is notified. The request is overdue, so give them a date they can meet." : `The new owner is notified. Due ${fmtDate(a.due)} unless you change it.`}>
          <form className={form} onSubmit={submit((f) => () => reassignRequest(a.reqKind, a.requestId, f), "Reassigned")}>
            <Field label="Hand over to" required error={errors.assignedToId}>
              <Select name="assignedToId" defaultValue="">
                <option value="" disabled>Select</option>
                {a.people.filter((p) => p.id !== a.currentId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label={a.overdue ? "New due date" : "Due date"} required={a.overdue} error={errors.dueDate}>
              <Input name="dueDate" type="date" defaultValue={a.overdue ? plusDays(3) : isoDate(a.due)} min={isoDate(new Date())} />
            </Field>
            <Field label="Note"><Textarea name="note" className="min-h-14" /></Field>
            <Footer onCancel={close} pending={pending} label="Reassign" icon={<UserCog />} />
          </form>
        </DialogContent>
      );
    case "cancel":
      return (
        <DialogContent title={a.label} description="The person working on it is told to stop.">
          <form className={form} onSubmit={submit((f) => () => cancelRequest(a.reqKind, a.requestId, f), "Request cancelled")}>
            <Field label="Reason" required error={errors.reason}>
              <Textarea name="reason" className="min-h-14" placeholder="e.g. Customer postponed the project" />
            </Field>
            <Footer onCancel={close} pending={pending} label="Cancel request" icon={<XCircle />} danger />
          </form>
        </DialogContent>
      );
    case "dueDate":
      return (
        <DialogContent title={a.label} description={`Currently due ${fmtDate(a.due)}. Everyone on the request is told, and reminders restart from the new date.`}>
          <form className={form} onSubmit={submit((f) => () => changeDueDate(a.reqKind, a.requestId, f), "Due date changed")}>
            <Field label="New due date" required error={errors.dueDate}>
              <Input name="dueDate" type="date" defaultValue={plusDays(3)} min={isoDate(new Date())} />
            </Field>
            <Field label="Why" required error={errors.reason}>
              <Textarea name="reason" className="min-h-14" placeholder="e.g. Waiting on the OEM's revised price list" />
            </Field>
            <Footer onCancel={close} pending={pending} label="Change due date" icon={<CalendarClock />} />
          </form>
        </DialogContent>
      );
    case "extend":
      return (
        <DialogContent
          title={`Extend quote v${a.version}`}
          description={`Valid till ${fmtDate(a.validTill)}. Nothing on the deal changed since it was sent, so the customer keeps the same quote with a later date.${a.maxValidTill ? ` Supplier prices hold until ${fmtDate(a.maxValidTill)}.` : ""}`}
        >
          <form className={form} onSubmit={submit((f) => () => extendQuoteValidity(a.quoteId, f), "Quote validity extended")}>
            <Field label="Valid till" required error={errors.validTill}>
              <Input name="validTill" type="date" defaultValue={isoDate(a.maxValidTill && a.maxValidTill < new Date(Date.now() + 15 * 86_400_000) ? a.maxValidTill : new Date(Date.now() + 15 * 86_400_000))} min={isoDate(new Date())} max={a.maxValidTill ? isoDate(a.maxValidTill) : undefined} />
            </Field>
            <Field label="Note"><Textarea name="reason" className="min-h-14" placeholder="e.g. Customer's approval meeting moved to next week" /></Field>
            <Footer onCancel={close} pending={pending} label="Extend" icon={<CalendarPlus />} />
          </form>
        </DialogContent>
      );
    case "quote":
      return <PricingForm a={a} close={close} />;
    case "response":
      return <ResponseForm a={a} close={close} />;
  }
}

const RESPONSES = [
  { value: "ACCEPTED", label: "Accepted", hint: "Mark the deal Won when the PO arrives." },
  { value: "CHANGES_REQUESTED", label: "Wants changes", hint: "Send a revised quote, or request a BOQ change." },
  { value: "REJECTED", label: "Rejected", hint: "The deal stays open. Close it as Lost if they do not come back." },
] as const;

function ResponseForm({ a, close }: { a: Extract<DealAction, { kind: "response" }>; close: () => void }) {
  const [choice, setChoice] = useState<(typeof RESPONSES)[number]["value"]>("ACCEPTED");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <DialogContent title={`Customer response to quote v${a.version}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const note = String(new FormData(e.currentTarget).get("note") ?? "");
          run(() => recordQuoteResponse(a.quoteId, { response: choice, note }), { success: "Response recorded", onOk: close, onError: (r) => setErrors(r.fieldErrors ?? {}) });
        }}
      >
        <div role="radiogroup" aria-label="Response" className="grid grid-cols-3 gap-2">
          {RESPONSES.map((r) => (
            <button
              key={r.value} type="button" role="radio" aria-checked={choice === r.value} onClick={() => setChoice(r.value)}
              className={cn("rounded-md border px-3 py-1.5 text-[13px] cursor-pointer", choice === r.value ? "border-primary bg-primary-soft font-medium" : "border-border text-ink-2 hover:border-border-strong")}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-3">{RESPONSES.find((r) => r.value === choice)!.hint}</p>
        <Field label={choice === "ACCEPTED" ? "Note" : "What the customer said"} required={choice !== "ACCEPTED"} error={errors.note}>
          <Textarea name="note" className="min-h-16" />
        </Field>
        <Footer onCancel={close} pending={pending} label="Save" icon={<CheckCircle2 />} />
      </form>
    </DialogContent>
  );
}

// ───────────── Queue shortcuts (My work) ─────────────

export function StartPresalesButton({ requestId }: { requestId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" disabled={pending} onClick={() => run(() => startPresales(requestId), { success: "Marked in progress" })}>
      <PlayCircle /> Start work
    </Button>
  );
}

export function StartPricingButton({ requestId }: { requestId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" disabled={pending} onClick={() => run(() => startPricing(requestId), { success: "Marked in progress" })}>
      <PlayCircle /> Start pricing
    </Button>
  );
}

/** Request a BOQ (or a revision) from presales: who, by when, the requirement, and what presales should deliver. */
function PresalesRequestForm({ a, close }: { a: Extract<DealAction, { kind: "pullPresales" }>; close: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [asked, setAsked] = useState<string[]>(["BOQ"]);
  const { pending, run } = useAction();
  const toggle = (k: string) => setAsked((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  // Involving presales in a resale deal is a fresh request (deliverables and all), with a reason on record
  const revision = a.involve ? null : a.revision;
  return (
    <DialogContent
      title={a.involve ? "Involve presales" : revision ? `Request BOQ change (revision ${revision.number})` : "Request BOQ from presales"}
      description={
        a.involve ? "This deal started without presales. Bring them in to design the solution and own the BOQ."
          : revision ? "Presales updates the BOQ. Only the lines they change go back to purchase for pricing."
          : "Presales designs the solution and prepares the BOQ. The deal moves to the BOQ stage."
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          run(
            () => withFiles(a.oppId, files, () => setFiles([]), () => requestPresales(a.oppId, { ...f, deliverables: asked.join(",") }), (d) => ({ presalesRequestId: d?.requestId })),
            { success: "Presales notified", onOk: close, onError: (r) => setErrors(r.fieldErrors ?? {}) },
          );
        }}
      >
        {a.involve && (
          <>
            <ul className="flex list-disc flex-col gap-1 rounded-md bg-surface-2 py-2 pl-7 pr-3 text-xs text-ink-2" aria-label="What happens">
              {a.involve.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <Field label="Why presales is needed" required error={errors.reason}>
              <Textarea name="reason" className="min-h-14" placeholder="e.g. Customer now wants installation, migration and a site survey" />
            </Field>
          </>
        )}
        {revision && (
          <Field label="What needs to change" required error={errors.reason}>
            <Textarea name="reason" defaultValue={revision.note ?? ""} placeholder="e.g. Customer wants 5 nodes instead of 3" />
          </Field>
        )}
        <Field label="Customer requirement" required error={errors.scope}>
          <Textarea name="scope" defaultValue={a.revision?.scope} placeholder="e.g. 3-node HCI cluster for 120 VMs with 3-year support" />
        </Field>
        <Field label="Needed by" required error={errors.dueDate}>
          <Input name="dueDate" type="date" defaultValue={plusDays(revision ? 3 : 7)} min={isoDate(new Date())} className="w-44" />
        </Field>
        {a.docHint && !files.length && <p className="text-xs text-[var(--t-amber)]">{a.docHint} Add it under More options.</p>}
        <MoreOptions
          hint={[a.revision?.assigneeId ? a.presales.find((u) => u.id === a.revision!.assigneeId)?.name ?? "auto-assigned" : "auto-assigned", files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
          forceOpen={!!errors.assignedToId || !!errors.siteDetails || !!errors.deliverables}
        >
          <Field label="Presales engineer" error={errors.assignedToId}>
            <Select name="assignedToId" defaultValue={a.revision?.assigneeId ?? ""} aria-label="Presales engineer">
              <option value="">Auto-assign</option>
              {a.presales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          {!revision && (
            <Field label="What presales should deliver" error={errors.deliverables}>
              <div role="group" aria-label="Deliverables" className="flex flex-wrap gap-1.5">
                {PRESALES_DELIVERABLES.map((d) => (
                  <button
                    key={d.key} type="button" aria-pressed={asked.includes(d.key)} onClick={() => toggle(d.key)}
                    className={cn("rounded-full border px-2.5 py-1 text-xs cursor-pointer", asked.includes(d.key) ? "border-primary bg-primary-soft font-medium text-ink" : "border-border text-ink-2 hover:border-border-strong")}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {asked.includes("SITE_SURVEY") && !revision && (
            <Field label="Sites to survey" required error={errors.siteDetails}>
              <Textarea name="siteDetails" className="min-h-14" placeholder="e.g. Mumbai DC (Andheri) and Pune DR site" />
            </Field>
          )}
          {ATTACH.pullPresales.some((k) => !a.canAdd || a.canAdd.includes(k)) && (
            <AttachFiles label="Customer documents (RFP, SoW…)" kinds={ATTACH.pullPresales.filter((k) => !a.canAdd || a.canAdd.includes(k))} files={files} onChange={setFiles} existing={a.docs} />
          )}
        </MoreOptions>
        <input type="hidden" name="priority" value="NORMAL" />
        <Footer onCancel={close} pending={pending} label="Send to presales" icon={<Send />} />
      </form>
    </DialogContent>
  );
}
