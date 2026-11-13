"use client";
import { useState } from "react";
import { Mail, Phone, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/crm/states";
import { ContactDialog, type ContactValues } from "@/components/crm/contact-dialog";

type Contact = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; mobile: string | null; designation: string | null; department: string | null; isPrimary: boolean };

export function ContactsPanel({ accountId, contacts, canEdit }: { accountId: string; contacts: Contact[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const initial = (c: Contact): Partial<ContactValues> => ({ firstName: c.firstName, lastName: c.lastName, email: c.email ?? "", phone: c.phone ?? "", mobile: c.mobile ?? "", designation: c.designation ?? "", department: c.department ?? "", isPrimary: c.isPrimary });
  return (
    <>
      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" description="Add the people you deal with at this account." action={canEdit ? <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add contact</Button> : undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          {canEdit && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus /> Add contact</Button></div>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {contacts.map((c) => (
              <button key={c.id} type="button" onClick={() => canEdit && setEditing(c)} className="rounded-xl border border-border bg-card p-4 text-left shadow-card transition-colors hover:border-border-strong disabled:cursor-default" disabled={!canEdit} aria-label={`${c.firstName} ${c.lastName}`}>
                <div className="flex items-center gap-2 font-medium">{c.firstName} {c.lastName}{c.isPrimary && <Star className="size-3.5 fill-warning text-warning" aria-label="Primary contact" />}</div>
                <div className="text-xs text-muted-foreground">{[c.designation, c.department].filter(Boolean).join(" · ") || "—"}</div>
                <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  {c.email && <span className="flex items-center gap-1.5"><Mail className="size-3" />{c.email}</span>}
                  {(c.phone || c.mobile) && <span className="flex items-center gap-1.5"><Phone className="size-3" />{c.mobile ?? c.phone}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <ContactDialog key={editing === "new" ? "new" : editing?.id ?? "closed"} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} accountId={accountId} contactId={editing && editing !== "new" ? editing.id : undefined} initial={editing && editing !== "new" ? initial(editing) : undefined} canDelete />
    </>
  );
}
