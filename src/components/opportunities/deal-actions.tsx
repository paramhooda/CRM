"use client";
// The actions a viewer can take on a deal right now. The server decides which apply (see deal-status.tsx);
// this renders the main one or two as buttons, the rest under "More", and owns every dialog.
import { useState } from "react";
import {
  UserPlus, Send, Calculator, FileText, PlayCircle, CheckCircle2, GitBranch, MessageCircleQuestion, Reply, Undo2,
  UserCog, XCircle, MessageSquare, ChevronDown,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import {
  requestPresales, startPresales, submitBoq, requestPricing, startPricing, completePricing, createQuote,
  askSales, answerPresales, returnToPresales, reassignRequest, cancelRequest, recordQuoteResponse,
} from "@/server/actions/workflow";
import { inr, isoDate, pct } from "@/lib/format";
import { PRESALES_DELIVERABLES } from "@/lib/deal-setup";
import { cn } from "@/lib/utils";

const plusDays = (n: number) => isoDate(new Date(Date.now() + n * 86_400_000));
type U = { id: string; name: string };
type Base = { id: string; label: string; primary?: boolean; disabledReason?: string };

export type DealAction = Base &
  (
    | { kind: "pullPresales"; oppId: string; presales: U[]; revision?: { number: number; assigneeId: string | null; scope: string; note: string | null } }
    | { kind: "submitBoq"; requestId: string; purchase: U[]; lineCount: number; toPrice: number; asked?: string[] }
    | { kind: "askSales"; requestId: string }
    | { kind: "answer"; requestId: string; question: string; askedBy: string }
    | { kind: "requestPricing"; oppId: string; purchase: U[]; toPrice: number; first: boolean }
    | { kind: "completePricing"; requestId: string }
    | { kind: "sendBack"; requestId: string; presalesName: string | null }
    | { kind: "reassign"; reqKind: "presales" | "pricing"; requestId: string; people: U[]; currentId: string }
    | { kind: "cancel"; reqKind: "presales" | "pricing"; requestId: string }
    | { kind: "quote"; oppId: string; version: number; lines: { cost: number; price: number | null; mult: number }[] }
    | { kind: "response"; quoteId: string; version: number }
  );

const ICON: Record<DealAction["kind"], React.ReactNode> = {
  pullPresales: <UserPlus />, submitBoq: <Send />, askSales: <MessageCircleQuestion />, answer: <Reply />, requestPricing: <Calculator />,
  completePricing: <CheckCircle2 />, sendBack: <Undo2 />, reassign: <UserCog />, cancel: <XCircle />, quote: <FileText />, response: <MessageSquare />,
};

export function DealActions({ actions }: { actions: DealAction[] }) {
  const [active, setActive] = useState<DealAction | null>(null);
  const primary = actions.filter((a) => a.primary);
  const more = actions.filter((a) => !a.primary);
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {primary.map((a) => (
        <Button key={a.id} variant="primary" size="sm" disabled={!!a.disabledReason} title={a.disabledReason} onClick={() => setActive(a)}>
          {a.kind === "pullPresales" && a.revision ? <GitBranch /> : ICON[a.kind]} {a.label}
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
                {a.kind === "pullPresales" && a.revision ? <GitBranch /> : ICON[a.kind]} {a.label}
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
function ActionDialog({ a, close }: { a: DealAction; close: () => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
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
          description={a.toPrice ? `${a.toPrice} of ${a.lineCount} lines need a cost and go to purchase. The deal moves to Pricing.` : `All ${a.lineCount} lines already have a cost. Sales can quote straight away.`}
        >
          <form className={form} onSubmit={submit((f) => () => submitBoq(a.requestId, f), a.toPrice ? "BOQ submitted. Purchase notified." : "BOQ submitted. Sales notified.")}>
            {a.asked && a.asked.length > 0 && <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">Sales asked for: {a.asked.join(", ")}</p>}
            <Field label="Solution summary" required error={errors.solutionSummary}>
              <Textarea name="solutionSummary" placeholder="What was designed and how it was sized" />
            </Field>
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
                <Field label="Pricing needed by">
                  <Input name="dueDate" type="date" defaultValue={plusDays(5)} min={isoDate(new Date())} />
                </Field>
              </div>
            )}
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
          description={revalidate ? "Purchase re-confirms every line's cost and sets a new validity." : `${a.toPrice} line${a.toPrice > 1 ? "s" : ""} go to purchase for costs. The deal moves to Pricing.`}
        >
          <form className={form} onSubmit={submit((f) => () => requestPricing(a.oppId, f), "Purchase notified")}>
            {(!a.first || revalidate) && (
              <Field label={revalidate ? "Why" : "What changed"} required error={errors.reason}>
                <Textarea name="reason" className="min-h-14" placeholder={revalidate ? "e.g. Supplier pricing expired" : "e.g. Switch quantity changed from 8 to 12"} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Purchase owner">
                <Select name="assignedToId" defaultValue="">
                  <option value="">Auto-assign</option>
                  {a.purchase.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
              <Field label="Needed by" required>
                <Input name="dueDate" type="date" defaultValue={plusDays(5)} min={isoDate(new Date())} />
              </Field>
            </div>
            <Footer onCancel={close} pending={pending} label="Send to purchase" icon={<Send />} />
          </form>
        </DialogContent>
      );
    }
    case "completePricing":
      return (
        <DialogContent title="Pricing complete" description="Sales is notified to add margin and send the quote.">
          <form className={form} onSubmit={submit((f) => () => completePricing(a.requestId, f), "Pricing sent to sales")}>
            <Field label="Supplier pricing valid till" required error={errors.quoteValidTill}>
              <Input name="quoteValidTill" type="date" defaultValue={plusDays(30)} min={isoDate(new Date())} />
            </Field>
            <Field label="Notes for sales"><Textarea name="responseNotes" className="min-h-14" placeholder="Stock, price hold, lead times" /></Field>
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
        <DialogContent title={a.label} description="The new owner is notified. The due date stays the same.">
          <form className={form} onSubmit={submit((f) => () => reassignRequest(a.reqKind, a.requestId, f), "Reassigned")}>
            <Field label="Hand over to" required error={errors.assignedToId}>
              <Select name="assignedToId" defaultValue="">
                <option value="" disabled>Select</option>
                {a.people.filter((p) => p.id !== a.currentId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
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
    case "quote":
      return <QuoteForm a={a} close={close} />;
    case "response":
      return <ResponseForm a={a} close={close} />;
  }
}

/** Sales adds margin and sends the quote in one step. Prices already set on the lines can be kept. */
function QuoteForm({ a, close }: { a: Extract<DealAction, { kind: "quote" }>; close: () => void }) {
  const allPriced = a.lines.every((l) => l.price !== null);
  const [keep, setKeep] = useState(allPriced);
  const [margin, setMargin] = useState("15");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const m = Math.min(90, Math.max(0, Number(margin) || 0)) / 100;
  const cost = a.lines.reduce((s, l) => s + l.cost * l.mult, 0);
  const value = a.lines.reduce((s, l) => s + (keep ? l.price ?? 0 : Math.round(l.cost / (1 - m))) * l.mult, 0);
  const gm = value ? ((value - cost) / value) * 100 : null;
  return (
    <DialogContent title={a.version > 1 ? `Send revised quote (v${a.version})` : "Create & send quote"} description="The quote opens as a printable page to save as PDF and send. The deal moves to Proposal Submitted.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          run(() => createQuote(a.oppId, { ...f, marginPct: keep ? "" : String(m * 100) }), {
            success: "Quote created",
            onOk: (r) => {
              close();
              const id = (r.data as { id: string } | undefined)?.id;
              if (id) window.open(`/opportunities/${a.oppId}/quotes/${id}`, "_blank");
            },
            onError: (r) => setErrors(r.fieldErrors ?? {}),
          });
        }}
      >
        <div className="rounded-lg border border-border p-3">
          {allPriced && (
            <div role="radiogroup" aria-label="Pricing" className="mb-3 grid grid-cols-2 gap-2">
              {[{ v: true, l: "Use line item prices" }, { v: false, l: "Apply a margin" }].map((o) => (
                <button
                  key={o.l} type="button" role="radio" aria-checked={keep === o.v} onClick={() => setKeep(o.v)}
                  className={cn("rounded-md border px-3 py-1.5 text-[13px] cursor-pointer", keep === o.v ? "border-primary bg-primary-soft font-medium" : "border-border text-ink-2 hover:border-border-strong")}
                >
                  {o.l}
                </button>
              ))}
            </div>
          )}
          {!keep && (
            <Field label="Gross margin %" hint="Sets the sell price of every line from its cost">
              <Input value={margin} onChange={(e) => setMargin(e.target.value)} inputMode="decimal" aria-label="Gross margin %" className="w-28 text-right tabular" />
            </Field>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
            <div><dt className="text-xs text-ink-3">Quote value</dt><dd className="font-semibold tabular">{inr(value)}</dd></div>
            <div><dt className="text-xs text-ink-3">Cost</dt><dd className="tabular">{inr(cost)}</dd></div>
            <div><dt className="text-xs text-ink-3">Margin</dt><dd className="tabular" style={{ color: gm !== null && gm < 8 ? "var(--t-red)" : undefined }}>{gm === null ? "—" : pct(gm, 1)}</dd></div>
          </dl>
        </div>
        <Field label="Valid till" required error={errors.validTill}>
          <Input name="validTill" type="date" defaultValue={plusDays(30)} min={isoDate(new Date())} />
        </Field>
        <Field label="Terms">
          <Textarea name="terms" className="min-h-20" defaultValue={"Prices in INR, exclusive of GST.\nPayment: 30 days from invoice.\nDelivery: 3–4 weeks from PO, subject to OEM stock.\nWarranty and support as per OEM terms."} />
        </Field>
        <Footer onCancel={close} pending={pending} label={a.version > 1 ? "Send revised quote" : "Create & send quote"} icon={<Send />} />
      </form>
    </DialogContent>
  );
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
  const [asked, setAsked] = useState<string[]>(["BOQ"]);
  const { pending, run } = useAction();
  const toggle = (k: string) => setAsked((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  return (
    <DialogContent
      title={a.revision ? `Request BOQ change (revision ${a.revision.number})` : "Request BOQ from presales"}
      description={a.revision ? "Presales updates the BOQ. Only the lines they change go back to purchase for pricing." : "Presales designs the solution and prepares the BOQ. The deal moves to the BOQ stage."}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          run(() => requestPresales(a.oppId, { ...f, deliverables: asked.join(",") }), { success: "Presales notified", onOk: close, onError: (r) => setErrors(r.fieldErrors ?? {}) });
        }}
      >
        {a.revision && (
          <Field label="What needs to change" required error={errors.reason}>
            <Textarea name="reason" defaultValue={a.revision.note ?? ""} placeholder="e.g. Customer wants 5 nodes instead of 3" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Presales engineer" required error={errors.assignedToId}>
            <Select name="assignedToId" defaultValue={a.revision?.assigneeId ?? ""}>
              <option value="" disabled>Select</option>
              {a.presales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Needed by" required error={errors.dueDate}>
            <Input name="dueDate" type="date" defaultValue={plusDays(a.revision ? 3 : 7)} min={isoDate(new Date())} />
          </Field>
        </div>
        <Field label="Customer requirement" required error={errors.scope}>
          <Textarea name="scope" defaultValue={a.revision?.scope} placeholder="e.g. 3-node HCI cluster for 120 VMs with 3-year support" />
        </Field>
        {!a.revision && (
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
        {asked.includes("SITE_SURVEY") && !a.revision && (
          <Field label="Sites to survey" required error={errors.siteDetails}>
            <Textarea name="siteDetails" className="min-h-14" placeholder="e.g. Mumbai DC (Andheri) and Pune DR site" />
          </Field>
        )}
        <input type="hidden" name="priority" value="NORMAL" />
        <Footer onCancel={close} pending={pending} label="Send to presales" icon={<Send />} />
      </form>
    </DialogContent>
  );
}
