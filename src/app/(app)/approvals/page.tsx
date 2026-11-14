import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { myApprovals } from "@/server/services/approvals";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { StatusPill } from "@/components/crm/pills";
import { Money, Pct } from "@/components/crm/money";
import { EmptyState } from "@/components/crm/states";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar, Tab, TabCount } from "@/components/crm/tabs";
import { DecideButtons } from "./decide-buttons";
import { fmtDate } from "@/lib/format";
import { RecordCode } from "@/components/crm/code";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor();
  if (!can(actor.role, "approvals.decide")) redirect("/");
  const { tab } = await searchParams;
  const [pending, decided] = await Promise.all([myApprovals(actor, "PENDING"), myApprovals(actor, "DECIDED")]);
  const row = (a: (typeof pending.rows)[number], mine: boolean) => (
    <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={`/deals/${a.deal.id}`} className="font-medium hover:text-link">{a.deal.name}</Link>
        <div className="text-xs text-muted-foreground"><RecordCode>{a.deal.code}</RecordCode> · {a.deal.account.name} · {a.deal.owner.fullName} · asked by {a.requestedBy.fullName} on {fmtDate(a.requestedAt)}</div>
        <ul className="mt-1 text-xs text-muted-foreground">{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
      <div className="text-right text-sm"><Money value={a.dealValue} className="font-medium" /><div className="text-xs text-muted-foreground">GM <Pct value={a.gmPct} /></div></div>
      <StatusPill status={a.status} dot />
      {mine && <DecideButtons id={a.id} />}
    </li>
  );
  return (
    <>
      <PageHeader title="Approvals" description="Price approvals waiting on you, and the ones you have decided." />
      <Tabs defaultValue={tab === "decided" ? "decided" : "pending"}>
        <TabBar>
          <Tab value="pending">Waiting on me <TabCount>{pending.rows.length}</TabCount></Tab>
          <Tab value="decided">Decided <TabCount>{decided.rows.length}</TabCount></Tab>
        </TabBar>
        <TabsContent value="pending" className="mt-4">
          {pending.rows.length === 0 ? <EmptyState title="Nothing waiting on you" description="Approvals land here when a deal's prices match a rule that names you." /> : <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">{pending.rows.map((a) => row(a, true))}</ul>}
        </TabsContent>
        <TabsContent value="decided" className="mt-4">
          {decided.rows.length === 0 ? <EmptyState title="No decisions yet" /> : <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">{decided.rows.map((a) => row(a, false))}</ul>}
        </TabsContent>
      </Tabs>
    </>
  );
}
