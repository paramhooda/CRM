"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { ContactDialog } from "@/components/crm/contact-dialog";
import { api, errorMessage } from "@/client/api";

type Contact = { id: string; firstName: string; lastName: string; designation: string | null };

/** Picks the customer contact from the account's people, or adds a new one and uses it straight away. */
export function SetContactDialog({ dealId, version, account, current, onClose }: { dealId: string; version: number; account: { id: string; name: string }; current: string | null; onClose: () => void }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [value, setValue] = useState<string | null>(current);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    api.get<{ rows: Contact[] }>(`/contacts?account_id=${account.id}&pageSize=100`).then((r) => setContacts(r.rows)).catch((e) => setError(errorMessage(e)));
  }, [account.id]);
  const save = async (contactId: string | null) => {
    if (!contactId) return setError("Pick a contact, or add one.");
    setPending(true);
    try {
      await api.patch(`/deals/${dealId}`, { version, primaryContactId: contactId });
      toast.success("Customer contact set");
      onClose();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <Dialog open={!adding} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer contact</DialogTitle>
            <DialogDescription>The person at {account.name} this deal is with. Needed before the deal leaves Qualified.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(value); }}>
            <Field label="Contact" htmlFor="sc-contact" required hint={contacts && contacts.length === 0 ? "No contacts at this account yet. Add one below." : undefined}>
              <OptionSelect id="sc-contact" value={value} onChange={(v) => { setValue(v); setError(null); }} options={(contacts ?? []).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}${c.designation ? ` · ${c.designation}` : ""}` }))} placeholder={contacts ? "Pick a contact" : "Loading…"} disabled={!contacts} />
            </Field>
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}><Plus /> New contact</Button>
            <FormError message={error} />
            <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending || !contacts}>Use this contact</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {adding && <ContactDialog open onOpenChange={(o) => !o && setAdding(false)} accountId={account.id} accountName={account.name} initial={{ isPrimary: !contacts?.length }} onSaved={(c) => save(c.id)} />}
    </>
  );
}
