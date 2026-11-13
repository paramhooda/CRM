import type { Metadata } from "next";
import { requireActor } from "@/server/auth/actor";
import { listContacts } from "@/server/services/contacts";
import { pagination } from "@/server/http";
import { contactListQuery } from "@/contracts/accounts";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { ExportButton } from "@/components/crm/export-button";
import { FilterBar } from "@/components/crm/filter-bar";
import { ContactsList } from "./contacts-list";
import { parseListQuery, type Query } from "@/lib/url-state";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor();
  const q = await searchParams;
  const query = parseListQuery(contactListQuery.extend(pagination.shape), q);
  const result = await listContacts(actor, { q: query.q, accountId: query.account_id, includeDeleted: query.includeDeleted }, query);
  return (
    <>
      <PageHeader title="Contacts" description="People at customers and prospects." actions={<ExportButton entity="contacts" />} />
      <FilterBar filters={actor.role === "ADMIN" ? [{ key: "includeDeleted", label: "Deleted", options: [{ value: "true", label: "Include deleted" }] }] : []} search={{ placeholder: "Search name, email, account…" }} />
      <ContactsList rows={result.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), deletedAt: r.deletedAt?.toISOString() ?? null }))} query={q} total={result.total} page={result.page} pages={result.pages} canAdd={can(actor.role, "accounts.write")} />
    </>
  );
}
