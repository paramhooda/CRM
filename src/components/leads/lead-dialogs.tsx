"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, ArrowRightLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { MoreOptions } from "@/components/ui/more-options";
import { saveLead, convertLead } from "@/server/actions/leads";
import { LEAD_STATUS_LABEL } from "@/lib/constants";
import { isoDate } from "@/lib/format";

type Opt = { id: string; name: string };

export function LeadDialog({
  id, initial, sources, bus, owners, canReassign, currentUserId,
}: { id?: string; initial?: Record<string, string>; sources: string[]; bus: Opt[]; owners: Opt[]; canReassign: boolean; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(initial?.status ?? "NEW");
  const { pending, run } = useAction();
  const v = initial ?? {};
  // The current owner stays selectable even if they are not in the sales list (an admin, someone who left), so saving
  // an unrelated edit never moves the lead to whoever happens to be first in the list
  const ownerList = v.ownerId && !owners.some((o) => o.id === v.ownerId) ? [{ id: v.ownerId, name: v.ownerName ?? "Current owner" }, ...owners] : owners;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {id ? <Button size="icon-sm" variant="ghost" aria-label="Edit lead"><Pencil /></Button> : <Button variant="primary"><Plus /> New lead</Button>}
      </DialogTrigger>
      <DialogContent title={id ? "Edit lead" : "New lead"}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => saveLead(id ?? null, f), { success: "Lead saved", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="First name" required error={errors.firstName}><Input name="firstName" defaultValue={v.firstName} /></Field>
          <Field label="Last name" required error={errors.lastName}><Input name="lastName" defaultValue={v.lastName} /></Field>
          <Field label="Company" required error={errors.company} className="sm:col-span-2"><Input name="company" defaultValue={v.company} /></Field>
          <Field label="Email" error={errors.email}><Input name="email" type="email" defaultValue={v.email} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={v.phone} /></Field>
          <Field label="Requirement" className="sm:col-span-2"><Textarea name="requirement" defaultValue={v.requirement} className="min-h-16" placeholder="What they are looking for" /></Field>
          <MoreOptions label="More details" className="sm:col-span-2" forceOpen={status === "UNQUALIFIED" || !!errors.disqualifyReason || !!errors.ownerId}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {Object.entries(LEAD_STATUS_LABEL).filter(([k]) => k !== "CONVERTED").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Owner" error={errors.ownerId}>
                <Select name="ownerId" defaultValue={v.ownerId ?? currentUserId} disabled={!canReassign}>{ownerList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
                {!canReassign && <input type="hidden" name="ownerId" value={v.ownerId ?? currentUserId} />}
              </Field>
              {status === "UNQUALIFIED" && (
                <Field label="Disqualify reason" required error={errors.disqualifyReason} className="sm:col-span-2"><Input name="disqualifyReason" defaultValue={v.disqualifyReason} /></Field>
              )}
              <Field label="Title"><Input name="title" defaultValue={v.title} /></Field>
              <Field label="City"><Input name="city" defaultValue={v.city} /></Field>
              <Field label="Source">
                <Select name="source" defaultValue={v.source ?? ""}><option value="">Select</option>{sources.map((s) => <option key={s}>{s}</option>)}</Select>
              </Field>
              <Field label="Business unit interest">
                <Select name="businessUnitId" defaultValue={v.businessUnitId ?? ""}><option value="">Not sure</option>{bus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
              </Field>
              <Field label="Estimated value (INR)"><Input name="estimatedValue" type="number" defaultValue={v.estimatedValue} /></Field>
            </div>
          </MoreOptions>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConvertLeadDialog({
  id, company, requirement, estimatedValue, buId, accounts, categories, oems,
}: {
  id: string; company: string; requirement: string | null; estimatedValue: number | null; buId: string | null;
  accounts: Opt[]; categories: (Opt & { buId: string; buName: string; needsPresales?: boolean })[]; oems: Opt[];
}) {
  const [categoryId, setCategoryId] = useState("");
  const [presales, setPresales] = useState<boolean | null>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const match = accounts.find((a) => a.name.toLowerCase() === company.toLowerCase());
  // The lead's business unit first, then every other category: the lead's guess may be wrong
  const cats = buId ? [...categories.filter((c) => c.buId === buId), ...categories.filter((c) => c.buId !== buId)] : categories;
  const cat = categories.find((c) => c.id === categoryId);
  const needsPresales = presales ?? !!cat?.needsPresales;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary"><ArrowRightLeft /> Convert</Button>
      </DialogTrigger>
      <DialogContent title={`Convert ${company}`} description="Creates the account (or links an existing one), the contact, and an opportunity in Qualified stage.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => convertLead(id, { ...f, presalesRequired: String(needsPresales) }), {
              success: "Lead converted",
              onOk: (r) => { setOpen(false); router.push(`/opportunities/${(r.data as { opportunityId: string }).opportunityId}`); },
              onError: (r) => setErrors(r.fieldErrors ?? {}),
            });
          }}
        >
          <Field label="Account" hint={match ? "Matched an existing account by name" : "A new prospect account will be created"}>
            <Select name="accountId" defaultValue={match?.id ?? ""}>
              <option value="">Create new account “{company}”</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Opportunity name" required error={errors.opportunityName}>
            <Input name="opportunityName" defaultValue={`${company.split(" ")[0]} - ${requirement ?? "New requirement"}`.slice(0, 150)} />
          </Field>
          <Field label="Category" required error={errors.categoryId}>
            <Select name="categoryId" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPresales(null); }}>
              <option value="" disabled>Select</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.buName} · {c.name}</option>)}
            </Select>
          </Field>
          {cat && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={needsPresales} onChange={(e) => setPresales(e.target.checked)} className="accent-[var(--primary)]" aria-label="Needs presales" />
              Needs presales (a solution to design){cat.needsPresales ? "" : " · usually resale for this category"}
            </label>
          )}
          <Field label="OEM" required error={errors.oemId} hint="Starts the deal with one estimate line. Presales replaces it with products in the BOQ.">
            <Select name="oemId" defaultValue="">
              <option value="" disabled>Select</option>
              {oems.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated value (INR)" required error={errors.amount}><Input name="amount" type="number" defaultValue={estimatedValue ?? ""} /></Field>
            <Field label="Expected close" required error={errors.expectedCloseDate}><Input name="expectedCloseDate" type="date" min={isoDate(new Date())} defaultValue={isoDate(new Date(Date.now() + 90 * 86_400_000))} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>Convert</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
