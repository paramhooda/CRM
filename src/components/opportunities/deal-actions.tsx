"use client";
// The actions a viewer can take on a deal right now. The server decides which apply (see deal-status.tsx);
// this renders the main one or two as buttons, the rest under "More", and owns every dialog.
import { useState } from "react";
import {
  UserPlus, Send, Calculator, FileText, PlayCircle, CheckCircle2, GitBranch, MessageCircleQuestion, Reply, Undo2,
  UserCog, XCircle, MessageSquare, ChevronDown, CalendarClock, CalendarPlus, ShieldCheck,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import {
  requestPresales, startPresales, submitBoq, requestPricing, startPricing, completePricing,
  askSales, answerPresales, returnToPresales, reassignRequest, cancelRequest, recordQuoteResponse, extendQuoteValidity, changeDueDate, decideApproval,
} from "@/server/actions/workflow";
import { gmSummary } from "@/lib/boq";
import { COST_SOURCE_META, type CostSourceKey } from "@/lib/costing";
import type { ResolvedStep } from "@/lib/approvals";
import { inr, pct } from "@/lib/format";
import { fmtDate, isoDate } from "@/lib/format";
import { AttachFiles, LineToggles, uploadAll, type ExistingDoc, type PickedFile } from "@/components/opportunities/attach-files";
import { MoreOptions } from "@/components/ui/more-options";
import { PricingForm, type PricingAction, type PriceLine } from "@/components/opportunities/pricing-form";
import { setDocumentLines } from "@/server/actions/documents";
import type { ActionResult } from "@/lib/validation";
import { PRESALES_DELIVERABLES, DELIVERABLE_LABEL } from "@/lib/deal-setup";
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
    | (Docs & {
        kind: "completePricing"; requestId: string; quotesAttached?: number;
        /** Lines priced in this request that need a supplier quote */
        quoteLines: { id: string; lineNo: number; description: string }[];
        /** Supplier and OEM quotes already attached to this request, and the lines each covers */
        requestQuotes: { id: string; fileName: string; lineIds: string[] }[];
      })
    | { kind: "sendBack"; requestId: string; presalesName: string | null }
    | { kind: "reassign"; reqKind: "presales" | "pricing"; requestId: string; people: U[]; currentId: string; due: Date; overdue: boolean }
    | { kind: "cancel"; reqKind: "presales" | "pricing"; requestId: string }
    | { kind: "dueDate"; reqKind: "presales" | "pricing"; requestId: string; due: Date }
    | PricingAction
    | { kind: "response"; quoteId: string; version: number }
    | { kind: "extend"; quoteId: string; version: number; validTill: Date; maxValidTill: Date | null }
    | { kind: "approve"; approvalId: string; reasons: string[]; steps: ResolvedStep[]; currentStep: number; requestedBy: string; lines: PriceLine[] }
  );

const ICON: Record<DealAction["kind"], React.ReactNode> = {
  pullPresales: <UserPlus />, submitBoq: <Send />, askSales: <MessageCircleQuestion />, answer: <Reply />, requestPricing: <Calculator />,
  completePricing: <CheckCircle2 />, sendBack: <Undo2 />, reassign: <UserCog />, cancel: <XCircle />, quote: <FileText />, response: <MessageSquare />,
  dueDate: <CalendarClock />, extend: <CalendarPlus />, approve: <ShieldCheck />,
};

