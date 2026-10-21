import { requireUser } from "@/lib/auth";
import { can, isManager } from "@/lib/authz";
import { redirect } from "next/navigation";
import { getOptions } from "@/server/queries/options";
import { accountOptions } from "@/server/queries/accounts-lite";
import { PageHeader, PageBody } from "@/components/crm/page";
import { OppForm } from "@/components/opportunities/opp-form";
import { emptyOppValues } from "@/lib/opp-defaults";

export const metadata = { title: "New opportunity" };

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const user = await requireUser();
  if (!can.createOpportunity(user)) redirect("/opportunities");
  const { account } = await searchParams;
  const [options, accounts] = await Promise.all([getOptions(), accountOptions(user)]);
  const initial = emptyOppValues(user.id, account);
  const acc = accounts.find((a) => a.id === account);
  if (acc) {
    initial.accountType = acc.accountType;
    initial.primaryContactId = acc.contacts[0]?.id ?? "";
  }
  return (
    <>
      <PageHeader crumbs={[{ href: "/opportunities", label: "Opportunities" }]} title="New opportunity" description="Required fields are marked. You can pull in presales from the deal once it is created." />
      <PageBody className="max-w-5xl">
        <OppForm mode="create" initial={initial} accounts={accounts} options={options} canReassign={isManager(user)} currentUserId={user.id} />
      </PageBody>
    </>
  );
}
