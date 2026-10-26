import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can, isManager, opportunityScope } from "@/lib/authz";
import { db } from "@/lib/db";
import { getOptions } from "@/server/queries/options";
import { accountOptions } from "@/server/queries/accounts-lite";
import { PageHeader, PageBody } from "@/components/crm/page";
import { OppForm, type OppFormValues } from "@/components/opportunities/opp-form";
import { isoDate, toNumber } from "@/lib/format";

export const metadata = { title: "Edit opportunity" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const o = await db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] } });
  if (!o) notFound();
  if (!can.editOpportunity(user, o)) redirect(`/opportunities/${id}`);
  // Closed deals are read-only except for corrections by a sales manager
  if (["WON", "LOST", "DROPPED"].includes(o.stage) && !isManager(user)) redirect(`/opportunities/${id}`);
  const [options, accounts, lineCount] = await Promise.all([getOptions(), accountOptions(user), db.opportunityLineItem.count({ where: { opportunityId: id } })]);
  if (!accounts.some((a) => a.id === o.accountId)) {
    const a = await db.account.findUniqueOrThrow({ where: { id: o.accountId }, include: { contacts: { where: { deletedAt: null } } } });
    accounts.push({ id: a.id, name: a.name, accountType: a.accountType, contacts: a.contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, title: c.title })) });
  }
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const n = (v: unknown) => (v === null || v === undefined ? "" : String(toNumber(v)));
  const initial: OppFormValues = {
    name: o.name, accountId: o.accountId, primaryContactId: s(o.primaryContactId), businessUnitId: o.businessUnitId,
    categoryId: o.categoryId, oemId: s(o.oemId), accountType: o.accountType, revenueModel: o.revenueModel, dealType: o.dealType,
    procurementMode: o.procurementMode, amount: n(o.amount), arrAmount: n(o.arrAmount), contractTermMonths: s(o.contractTermMonths),
    contractStartDate: isoDate(o.contractStartDate), expectedMarginPct: n(o.expectedMarginPct), stage: o.stage,
    probability: String(o.probability), forecastCategory: o.forecastCategory, expectedCloseDate: isoDate(o.expectedCloseDate),
    salesOwnerId: o.salesOwnerId, presalesOwnerId: s(o.presalesOwnerId), leadSource: s(o.leadSource), competitors: s(o.competitors),
    nextStep: s(o.nextStep), nextStepDate: isoDate(o.nextStepDate), submissionDueDate: isoDate(o.submissionDueDate),
    dealRegStatus: o.dealRegStatus, dealRegNumber: s(o.dealRegNumber), dealRegExpiry: isoDate(o.dealRegExpiry),
    lossReason: s(o.lossReason), lossNotes: s(o.lossNotes), poNumber: s(o.poNumber), poDate: isoDate(o.poDate),
    description: s(o.description),
  };
  return (
    <>
      <PageHeader crumbs={[{ href: "/opportunities", label: "Opportunities" }, { href: `/opportunities/${id}`, label: o.code }]} title={`Edit ${o.name}`} />
      <PageBody className="max-w-5xl">
        <OppForm mode="edit" id={id} initial={initial} accounts={accounts} options={options} canReassign={isManager(user)} currentUserId={user.id} existingLineCount={lineCount} />
      </PageBody>
    </>
  );
}
