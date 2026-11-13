import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { listAccounts, type AccountListRow } from "@/server/services/accounts";
import { salesPeopleFor } from "@/server/services/people";
import { pagination } from "@/server/http";
import { accountListQuery } from "@/contracts/accounts";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { DataTable, type Column } from "@/components/crm/data-table";
import { ExportButton } from "@/components/crm/export-button";
import { Button } from "@/components/ui/button";
import { AccountFilters } from "./account-filters";
import { fmtDate } from "@/lib/format";
import { parseListQuery, type Query } from "@/lib/url-state";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor();
  const q = await searchParams;
  const query = parseListQuery(accountListQuery.extend(pagination.shape), q);
  const [result, owners] = await Promise.all([listAccounts(actor, { q: query.q, industryId: query.industry, segmentId: query.segment, ownerId: query.owner, includeDeleted: query.includeDeleted }, query), salesPeopleFor(actor)]);
  const columns: Column<AccountListRow>[] = [
    { key: "name", header: "Account", sort: "name", cell: (r) => <span>{r.name}{r.deletedAt && <span className="ml-2 text-xs text-destructive">(deleted)</span>}</span> },
    { key: "code", header: "Code", sort: "code", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.code}</span>, hideBelow: "md" },
    { key: "industry", header: "Industry", cell: (r) => r.industry?.name ?? "—", hideBelow: "lg" },
    { key: "segment", header: "Segment", cell: (r) => r.segment?.name ?? "—", hideBelow: "lg" },
    { key: "city", header: "City", sort: "city", cell: (r) => r.city ?? "—", hideBelow: "md" },
    { key: "owner", header: "Owner", sort: "owner", cell: (r) => r.owner.fullName },
    { key: "contacts", header: "Contacts", align: "right", cell: (r) => r._count.contacts, hideBelow: "sm" },
    { key: "deals", header: "Open deals", align: "right", cell: (r) => r._count.deals },
    { key: "updated", header: "Updated", sort: "updatedAt", cell: (r) => fmtDate(r.updatedAt), hideBelow: "lg" },
  ];
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Customers and prospects."
        actions={
          <>
            <ExportButton entity="accounts" />
            {can(actor.role, "accounts.write") && (
              <Button asChild size="sm"><Link href="/accounts/new"><Plus /> New account</Link></Button>
            )}
          </>
        }
      />
      <AccountFilters owners={owners} showDeleted={actor.role === "ADMIN"} />
      <DataTable columns={columns} rows={result.rows} query={q} pathname="/accounts" total={result.total} page={result.page} pages={result.pages} rowHref={(r) => `/accounts/${r.id}`} empty={{ title: "No accounts match", description: "Try different filters, or add the first account.", action: can(actor.role, "accounts.write") ? <Button asChild size="sm"><Link href="/accounts/new"><Plus /> New account</Link></Button> : undefined }} />
    </>
  );
}
