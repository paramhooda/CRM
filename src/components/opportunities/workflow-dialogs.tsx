"use client";
import { useState } from "react";
import { UserPlus, Send, Calculator, FileText, PlayCircle, CheckCircle2, GitBranch, MessageCircleQuestion, Reply, Undo2, UserCog, XCircle, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import {
  requestPresales, startPresales, submitBoq, requestPricing, startPricing, completePricing, createQuote,
  askSales, answerPresales, returnToPresales, reassignRequest, cancelRequest, recordQuoteResponse,
} from "@/server/actions/workflow";
import { isoDate } from "@/lib/format";

const plusDays = (n: number) => isoDate(new Date(Date.now() + n * 86_400_000));
type U = { id: string; name: string };

function FormFooter({ onCancel, pending, label, icon }: { onCancel: () => void; pending: boolean; label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="primary" disabled={pending}>{icon}{label}</Button>
    </div>
  );
}

/** First BOQ request, or (with `revision`) a request to revise the BOQ: customer change, pricing problem, new scope. */
export function PullPresalesButton({
  oppId, presales, stageBeforeBoq, size = "md", revision,
}: {
  oppId: string; presales: U[]; stageBeforeBoq: boolean; size?: "sm" | "md";
  revision?: { number: number; assigneeId: string | null; scope: string; pricingOpen: boolean; customerAsked: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {revision ? (
          <Button size={size}><GitBranch /> Request BOQ revision</Button>
        ) : (
          <Button variant="primary" size={size}><UserPlus /> Pull in presales</Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={revision ? `Request BOQ revision ${revision.number}` : "Pull in presales"}
        description={
          revision
            ? `Presales revises the BOQ. Lines they change go back to purchase for re-pricing; unchanged lines keep their cost.${revision.pricingOpen ? " Pricing in progress will be stopped." : ""}`
            : "Presales will be notified to design the solution and prepare the BOQ. Purchase is looped in when the BOQ is submitted."
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => requestPresales(oppId, f), { success: "Presales notified", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          {revision && (
            <Field label="What needs to change" required error={errors.reason}>
              <Textarea name="reason" defaultValue={revision.customerAsked ?? ""} placeholder="e.g. Customer wants 5 nodes instead of 3 and 5-year support" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Presales engineer" required error={errors.assignedToId}>
              <Select name="assignedToId" defaultValue={revision?.assigneeId ?? ""}>
                <option value="" disabled>Select</option>
                {presales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="NORMAL">
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
          </div>
          <Field label="BOQ due by" required error={errors.dueDate} hint={revision ? "Revisions usually take 2–3 days." : "Standard turnaround is 7 days."}>
            <Input name="dueDate" type="date" defaultValue={plusDays(revision ? 3 : 7)} min={isoDate(new Date())} />
          </Field>
          <Field label="Scope and customer requirement" required error={errors.scope}>
            <Textarea name="scope" defaultValue={revision?.scope} placeholder="e.g. 3-node HCI cluster for 120 VMs, 3-year support, migration from existing VMware hosts" />
          </Field>
          {stageBeforeBoq && !revision && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" name="moveToBoq" defaultChecked className="accent-[var(--primary)]" /> Move deal to BOQ stage
            </label>
          )}
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label={revision ? "Request revision" : "Send request"} icon={<Send />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StartPresalesButton({ requestId }: { requestId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" disabled={pending} onClick={() => run(() => startPresales(requestId), { success: "Marked in progress" })}>
      <PlayCircle /> Start work
    </Button>
  );
}

export function SubmitBoqButton({ requestId, purchase, lineCount, toPrice }: { requestId: string; purchase: U[]; lineCount: number; toPrice: number }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" disabled={lineCount === 0} title={lineCount === 0 ? "Add BOQ lines first" : undefined}>
          <Send /> Submit BOQ
        </Button>
      </DialogTrigger>
      <DialogContent
        title={toPrice ? "Submit BOQ and request pricing" : "Submit BOQ"}
        description={
          toPrice
            ? `${toPrice} of ${lineCount} lines need a cost and will go to purchase. Lines purchase already priced keep their cost.`
            : `All ${lineCount} lines already have a current cost, so no pricing is needed. Sales can quote straight away.`
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => submitBoq(requestId, f), {
              success: toPrice ? "BOQ submitted. Purchase notified." : "BOQ submitted. Sales notified.",
              onOk: () => setOpen(false),
              onError: (r) => setErrors(r.fieldErrors ?? {}),
            });
          }}
        >
          <Field label="Solution summary" required error={errors.solutionSummary}>
            <Textarea name="solutionSummary" placeholder="Design rationale, sizing assumptions, exclusions" />
          </Field>
          {toPrice > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Purchase owner" hint="Blank keeps the same person, or auto-assigns">
                  <Select name="purchaseUserId" defaultValue="">
                    <option value="">Auto-assign</option>
                    {purchase.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                </Field>
                <Field label="Pricing needed by">
                  <Input name="dueDate" type="date" defaultValue={plusDays(5)} min={isoDate(new Date())} />
                </Field>
              </div>
              <Field label="Notes for purchase">
                <Textarea name="notes" className="min-h-14" placeholder="Preferred distributor, stock check, support SKUs…" />
              </Field>
            </>
          )}
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Submit" icon={<Send />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pricing without presales. `toPrice` lines without a current cost are priced; with none, every line is
 * re-validated (used when supplier pricing has expired).
 */
export function RequestPricingButton({ oppId, purchase, toPrice, first, variant = "secondary" }: { oppId: string; purchase: U[]; toPrice: number; first: boolean; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const revalidate = toPrice === 0;
  const label = revalidate ? "Re-validate costs" : first ? "Request pricing" : "Request re-pricing";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}><Calculator /> {label}</Button>
      </DialogTrigger>
      <DialogContent
        title={label}
        description={
          revalidate
            ? "Purchase re-confirms the cost of every line with the OEM or distributor and sets a new validity."
            : `${toPrice} line${toPrice > 1 ? "s" : ""} without a current cost will go to purchase. Other lines keep their cost.`
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => requestPricing(oppId, f), { success: "Purchase notified", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          {(!first || revalidate) && (
            <Field label={revalidate ? "Why re-validate" : "What changed"} required error={errors.reason}>
              <Textarea name="reason" className="min-h-14" placeholder={revalidate ? "e.g. Supplier pricing expired; customer still evaluating" : "e.g. Quantity of switches increased from 8 to 12"} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase owner">
              <Select name="assignedToId" defaultValue="">
                <option value="">Auto-assign</option>
                {purchase.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label="Needed by" required>
              <Input name="dueDate" type="date" defaultValue={plusDays(5)} min={isoDate(new Date())} />
            </Field>
          </div>
          <Field label="Notes"><Textarea name="notes" className="min-h-14" /></Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Send request" icon={<Send />} />
        </form>
      </DialogContent>
    </Dialog>
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

export function CompletePricingButton({ requestId, missing }: { requestId: string; missing: number }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" disabled={missing > 0} title={missing ? `${missing} lines need a unit cost` : undefined}>
          <CheckCircle2 /> Pricing complete
        </Button>
      </DialogTrigger>
      <DialogContent title="Complete pricing" description="Sales and presales will be notified that costs are ready.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => completePricing(requestId, f), { success: "Pricing sent to sales", onOk: () => setOpen(false) });
          }}
        >
          <Field label="Supplier quotes valid till" required>
            <Input name="quoteValidTill" type="date" defaultValue={plusDays(30)} min={isoDate(new Date())} />
          </Field>
          <Field label="Notes for sales"><Textarea name="responseNotes" className="min-h-14" placeholder="Stock position, price-hold, lead times" /></Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Send to sales" icon={<Send />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateQuoteButton({ oppId, disabledReason, label = "Generate quote", variant = "primary" }: { oppId: string; disabledReason?: string; label?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} disabled={!!disabledReason} title={disabledReason}>
          <FileText /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent title="Generate customer quote" description="Creates a new quote version from the priced BOQ. Any earlier open version is superseded. Updates the deal value and moves the deal to Proposal Submitted.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => createQuote(oppId, f), {
              success: "Quote generated",
              onOk: (r) => {
                setOpen(false);
                const id = (r.data as { id: string } | undefined)?.id;
                if (id) window.open(`/opportunities/${oppId}/quotes/${id}`, "_blank");
              },
            });
          }}
        >
          <Field label="Valid till" required>
            <Input name="validTill" type="date" defaultValue={plusDays(30)} min={isoDate(new Date())} />
          </Field>
          <Field label="Commercial terms">
            <Textarea
              name="terms"
              defaultValue={"Prices in INR, exclusive of GST.\nPayment: 30 days from invoice.\nDelivery: 3–4 weeks from PO, subject to OEM stock.\nWarranty and support as per OEM terms."}
              className="min-h-24"
            />
          </Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Generate" icon={<FileText />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Revisions, questions, hand-offs ─────────────

/** Presales needs information from sales. The request pauses and its due date moves out by the wait. */
export function AskSalesButton({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><MessageCircleQuestion /> Ask sales</Button>
      </DialogTrigger>
      <DialogContent title="Ask sales a question" description="The request pauses until sales answers, and your due date moves out by the time you waited.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => askSales(requestId, f), { success: "Question sent to sales", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="Question" required error={errors.question}>
            <Textarea name="question" placeholder="e.g. Does the customer need DR at the second site, or backup only?" />
          </Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Send question" icon={<Send />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AnswerPresalesButton({ requestId, question, askedBy }: { requestId: string; question: string; askedBy: string }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary"><Reply /> Answer presales</Button>
      </DialogTrigger>
      <DialogContent title={`Answer ${askedBy}`} description="Presales resumes work as soon as you reply.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => answerPresales(requestId, f), { success: "Answer sent. Presales has resumed.", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <p className="rounded-md bg-surface-2 px-3 py-2 text-[13px]"><span className="font-medium">{askedBy}:</span> {question}</p>
          <Field label="Your answer" required error={errors.answer}>
            <Textarea name="answer" />
          </Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Send answer" icon={<Reply />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Purchase cannot price the BOQ as specified and sends it back with the reason. */
export function ReturnToPresalesButton({ requestId, presalesName }: { requestId: string; presalesName: string | null }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Undo2 /> Send back</Button>
      </DialogTrigger>
      <DialogContent
        title={presalesName ? "Send BOQ back to presales" : "Send BOQ back to sales"}
        description={presalesName ? `${presalesName} gets a new BOQ revision to fix, marked high priority. Sales is told why.` : "Sales is told what to fix before requesting pricing again."}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => returnToPresales(requestId, f), { success: "Sent back", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="What needs fixing" required error={errors.reason}>
            <Textarea name="reason" placeholder="e.g. Part C9300-48P is end-of-sale; suggest C9300X-48HX. Line 4 has no support SKU." />
          </Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Send back" icon={<Undo2 />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReassignRequestButton({ kind, requestId, people, currentId }: { kind: "presales" | "pricing"; requestId: string; people: U[]; currentId: string }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const others = people.filter((p) => p.id !== currentId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={!others.length}><UserCog /> Reassign</Button>
      </DialogTrigger>
      <DialogContent title={`Reassign ${kind === "presales" ? "BOQ" : "pricing"} request`} description="The new owner is notified and keeps the same due date.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => reassignRequest(kind, requestId, f), { success: "Reassigned", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="Hand over to" required error={errors.assignedToId}>
            <Select name="assignedToId" defaultValue="">
              <option value="" disabled>Select</option>
              {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Note"><Textarea name="note" className="min-h-14" placeholder="e.g. On leave this week" /></Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Reassign" icon={<UserCog />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelRequestButton({ kind, requestId }: { kind: "presales" | "pricing"; requestId: string }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><XCircle /> Cancel request</Button>
      </DialogTrigger>
      <DialogContent title={`Cancel ${kind === "presales" ? "BOQ" : "pricing"} request`} description="The assignee is told to stop work.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => cancelRequest(kind, requestId, f), { success: "Request cancelled", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="Reason" required error={errors.reason}>
            <Textarea name="reason" className="min-h-14" placeholder="e.g. Customer postponed the project to next year" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setOpen(false)}>Keep request</Button>
            <Button type="submit" variant="danger" disabled={pending}><XCircle /> Cancel request</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const RESPONSES = [
  { value: "ACCEPTED", label: "Accepted", hint: "Customer agreed. Mark the deal Won when the PO arrives." },
  { value: "CHANGES_REQUESTED", label: "Wants changes", hint: "Re-price, or ask presales for a BOQ revision, then issue a new version." },
  { value: "REJECTED", label: "Rejected", hint: "The deal stays open in case they re-engage. Close it as Lost if not." },
] as const;

export function QuoteResponseButton({ quoteId, version, size = "sm" }: { quoteId: string; version: number; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<(typeof RESPONSES)[number]["value"]>("CHANGES_REQUESTED");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size}><MessageSquare /> Customer response</Button>
      </DialogTrigger>
      <DialogContent title={`Customer response to quote v${version}`}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") ?? "");
            run(() => recordQuoteResponse(quoteId, { response: choice, note }), { success: "Response recorded", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <div role="radiogroup" aria-label="Response" className="grid gap-2 sm:grid-cols-3">
            {RESPONSES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={choice === r.value}
                onClick={() => setChoice(r.value)}
                className={
                  "rounded-lg border px-3 py-2 text-left text-[13px] cursor-pointer transition-colors " +
                  (choice === r.value ? "border-primary bg-primary-soft text-ink" : "border-border hover:border-border-strong")
                }
              >
                <span className="font-medium">{r.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-3">{RESPONSES.find((r) => r.value === choice)!.hint}</p>
          <Field label={choice === "ACCEPTED" ? "Note" : "What the customer said"} required={choice !== "ACCEPTED"} error={errors.note}>
            <Textarea name="note" className="min-h-16" placeholder={choice === "CHANGES_REQUESTED" ? "e.g. Wants 3-year instead of 5-year support, and 10% lower" : undefined} />
          </Field>
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Save response" icon={<CheckCircle2 />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
