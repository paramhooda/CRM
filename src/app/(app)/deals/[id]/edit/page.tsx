import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { getDeal } from "@/server/services/deals";
import { getAccount } from "@/server/services/accounts";
import { salesPeopleFor } from "@/server/services/people";
import { NotFound } from "@/server/errors";
import { PageHeader } from "@/components/crm/page-header";
import { DealForm } from "../../deal-form";
import { isoDay } from "@/lib/format";

export const metadata: Metadata = { title: "Edit deal" };

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let d: Awaited<ReturnType<typeof getDeal>>;
  try {
    d = await getDeal(actor, id);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  if (!d.canEdit) redirect(`/deals/${id}`);
  const [owners, account] = await Promise.all([salesPeopleFor(actor), getAccount(actor, d.account.id).catch(() => null)]);
  return (
    <>
      <PageHeader title={`Edit ${d.name}`} crumbs={[{ href: "/deals", label: "Deals" }, { href: `/deals/${d.id}`, label: d.code }]} description="Lines, stage and owner are changed on the deal page." />
      <DealForm
        dealId={d.id}
        version={d.version}
        owners={owners}
        accountName={d.account.name}
        contacts={account?.contacts ?? []}
        initial={{ name: d.name, accountId: d.account.id, primaryContactId: d.primaryContact?.id ?? null, expectedCloseDate: isoDay(d.expectedCloseDate), forecastCategory: d.forecastCategory ?? "PIPELINE", needsPresales: d.needsPresales, leadSourceId: d.leadSource?.id ?? null, description: d.description ?? "", nextStep: d.nextStep ?? "", nextStepDate: isoDay(d.nextStepDate) }}
      />
    </>
  );
}
