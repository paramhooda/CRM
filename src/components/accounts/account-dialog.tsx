"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { saveAccount } from "@/server/actions/accounts";
import { SEGMENT_LABEL, ACCOUNT_STATUS_LABEL } from "@/lib/constants";

export type AccountValues = Record<string, string>;
const INDIAN_STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Chandigarh", "Jammu and Kashmir",
];

export function AccountDialog({
  id, initial, industries, owners, canReassign, trigger,
}: { id?: string; initial?: AccountValues; industries: string[]; owners: { id: string; name: string }[]; canReassign: boolean; trigger?: "edit" | "new" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const v = initial ?? {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger === "edit" ? <Button><Pencil /> Edit</Button> : <Button variant="primary"><Plus /> New account</Button>}
      </DialogTrigger>
      <DialogContent title={id ? "Edit account" : "New account"} description="GSTIN and PAN are validated against the Indian format." wide>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => saveAccount(id ?? null, f), {
              success: id ? "Account updated" : "Account created",
              onOk: (r) => { setOpen(false); if (!id && r.data) router.push(`/accounts/${(r.data as { id: string }).id}`); },
              onError: (r) => setErrors(r.fieldErrors ?? {}),
            });
          }}
        >
          <Field label="Account name" required error={errors.name} className="sm:col-span-2"><Input name="name" defaultValue={v.name} placeholder="Registered company name" /></Field>
          <Field label="Industry" error={errors.industry}>
            <Select name="industry" defaultValue={v.industry ?? ""}><option value="">Select</option>{industries.map((i) => <option key={i}>{i}</option>)}</Select>
          </Field>
          <Field label="Segment" required>
            <Select name="segment" defaultValue={v.segment ?? "ENTERPRISE"}>{Object.entries(SEGMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={v.status ?? "PROSPECT"}>{Object.entries(ACCOUNT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Account owner" hint={!canReassign ? "You will own this account" : undefined}>
            <Select name="ownerId" defaultValue={v.ownerId ?? owners[0]?.id} disabled={!canReassign}>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
            {!canReassign && <input type="hidden" name="ownerId" value={v.ownerId ?? owners[0]?.id} />}
          </Field>
          <Field label="GSTIN" error={errors.gstin}><Input name="gstin" defaultValue={v.gstin} placeholder="27AABCZ1234F1Z5" className="font-mono uppercase" maxLength={15} /></Field>
          <Field label="PAN" error={errors.pan}><Input name="pan" defaultValue={v.pan} placeholder="AABCZ1234F" className="font-mono uppercase" maxLength={10} /></Field>
          <Field label="Website"><Input name="website" defaultValue={v.website} placeholder="https://" /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={v.phone} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input name="addressLine" defaultValue={v.addressLine} /></Field>
          <Field label="City"><Input name="city" defaultValue={v.city} /></Field>
          <Field label="State">
            <Select name="state" defaultValue={v.state ?? ""}><option value="">Select</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
          </Field>
          <Field label="PIN code" error={errors.pincode}><Input name="pincode" defaultValue={v.pincode} maxLength={6} inputMode="numeric" /></Field>
          <Field label="Annual revenue (₹ Cr)"><Input name="annualRevenueCr" type="number" step="any" defaultValue={v.annualRevenueCr} /></Field>
          <Field label="Employees"><Input name="employees" type="number" defaultValue={v.employees} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="description" defaultValue={v.description} className="min-h-14" /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{id ? "Save" : "Create account"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
