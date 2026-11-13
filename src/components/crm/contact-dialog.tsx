"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FormError } from "./form";
import { Combobox } from "./combobox";
import { ConfirmDialog } from "./dialogs";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { contactSchema } from "@/contracts/accounts";

export type ContactValues = { accountId: string | null; firstName: string; lastName: string; email: string; phone: string; mobile: string; designation: string; department: string; isPrimary: boolean };

/** Add or edit a contact. The account is fixed when opened from an account page, otherwise picked here. */
export function ContactDialog({ open, onOpenChange, contactId, initial, accountId, accountName, canDelete }: { open: boolean; onOpenChange: (o: boolean) => void; contactId?: string; initial?: Partial<ContactValues>; accountId?: string; accountName?: string; canDelete?: boolean }) {
  const router = useRouter();
  const f = useForm<ContactValues>({ accountId: accountId ?? null, firstName: "", lastName: "", email: "", phone: "", mobile: "", designation: "", department: "", isPrimary: false, ...initial }, contactSchema);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loadAccounts = useCallback(async (q: string) => {
    const r = await api.get<{ rows: { id: string; name: string; code: string }[] }>(`/accounts?q=${encodeURIComponent(q)}&pageSize=20`);
    return r.rows.map((a) => ({ value: a.id, label: a.name, hint: a.code }));
  }, []);
  const save = () =>
    f.submit(async (v) => {
      const body = { ...v, email: v.email || null };
      if (contactId) {
        const { accountId: _a, ...rest } = body;
        await api.patch(`/contacts/${contactId}`, rest);
      } else await api.post("/contacts", body);
      toast.success(contactId ? "Contact saved" : "Contact added");
      onOpenChange(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contactId ? "Edit contact" : "New contact"}</DialogTitle>
          <DialogDescription>{accountName ? `At ${accountName}` : "A person at a customer or prospect."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {!accountId && !contactId && (
            <Field label="Account" htmlFor="contact-account" error={f.errors.accountId} required>
              <Combobox id="contact-account" value={f.values.accountId} onChange={(v) => f.set("accountId", v)} load={loadAccounts} placeholder="Pick an account" searchPlaceholder="Search accounts…" invalid={!!f.errors.accountId} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" error={f.errors.firstName} required><Input id="firstName" value={f.values.firstName} onChange={(e) => f.set("firstName", e.target.value)} aria-invalid={!!f.errors.firstName} autoFocus /></Field>
            <Field label="Last name" htmlFor="lastName" error={f.errors.lastName} required><Input id="lastName" value={f.values.lastName} onChange={(e) => f.set("lastName", e.target.value)} aria-invalid={!!f.errors.lastName} /></Field>
            <Field label="Email" htmlFor="email" error={f.errors.email}><Input id="email" type="email" value={f.values.email} onChange={(e) => f.set("email", e.target.value)} aria-invalid={!!f.errors.email} /></Field>
            <Field label="Designation" htmlFor="designation" error={f.errors.designation}><Input id="designation" value={f.values.designation} onChange={(e) => f.set("designation", e.target.value)} /></Field>
            <Field label="Phone" htmlFor="phone" error={f.errors.phone}><Input id="phone" value={f.values.phone} onChange={(e) => f.set("phone", e.target.value)} /></Field>
            <Field label="Mobile" htmlFor="mobile" error={f.errors.mobile}><Input id="mobile" value={f.values.mobile} onChange={(e) => f.set("mobile", e.target.value)} /></Field>
            <Field label="Department" htmlFor="department" error={f.errors.department}><Input id="department" value={f.values.department} onChange={(e) => f.set("department", e.target.value)} /></Field>
            <div className="flex items-center gap-2 self-end pb-2">
              <Switch id="isPrimary" checked={f.values.isPrimary} onCheckedChange={(v) => f.set("isPrimary", v)} />
              <label htmlFor="isPrimary" className="text-sm">Primary contact</label>
            </div>
          </div>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter className="sm:justify-between">
            {contactId && canDelete ? <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}>Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={f.pending}>{contactId ? "Save" : "Add contact"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
      {contactId && (
        <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this contact?" description="It is removed from open deals as the customer contact. An administrator can restore it." destructive confirmLabel="Delete" onConfirm={async () => { await api.del(`/contacts/${contactId}`); toast.success("Contact deleted"); onOpenChange(false); router.refresh(); }} />
      )}
    </Dialog>
  );
}