/** Kinds each hand-over offers to attach */
const ATTACH: Record<"pullPresales" | "submitBoq" | "requestPricing" | "completePricing", Parameters<typeof AttachFiles>[0]["kinds"]> = {
  pullPresales: ["CUSTOMER_RFP", "SOW", "OTHER"],
  submitBoq: ["SOLUTION_DOC", "PRESENTATION", "SITE_SURVEY", "SOW", "OTHER"],
  requestPricing: ["OEM_QUOTE", "OTHER"],
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
    case "submitBoq": {
      // Documents sales asked for are required; files picked here count as soon as they're picked
      const stillMissing = (a.missingDocs ?? []).filter((m) => !files.some((f) => DELIVERABLE_LABEL[f.kind] === m));
      return (
        <DialogContent
          title="Submit BOQ"
          description={a.toPrice ? `${a.toPrice} of ${a.lineCount} lines go to purchase for a supplier price. The deal moves to Pricing.` : `None of the ${a.lineCount} lines needs a price from purchase. Sales can quote straight away.`}
        >
          <form
            className={form}
            onSubmit={(e) => {
              if (stillMissing.length) {
                e.preventDefault();
                setErrors({ docs: `Attach the ${stillMissing.join(" and the ").toLowerCase()} sales asked for.` });
                return;
              }
              submit((f) => () => withFiles(a.oppId, files, () => setFiles([]), () => submitBoq(a.requestId, f)), a.toPrice ? "BOQ submitted. Purchase notified." : "BOQ submitted. Sales notified.")(e);
            }}
          >
            <p className="text-xs text-ink-2">
              The BOQ is the line items: <a href={`/opportunities/${a.oppId}/boq`} target="_blank" rel="noreferrer" className="text-primary hover:underline">view or print it</a>.
            </p>
            <Field label="Solution summary" required error={errors.solutionSummary}>
              <Textarea name="solutionSummary" placeholder="What was designed and how it was sized" />
            </Field>
            {(a.missingDocs?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label="Required documents">
                <p className="text-[13px] font-medium">Sales asked for</p>
                <ul className="flex flex-col gap-1 text-xs">
                  {a.missingDocs!.map((m) => (
                    <li key={m} className={cn("flex items-center gap-1.5", stillMissing.includes(m) ? "text-[var(--t-amber)]" : "text-[var(--t-green)]")}>
                      {stillMissing.includes(m) ? "○" : "✓"} {m}
                    </li>
                  ))}
                </ul>
                {attach("submitBoq", a.docs)}
                {errors.docs && <p className="text-xs text-[var(--t-red)]">{errors.docs}</p>}
              </div>
            )}
            <MoreOptions hint={a.missingDocs?.length ? undefined : filesHint} forceOpen={!!errors.assumptions || !!errors.dueDate}>
              <Field label="Assumptions and exclusions" error={errors.assumptions}>
                <Textarea name="assumptions" className="min-h-14" placeholder="e.g. Customer provides rack space and power; cabling excluded" />
              </Field>
              {a.toPrice > 0 && (
                <Field label="Pricing needed by" error={errors.dueDate} hint="Purchase is assigned automatically">
                  <Input name="dueDate" type="date" defaultValue={plusDays(5)} min={isoDate(new Date())} className="w-44" />
                </Field>
              )}
              {!a.missingDocs?.length && attach("submitBoq", a.docs)}
            </MoreOptions>
            <Footer onCancel={close} pending={pending} label="Submit" icon={<Send />} />
          </form>
        </DialogContent>
      );
    }
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
              : `${a.toPrice} line${a.toPrice > 1 ? "s" : ""}${a.toPrice > 1 ? " go" : " goes"} to purchase for a supplier price. The deal moves to Pricing.`
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
      return <CompletePricingForm a={a} close={close} />;
    case "approve":
      return <ApproveForm a={a} close={close} />;
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

/**
 * Purchase hands the prices to sales. Every line priced in this request needs a supplier or OEM quote; one quote can
 * cover several lines. Quotes already attached can be pointed at their lines here too.
 */
function CompletePricingForm({ a, close }: { a: Extract<DealAction, { kind: "completePricing" }>; close: () => void }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [attached, setAttached] = useState(a.requestQuotes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const choices = a.quoteLines.map((l) => ({ id: l.id, lineNo: l.lineNo }));
  const covered = new Set([...attached.flatMap((d) => d.lineIds), ...files.flatMap((f) => (f.kind === "SUPPLIER_QUOTE" || f.kind === "OEM_QUOTE" ? f.lineIds ?? [] : []))]);
  const open = a.quoteLines.filter((l) => !covered.has(l.id));
  const kinds = ATTACH.completePricing.filter((k) => !a.canAdd || a.canAdd.includes(k));
  const point = (docId: string, ids: string[]) => {
    setAttached((xs) => xs.map((d) => (d.id === docId ? { ...d, lineIds: ids } : d)));
    run(() => setDocumentLines(docId, ids), {});
  };
  return (
    <DialogContent title="Pricing complete" description="Sales is notified to set the sales prices. Each supplier's validity stays on its lines; the date here applies to lines without one.">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (open.length) return setErrors({ quotes: `Attach the supplier quote for line ${open.map((l) => l.lineNo).join(", ")}, and mark which lines it covers.` });
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          run(() => withFiles(a.oppId, files, () => setFiles([]), () => completePricing(a.requestId, f)), {
            success: "Pricing sent to sales", onOk: close, onError: (r) => setErrors({ ...(r.fieldErrors ?? {}), quotes: r.error ?? "" }),
          });
        }}
      >
        {a.quoteLines.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label="Quote coverage">
            <p className="text-[13px] font-medium">Supplier quotes <span className="font-normal text-ink-3">· one quote can cover several lines</span></p>
            <ul className="flex flex-col gap-0.5 text-xs">
              {a.quoteLines.map((l) => (
                <li key={l.id} className={covered.has(l.id) ? "text-[var(--t-green)]" : "text-[var(--t-amber)]"}>
                  {covered.has(l.id) ? "✓" : "○"} Line {l.lineNo} · {l.description}
                </li>
              ))}
            </ul>
            {attached.map((d) => (
              <div key={d.id} className="rounded-md border border-border px-2 py-1">
                <p className="truncate text-xs">{d.fileName} <span className="text-ink-3">· attached</span></p>
                <LineToggles name={d.fileName} choices={choices} selected={d.lineIds} onChange={(ids) => point(d.id, ids)} />
              </div>
            ))}
            {kinds.length > 0 && (
              <AttachFiles kinds={kinds} files={files} onChange={setFiles} label="Add supplier quotes" required lineChoices={choices} defaultLineIds={open.map((l) => l.id)} />
            )}
            {errors.quotes && <p className="text-xs text-[var(--t-red)]">{errors.quotes}</p>}
          </div>
        )}
        <Field label="Valid till, for lines without their own date" required error={errors.quoteValidTill}>
          <Input name="quoteValidTill" type="date" defaultValue={plusDays(30)} min={isoDate(new Date())} className="w-44" />
        </Field>
        <MoreOptions label="Notes for sales">
          <Textarea name="responseNotes" aria-label="Notes for sales" className="min-h-14" placeholder="Stock, price hold, lead times" />
        </MoreOptions>
        <Footer onCancel={close} pending={pending} label="Send to sales" icon={<Send />} />
      </form>
    </DialogContent>
  );
}

