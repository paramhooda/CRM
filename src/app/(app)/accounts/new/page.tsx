import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { salesPeopleFor } from "@/server/services/people";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { AccountForm } from "../account-form";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage() {
  const actor = await requireActor();
  if (!can(actor.role, "accounts.write")) redirect("/accounts");
  const owners = await salesPeopleFor(actor);
  return (
    <>
      <PageHeader title="New account" crumbs={[{ href: "/accounts", label: "Accounts" }]} />
      <AccountForm owners={owners} />
    </>
  );
}
