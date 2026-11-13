import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { getAccount } from "@/server/services/accounts";
import { NotFound } from "@/server/errors";
import { PageHeader } from "@/components/crm/page-header";
import { StagePill, ForecastPill, NeutralPill } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { EmptyState } from "@/components/crm/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountActions } from "./account-actions";
import { ContactsPanel } from "./contacts-panel";
import { fmtDate } from "@/lib/format";
import { can } from "@/domain/permissions";
import type { Stage } from "@/domain/stages";
import { RecordCode } from "@/components/crm/code";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const { tab } = await searchParams;
  let a: Awaited<ReturnType<typeof getAccount>>;
  try {
    a = await getAccount(actor, id);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  const facts = [a.industry?.name, a.segment?.name, [a.city, a.state].filter(Boolean).join(", ")].filter(Boolean);
  return (
    <>
      <PageHeader
        title={a.name}
        crumbs={[{ href: "/accounts", label: "Accounts" }]}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><RecordCode>{a.code}</RecordCode>{facts.map((f) => <span key={String(f)}>{f}</span>)}<span>Owner: {a.owner.fullName}</span>{a.gstin && <RecordCode>GSTIN {a.gstin}</RecordCode>}</span>}
        meta={a.deletedAt ? <NeutralPill className="bg-destructive/10 text-destructive">Deleted {fmtDate(a.deletedAt)}</NeutralPill> : null}
        actions={
          <>
            {a.canEdit && (
              <Button asChild variant="outline" size="sm"><Link href={`/accounts/${a.id}/edit`}><Pencil /> Edit</Link></Button>
            )}
            <AccountActions id={a.id} name={a.name} openDeals={a.deals.filter((d) => !["CLOSED_WON", "CLOSED_LOST", "DROPPED"].includes(d.stage)).length} canDelete={can(actor.role, "accounts.delete") && !a.deletedAt} canRestore={can(actor.role, "records.restore") && !!a.deletedAt} />
          </>
        }
      />
      {(a.website || a.phone || a.addressLine || a.notes) && (
        <div className="mb-5 grid gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-card sm:grid-cols-3">
          {a.website && <div><div className="text-xs text-muted-foreground">Website</div><a href={a.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">{a.website.replace(/^https?:\/\//, "")}</a></div>}
          {a.phone && <div><div className="text-xs text-muted-foreground">Phone</div>{a.phone}</div>}
          {a.addressLine && <div><div className="text-xs text-muted-foreground">Address</div>{[a.addressLine, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</div>}
          {a.notes && <div className="sm:col-span-3"><div className="text-xs text-muted-foreground">Notes</div><p className="whitespace-pre-line">{a.notes}</p></div>}
        </div>
      )}
      <Tabs defaultValue={tab === "deals" ? "deals" : "contacts"}>
        <TabsList>
          <TabsTrigger value="contacts">Contacts <span className="ml-1 text-muted-foreground">{a.contacts.length}</span></TabsTrigger>
          <TabsTrigger value="deals">Deals <span className="ml-1 text-muted-foreground">{a.deals.length}</span></TabsTrigger>
        </TabsList>
        <TabsContent value="contacts" className="mt-4">
          <ContactsPanel accountId={a.id} contacts={a.contacts} canEdit={a.canEdit} />
        </TabsContent>
        <TabsContent value="deals" className="mt-4">
          {a.deals.length === 0 ? (
            <EmptyState title="No deals yet" description="Deals at this account will show here." action={a.canEdit && can(actor.role, "deals.create") ? <Button asChild size="sm"><Link href={`/deals/new?account=${a.id}`}>New deal</Link></Button> : undefined} />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {a.deals.map((d) => (
                <Link key={d.id} href={`/deals/${d.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                  <RecordCode className="w-28 shrink-0">{d.code}</RecordCode>
                  <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.owner.fullName}</span>
                  <StagePill stage={d.stage as Stage} />
                  {d.forecastCategory && <ForecastPill forecast={d.forecastCategory} />}
                  {d.dealValue !== null && <Money value={d.dealValue} className="w-24 text-right" />}
                  <span className="w-16 text-right text-xs text-muted-foreground">{fmtDate(d.expectedCloseDate)}</span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