/** An approver reviews the prices the owner asked approval for: lines, GM, why approval is needed, and the steps. */
function ApproveForm({ a, close }: { a: Extract<DealAction, { kind: "approve" }>; close: () => void }) {
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const gm = gmSummary(a.lines.map((l) => ({ ...l, unitCost: l.cost, unitPrice: l.price })));
  const decide = (decision: "APPROVED" | "REJECTED") =>
    run(() => decideApproval(a.approvalId, { decision, note }), {
      success: decision === "APPROVED" ? "Prices approved" : "Sent back to the owner",
      onOk: close,
      onError: (r) => setErrors(r.fieldErrors ?? {}),
    });
  return (
    <DialogContent title="Approve prices" description={`${a.requestedBy} asks for approval before sending the quote.`} wide className="max-w-4xl">
      <div className="flex flex-col gap-4">
        <ul className="list-inside list-disc rounded-lg border border-[var(--t-amber)] px-3 py-2 text-xs text-ink-2" aria-label="Why approval is needed">
          {a.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <div className="-mx-5 overflow-x-auto border-y border-border scrollbar-thin">
          <table className="w-full min-w-[640px] text-[13px]" aria-label="Prices to approve">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-ink-3">
                <th className="px-5 py-2 font-medium">Item</th><th className="px-2 py-2 text-right font-medium">Qty</th>
                <th className="px-2 py-2 text-right font-medium">Cost</th><th className="px-2 py-2 text-right font-medium">Sales price</th>
                <th className="px-5 py-2 text-right font-medium">GM %</th>
              </tr>
            </thead>
            <tbody>
              {a.lines.map((l) => {
                const g = l.price ? ((l.price - l.cost) / l.price) * 100 : null;
                const disc = l.costSource === "RATE_CARD" && l.listPrice !== null && l.price !== null && l.price < l.listPrice - 0.005;
                return (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-5 py-2"><span className="mr-2 text-xs text-ink-3">{l.n}</span>{l.description}</td>
                    <td className="px-2 py-2 text-right tabular">{l.quantity.toLocaleString("en-IN")} <span className="text-xs text-ink-3">{l.unit}</span></td>
                    <td className="px-2 py-2 text-right tabular text-ink-2">{l.cost.toLocaleString("en-IN")}<span className="block text-[11px] text-ink-3">{COST_SOURCE_META[l.costSource as CostSourceKey]?.costLabel}</span></td>
                    <td className="px-2 py-2 text-right tabular">
                      {l.price?.toLocaleString("en-IN") ?? "—"}
                      {disc && <span className="block text-[11px] text-[var(--t-amber)]">rate card {l.listPrice!.toLocaleString("en-IN")}</span>}
                    </td>
                    <td className={cn("px-5 py-2 text-right tabular", g !== null && g < 0 && "text-[var(--t-red)]")}>{g === null ? "—" : pct(g, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <div><dt className="text-xs text-ink-3">Contract value</dt><dd className="font-semibold tabular">{inr(gm.contract.value)}</dd></div>
          <div><dt className="text-xs text-ink-3">Cost</dt><dd className="font-semibold tabular">{inr(gm.contract.cost)}</dd></div>
          <div><dt className="text-xs text-ink-3">Contract GM</dt><dd className="font-semibold tabular">{inr(gm.contract.gm)} <span className="text-xs font-normal text-ink-3">{gm.contract.gmPct === null ? "" : pct(gm.contract.gmPct, 1)}</span></dd></div>
          {gm.monthly && <div><dt className="text-xs text-ink-3">Monthly GM</dt><dd className="font-semibold tabular">{inr(gm.monthly.gm)}</dd></div>}
        </dl>
        <ol className="flex flex-col gap-1 text-xs" aria-label="Approval steps">
          {a.steps.map((st, i) => (
            <li key={i} className={cn(i === a.currentStep ? "font-medium text-ink" : "text-ink-3")}>
              {i + 1}. {st.label}{st.decision ? ` · ${st.decision === "APPROVED" ? "approved" : "rejected"} by ${st.decidedByName}` : i === a.currentStep ? " · your step" : ""}
            </li>
          ))}
        </ol>
        <Field label="Note" error={errors.note} hint="Required when you send it back">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Approval note" className="min-h-14" placeholder="e.g. Keep NOC at the rate card; the hardware margin is fine" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={close}>Cancel</Button>
          <Button type="button" variant="danger" disabled={pending} onClick={() => decide("REJECTED")}><XCircle /> Send back</Button>
          <Button type="button" variant="primary" disabled={pending} onClick={() => decide("APPROVED")}><ShieldCheck /> Approve</Button>
        </div>
      </div>
    </DialogContent>
  );
}
