import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { salesPeopleFor } from "@/server/services/people";
import { getAccount } from "@/server/services/accounts";
import { NotFound } from "@/server/errors";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { DealForm } from "../deal-form";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const actor = await requireActor();
  if (!can(actor.role, "deals.create")) redirect("/deals");
  const { account } = await searchParams;
  const owners = await salesPeopleFor(actor);
  let preset: { id: string; name: string; contacts: { id: string; firstName: string; lastName: string; designation: string | null }[] } | null = null;
  if (account) {
    try {
      const a = await getAccount(actor, account);
      preset = { id: a.id, name: a.name, contacts: a.contacts };
    } catch (e) {
      if (!(e instanceof NotFound)) throw e;
    }
  }
  return (
    <>
      <PageHeader title="New deal" crumbs={[{ href: "/deals", label: "Deals" }]} description={preset ? `At ${preset.name}` : "Starts in Qualified."} />
      <DealForm owners={owners} initial={preset ? { accountId: preset.id, primaryContactId: preset.contacts.find((c) => "isPrimary" in c && (c as { isPrimary?: boolean }).isPrimary)?.id ?? null } : undefined} contacts={preset?.contacts} />
    </>
  );
}
