import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { getAccount } from "@/server/services/accounts";
import { salesPeopleFor } from "@/server/services/people";
import { NotFound } from "@/server/errors";
import { PageHeader } from "@/components/crm/page-header";
import { AccountForm } from "../../account-form";

export const metadata: Metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let a: Awaited<ReturnType<typeof getAccount>>;
  try {
    a = await getAccount(actor, id);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  if (!a.canEdit) redirect(`/accounts/${id}`);
  const owners = await salesPeopleFor(actor);
  return (
    <>
      <PageHeader title={`Edit ${a.name}`} crumbs={[{ href: "/accounts", label: "Accounts" }, { href: `/accounts/${a.id}`, label: a.name }]} />
      <AccountForm accountId={a.id} owners={owners} initial={{ name: a.name, gstin: a.gstin ?? "", industryId: a.industry?.id ?? null, segmentId: a.segment?.id ?? null, website: a.website ?? "", phone: a.phone ?? "", addressLine: a.addressLine ?? "", city: a.city ?? "", state: a.state ?? "", pincode: a.pincode ?? "", ownerId: a.owner.id, notes: a.notes ?? "" }} />
    </>
  );
}
