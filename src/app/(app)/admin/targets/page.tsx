import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { listTargets } from "@/server/services/users";
import { salesPeopleFor } from "@/server/services/people";
import { can } from "@/domain/permissions";
import { fiscalYearOf, fyLabel } from "@/domain/fiscal";
import { PageHeader } from "@/components/crm/page-header";
import { TargetsGrid } from "./targets-grid";

export const metadata: Metadata = { title: "Targets" };

export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const actor = await requireActor();
  if (!can(actor.role, "targets.view")) redirect("/");
  const { fy } = await searchParams;
  const current = fiscalYearOf(new Date());
  const fiscalYear = fy && /^\d{4}$/.test(fy) ? Number(fy) : current;
  const [targets, people] = await Promise.all([listTargets(actor, fiscalYear), salesPeopleFor(actor)]);
  const reps = people.filter((p) => p.role === "SALES");
  return (
    <>
      <PageHeader title="Sales targets" description={`Quarterly targets per sales person for ${fyLabel(fiscalYear)} (April to March). Home and reviews compare won value against them.`} />
      <TargetsGrid fiscalYear={fiscalYear} years={[current - 1, current, current + 1]} people={reps} rows={targets.rows} canEdit={can(actor.role, "targets.set")} />
    </>
  );
}
