"use client";
import { useState } from "react";
import { Plus, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/crm/use-action";
import { setOpportunityContacts } from "@/server/actions/opportunities";
import { CONTACT_ROLE_LABEL } from "@/lib/constants";
import { Avatar } from "@/components/crm/badges";

type C = { id: string; firstName: string; lastName: string; title: string | null; email?: string | null; phone?: string | null; mobile?: string | null };

export function ContactsEditor({
  oppId, current, accountContacts, primaryId, canEdit,
}: {
  oppId: string;
  current: { role: string; contact: C }[];
  accountContacts: (C & { role: string })[];
  primaryId: string | null;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState("");
  const { pending, run } = useAction();
  const save = (next: { contactId: string; role: string }[]) => run(() => setOpportunityContacts(oppId, next), { success: "Buying group updated" });
  const list = current.map((c) => ({ contactId: c.contact.id, role: c.role }));
  const available = accountContacts.filter((c) => !current.some((x) => x.contact.id === c.id));
  const roles = new Set(current.map((c) => c.role));
  const missing = (["DECISION_MAKER", "TECHNICAL_EVALUATOR", "PROCUREMENT"] as const).filter((r) => !roles.has(r));

  return (
    <div className="flex flex-col gap-3">
      {missing.length > 0 && (
        <p className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--t-amber-bg)", color: "var(--t-amber)" }}>
          Buying group gap: no {missing.map((m) => CONTACT_ROLE_LABEL[m].toLowerCase()).join(", ")} engaged on this deal.
        </p>
      )}
      <div className="rounded-xl border border-border bg-surface">
        {current.map((c) => (
          <div key={c.contact.id} className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
            <Avatar name={`${c.contact.firstName} ${c.contact.lastName}`} className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                {c.contact.firstName} {c.contact.lastName}
                {c.contact.id === primaryId && <Star className="size-3 fill-current" style={{ color: "var(--warning)" }} aria-label="Primary contact" />}
              </p>
              <p className="text-xs text-ink-3">{c.contact.title} · {c.contact.email} · {c.contact.mobile ?? c.contact.phone}</p>
            </div>
            {canEdit ? (
              <Select
                value={c.role}
                disabled={pending}
                onChange={(e) => save(list.map((x) => (x.contactId === c.contact.id ? { ...x, role: e.target.value } : x)))}
                className="h-7 w-44 text-xs"
              >
                {Object.entries(CONTACT_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            ) : (
              <Badge>{CONTACT_ROLE_LABEL[c.role as keyof typeof CONTACT_ROLE_LABEL]}</Badge>
            )}
            {canEdit && (
              <Button size="icon-sm" variant="ghost" disabled={pending} onClick={() => save(list.filter((x) => x.contactId !== c.contact.id))} aria-label="Remove contact">
                <X />
              </Button>
            )}
          </div>
        ))}
        {current.length === 0 && <p className="px-3 py-6 text-center text-xs text-ink-3">No contacts engaged on this deal.</p>}
      </div>
      {canEdit && available.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={adding} onChange={(e) => setAdding(e.target.value)} className="w-72">
            <option value="">Add a contact from the account…</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.title}</option>)}
          </Select>
          <Button
            disabled={!adding || pending}
            onClick={() => {
              const c = available.find((x) => x.id === adding)!;
              save([...list, { contactId: c.id, role: c.role }]);
              setAdding("");
            }}
          >
            <Plus /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
