"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { saveContact, deleteContact } from "@/server/actions/accounts";
import { CONTACT_ROLE_LABEL } from "@/lib/constants";

export function ContactDialog({
  id, accountId, accounts, initial, mode = "new",
}: { id?: string; accountId?: string; accounts?: { id: string; name: string }[]; initial?: Record<string, string | boolean | null>; mode?: "new" | "edit" }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const v = initial ?? {};
  const s = (k: string) => (v[k] === null || v[k] === undefined ? undefined : String(v[k]));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "edit" ? (
          <Button size="icon-sm" variant="ghost" aria-label="Edit contact"><Pencil /></Button>
        ) : (
          <Button variant={accounts ? "primary" : "secondary"} size={accounts ? "md" : "sm"}><Plus /> Add contact</Button>
        )}
      </DialogTrigger>
      <DialogContent title={id ? "Edit contact" : "New contact"} wide>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => saveContact(id ?? null, { ...f, accountId: accountId ?? f.accountId }), {
              success: id ? "Contact updated" : "Contact added",
              onOk: () => setOpen(false),
              onError: (r) => setErrors(r.fieldErrors ?? {}),
            });
          }}
        >
          {accounts && !accountId && (
            <Field label="Account" required error={errors.accountId} className="sm:col-span-2">
              <Select name="accountId" defaultValue=""><option value="" disabled>Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            </Field>
          )}
          <Field label="First name" required error={errors.firstName}><Input name="firstName" defaultValue={s("firstName")} /></Field>
          <Field label="Last name" required error={errors.lastName}><Input name="lastName" defaultValue={s("lastName")} /></Field>
          <Field label="Title"><Input name="title" defaultValue={s("title")} placeholder="e.g. Head - IT Infrastructure" /></Field>
          <Field label="Department"><Input name="department" defaultValue={s("department")} /></Field>
          <Field label="Buying role" required>
            <Select name="role" defaultValue={s("role") ?? "INFLUENCER"}>{Object.entries(CONTACT_ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Email" error={errors.email}><Input name="email" type="email" defaultValue={s("email")} /></Field>
          <Field label="Office phone"><Input name="phone" defaultValue={s("phone")} /></Field>
          <Field label="Mobile"><Input name="mobile" defaultValue={s("mobile")} /></Field>
          <Field label="LinkedIn" className="sm:col-span-2"><Input name="linkedin" defaultValue={s("linkedin")} placeholder="https://linkedin.com/in/…" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={s("notes")} className="min-h-14" /></Field>
          <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2">
            <input type="checkbox" name="isPrimary" defaultChecked={!!v.isPrimary} className="accent-[var(--primary)]" /> Primary contact for the account
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteContactButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      disabled={pending}
      aria-label="Remove contact"
      onClick={() => { if (confirm("Remove this contact? Activity history is kept.")) run(() => deleteContact(id), { success: "Contact removed" }); }}
    >
      <Trash2 />
    </Button>
  );
}
