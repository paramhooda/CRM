"use client";
import { useState } from "react";
import { UserPlus, Send, Calculator, FileText, PlayCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import {
  requestPresales, startPresales, submitBoq, requestPricing, startPricing, completePricing, createQuote, syncAmountFromBoq,
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

export function PullPresalesButton({ oppId, presales, stageBeforeBoq, size = "md" }: { oppId: string; presales: U[]; stageBeforeBoq: boolean; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size={size}><UserPlus /> Pull in presales</Button>
      </DialogTrigger>
      <DialogContent title="Pull in presales" description="Presales will be notified to design the solution and prepare the BOQ. Purchase is looped in when the BOQ is submitted.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => requestPresales(oppId, f), { success: "Presales notified", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Presales engineer" required error={errors.assignedToId}>
              <Select name="assignedToId" defaultValue="">
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
          <Field label="BOQ due by" required error={errors.dueDate} hint="Standard turnaround is 7 days.">
            <Input name="dueDate" type="date" defaultValue={plusDays(7)} min={isoDate(new Date())} />
          </Field>
          <Field label="Scope and customer requirement" required error={errors.scope}>
            <Textarea name="scope" placeholder="e.g. 3-node HCI cluster for 120 VMs, 3-year support, migration from existing VMware hosts" />
          </Field>
          {stageBeforeBoq && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" name="moveToBoq" defaultChecked className="accent-[var(--primary)]" /> Move deal to BOQ stage
            </label>
          )}
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Send request" icon={<Send />} />
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

export function SubmitBoqButton({ requestId, purchase, lineCount }: { requestId: string; purchase: U[]; lineCount: number }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" disabled={lineCount === 0} title={lineCount === 0 ? "Add BOQ lines first" : undefined}>
          <Send /> Submit BOQ to purchase
        </Button>
      </DialogTrigger>
      <DialogContent title="Submit BOQ and request pricing" description={`${lineCount} BOQ lines will go to Purchase for OEM / distributor pricing.`}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => submitBoq(requestId, f), { success: "BOQ submitted. Purchase notified.", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="Solution summary" required error={errors.solutionSummary}>
            <Textarea name="solutionSummary" placeholder="Design rationale, sizing assumptions, exclusions" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase owner" hint="Leave blank to auto-assign">
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
          <FormFooter onCancel={() => setOpen(false)} pending={pending} label="Submit" icon={<Send />} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RequestPricingButton({ oppId, purchase }: { oppId: string; purchase: U[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Calculator /> Request pricing</Button>
      </DialogTrigger>
      <DialogContent title="Request pricing from purchase">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => requestPricing(oppId, f), { success: "Purchase notified", onOk: () => setOpen(false) });
          }}
        >
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

export function CreateQuoteButton({ oppId, disabledReason }: { oppId: string; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" disabled={!!disabledReason} title={disabledReason}>
          <FileText /> Generate quote
        </Button>
      </DialogTrigger>
      <DialogContent title="Generate customer quote" description="Creates a new quote version from the priced BOQ, updates the deal value and moves the deal to Proposal Submitted.">
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

export function SyncAmountButton({ oppId }: { oppId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => syncAmountFromBoq(oppId), { success: "Deal value updated from BOQ" })}>
      <RefreshCw /> Use BOQ total as deal value
    </Button>
  );
}
