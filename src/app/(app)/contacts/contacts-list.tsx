"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/crm/data-table";
import { ContactDialog } from "@/components/crm/contact-dialog";
import { fmtDate } from "@/lib/format";
import type { Query } from "@/lib/url-state";

type Row = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; mobile: string | null; designation: string | null; department: string | null; isPrimary: boolean; updatedAt: string; deletedAt: string | null; account: { id: string; code: string; name: string } };

export function ContactsList({ rows, query, total, page, pages, canAdd }: { rows: Row[]; query: Query; total: number; page: number; pages: number; canAdd: boolean }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const columns: Column<Row>[] = [
    { key: "name", header: "Name", sort: "name", cell: (r) => <button type="button" className="text-left font-medium hover:text-link" onClick={() => setEditing(r)}>{r.firstName} {r.lastName}{r.isPrimary && <span className="ml-1 text-xs text-muted-foreground">(primary)</span>}{r.deletedAt && <span className="ml-2 text-xs text-destructive">(deleted)</span>}</button> },
    { key: "account", header: "Account", sort: "account", cell: (r) => <Link href={`/accounts/${r.account.id}`} className="hover:text-link">{r.account.name}</Link> },
    { key: "designation", header: "Designation", cell: (r) => r.designation ?? "—", hideBelow: "md" },
    { key: "email", header: "Email", cell: (r) => r.email ?? "—", hideBelow: "md" },
    { key: "phone", header: "Phone", cell: (r) => r.mobile ?? r.phone ?? "—", hideBelow: "lg" },
    { key: "updated", header: "Updated", sort: "updatedAt", cell: (r) => fmtDate(r.updatedAt), hideBelow: "lg" },
  ];
  return (
    <>
      {canAdd && <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setEditing("new")}><Plus /> New contact</Button></div>}
      <DataTable columns={columns} rows={rows} query={query} pathname="/contacts" total={total} page={page} pages={pages} empty={{ title: "No contacts match", description: "Contacts are added on an account, or with the New contact button." }} />
      <ContactDialog
        key={editing === "new" ? "new" : editing?.id ?? "closed"}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        contactId={editing && editing !== "new" ? editing.id : undefined}
        accountId={editing && editing !== "new" ? editing.account.id : undefined}
        accountName={editing && editing !== "new" ? editing.account.name : undefined}
        initial={editing && editing !== "new" ? { firstName: editing.firstName, lastName: editing.lastName, email: editing.email ?? "", phone: editing.phone ?? "", mobile: editing.mobile ?? "", designation: editing.designation ?? "", department: editing.department ?? "", isPrimary: editing.isPrimary } : undefined}
        canDelete
      />
    </>
  );
}
