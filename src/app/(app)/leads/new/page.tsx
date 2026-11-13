import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { salesPeopleFor } from "@/server/services/people";
import { can } from "@/domain/permissions";
import { PageHeader } from "@/components/crm/page-header";
import { LeadForm } from "../lead-form";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const actor = await requireActor();
  if (!can(actor.role, "leads.write")) redirect("/");
  const owners = await salesPeopleFor(actor);
  return (
    <>
      <PageHeader title="New lead" crumbs={[{ href: "/leads", label: "Leads" }]} />
      <LeadForm owners={owners} />
    </>
  );
}
