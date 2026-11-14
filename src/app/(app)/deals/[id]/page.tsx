import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { dealHistory, getDeal } from "@/server/services/deals";
import { listDealApprovals } from "@/server/services/approvals";
import { peopleWithRole, salesPeopleFor } from "@/server/services/people";
import { NotFound } from "@/server/errors";
import { isSupportRole, isManagerRole } from "@/domain/scope";
import { PageHeader } from "@/components/crm/page-header";
import { StagePill, ForecastPill, NeutralPill } from "@/components/crm/pills";
import { Money, Pct } from "@/components/crm/money";
import { TabsContent } from "@/components/ui/tabs";
import { DealTabs } from "./deal-tabs";
import { NextPanel } from "./next-panel";
import { DealBrief } from "./deal-brief";
import { TabBar, Tab, TabCount } from "@/components/crm/tabs";
import { StatTile } from "@/components/crm/stat-tile";
import { CalendarDays, IndianRupee, Layers, Percent } from "lucide-react";
import { StagePath } from "./stage-path";
import { StageActions } from "./stage-actions";
import { DealMenu } from "./deal-menu";
import { LinesPanel } from "./lines-panel";
import { RequestCards } from "./request-cards";
import { ApprovalCard } from "./approval-card";
import { DocumentsPanel } from "./documents-panel";
import { HistoryPanel } from "./history-panel";
import { fmtDate, relativeDays } from "@/lib/format";
import { RecordCode } from "@/components/crm/code";

export const metadata: Metadata = { title: "Deal" };

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const { tab } = await searchParams;
  let d: Awaited<ReturnType<typeof getDeal>>;
  try {
    d = await getDeal(actor, id);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  const sales = !isSupportRole(actor.role);
  const manager = isManagerRole(actor.role);
  const [history, approvals, presalesPeople, purchasePeople, owners] = await Promise.all([
    dealHistory(actor, id),
    sales ? listDealApprovals(actor, id).then((r) => r.rows) : Promise.resolve([]),
    peopleWithRole("PRESALES"),
    peopleWithRole("PURCHASE"),
    manager ? salesPeopleFor(actor) : Promise.resolve([]),
  ]);
  const facts = sales
    ? [
        { label: "Value", value: <Money value={d.dealValue} />, sub: Number(d.annualRecurringValue) > 0 ? <>ARR <Money value={d.annualRecurringValue} /></> : null },
        { label: "Expected GM", value: <Pct value={d.expectedGmPct} />, sub: d.totalCost ? <>Cost <Money value={d.totalCost} /></> : "Costs pending" },
        { label: "Close date", value: fmtDate(d.expectedCloseDate), sub: relativeDays(d.expectedCloseDate), warn: d.facts.closeDatePast && d.facts.stage !== "CLOSED_WON" && d.facts.stage !== "CLOSED_LOST" && d.facts.stage !== "DROPPED" },
      ]
    : [
        { label: "Lines", value: d.lines.length, sub: `${d.lines.filter((l) => l.unitPurchaseCost !== null).length} costed` },
        { label: "Cost", value: <Money value={d.lines.reduce((s, l) => s + Number(l.lineCost ?? 0), 0)} />, sub: d.facts.uncostedThirdPartyLines > 0 ? `${d.facts.uncostedThirdPartyLines} third-party line${d.facts.uncostedThirdPartyLines === 1 ? "" : "s"} to cost` : "All third-party lines costed", warn: d.facts.uncostedThirdPartyLines > 0 && d.facts.openPricingRequest },
        { label: "Close date", value: fmtDate(d.expectedCloseDate), sub: relativeDays(d.expectedCloseDate) },
      ];
  const closed = ["CLOSED_WON", "CLOSED_LOST", "DROPPED"].includes(d.stage);
  const overviewRows: [string, React.ReactNode][] = [
    ["Account", <Link key="a" href={`/accounts/${d.account.id}`} className="text-primary hover:underline">{d.account.name}</Link>],
    ["Customer contact", d.primaryContact ? `${d.primaryContact.firstName} ${d.primaryContact.lastName}${d.primaryContact.designation ? ` · ${d.primaryContact.designation}` : ""}` : <span className="text-warning">Not set</span>],
    ["Owner", d.owner.fullName],
    ["Presales owner", d.presalesOwner?.fullName ?? "—"],
    ["Primary BU", d.primaryBusinessUnit?.name ?? "—"],
    ["Primary OEM", d.primaryOem?.name ?? "—"],
    ["Lead source", d.leadSource?.name ?? "—"],
    ["Needs presales", d.needsPresales ? "Yes (BOQ stage)" : "No"],
    ["Created", fmtDate(d.createdAt, "long")],
    ["Last updated", fmtDate(d.updatedAt, "long")],
  ];
  if (d.stage === "HOLD" && d.holdReason) overviewRows.push(["Hold reason", d.holdReason]);
  if (d.stage === "CLOSED_LOST" || d.stage === "DROPPED") overviewRows.push(["Reason", `${d.lossReason?.name ?? "—"}${d.lossNotes ? ` · ${d.lossNotes}` : ""}`]);
  if (d.stage === "CLOSED_WON") overviewRows.push(["PO number", d.poNumber ?? "—"]);
  if (closed && d.closedAt) overviewRows.push(["Closed", fmtDate(d.closedAt, "long")]);

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><RecordCode className="text-sm">{d.code}</RecordCode>{d.name}</span>}
        crumbs={[{ href: "/deals", label: "Deals" }]}
        description={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><Link href={`/accounts/${d.account.id}`} className="hover:text-foreground">{d.account.name}</Link><span>Owner: {d.owner.fullName}</span>{d.presalesOwner && <span>Presales: {d.presalesOwner.fullName}</span>}</span>}
        meta={<><StagePill stage={d.stage} dot /><span className="text-sm text-muted-foreground">{d.daysInStage}d in stage</span>{sales && d.forecastCategory && <ForecastPill forecast={d.forecastCategory} dot />}{d.deletedAt && <NeutralPill className="bg-destructive/10 text-destructive">Deleted {fmtDate(d.deletedAt)}</NeutralPill>}</>}
        actions={
          <>
            {sales && <DealBrief dealId={d.id} />}
            {sales && <StageActions dealId={d.id} version={d.version} moves={d.moves} presalesPeople={presalesPeople} hasPoDocument={d.facts.hasPoDocument} />}
            <DealMenu deal={{ id: d.id, name: d.name, version: d.version, ownerId: d.owner.id, presalesOwnerId: d.presalesOwner?.id ?? null, deleted: !!d.deletedAt, canEdit: d.canEdit, stage: d.stage }} owners={owners} presalesPeople={presalesPeople} />
          </>
        }
      />
      <section className="mb-6 grid gap-4 sm:grid-cols-3" aria-label="Key facts">
        {facts.map((f, i) => (
          <StatTile key={f.label} label={f.label} value={f.value} note={f.sub} icon={[sales ? IndianRupee : Layers, sales ? Percent : IndianRupee, CalendarDays][i]} iconTone={"warn" in f && f.warn ? "red" : (["blue", "green", "amber"] as const)[i]} tone={"warn" in f && f.warn ? "red" : "default"} />
        ))}
      </section>
      <StagePath stage={d.stage} needsPresales={d.needsPresales} heldFromStage={d.heldFromStage} lastOpenStage={d.lastOpenStage} />
      <div className="mt-4">
        <NextPanel deal={{ id: d.id, version: d.version, stage: d.stage, moves: d.moves, facts: d.facts, requestAbility: d.requestAbility, presalesRequests: d.presalesRequests, pricingRequests: d.pricingRequests, account: d.account, primaryContactId: d.primaryContactId, nextStep: d.nextStep, nextStepDate: d.nextStepDate, canEdit: d.canEdit }} next={d.next} presalesPeople={presalesPeople} purchasePeople={purchasePeople} sales={sales} />
      </div>

      <DealTabs tab={["lines", "documents", "history"].includes(tab ?? "") ? tab! : "overview"}>
        <TabBar>
          <Tab value="overview">Overview</Tab>
          <Tab value="lines">Lines <TabCount>{d.lines.length}</TabCount></Tab>
          <Tab value="documents">Documents <TabCount>{d.documents.length}</TabCount></Tab>
          <Tab value="history">History</Tab>
        </TabBar>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm shadow-card">
              {overviewRows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate">{v}</dd>
                </div>
              ))}
            </dl>
            {d.description && <div className="rounded-xl border border-border bg-card p-4 text-sm"><div className="mb-1 text-xs text-muted-foreground">Description</div><p className="whitespace-pre-line">{d.description}</p></div>}
          </div>
          <div className="flex flex-col gap-4">
            {sales && (!closed || d.approvalState === "APPROVED" || d.approvalState === "PENDING") && <ApprovalCard dealId={d.id} stage={d.stage} state={d.approvalState} reasons={d.approvalReasons} approvals={approvals} canEdit={d.canEdit} />}
            <RequestCards dealId={d.id} canEdit={d.canEdit} presales={d.presalesRequests} pricing={d.pricingRequests} presalesPeople={presalesPeople} purchasePeople={purchasePeople} ability={d.requestAbility} facts={d.facts} />
          </div>
        </TabsContent>

        <TabsContent value="lines" className="mt-4">
          <LinesPanel dealId={d.id} version={d.version} lines={d.lines} sales={sales} lineEditable={d.lineEditable} totals={sales ? { value: d.dealValue, cost: d.totalCost, gm: d.expectedGmPct, arr: d.annualRecurringValue } : undefined} open={!closed} />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsPanel dealId={d.id} documents={d.documents} canUpload={d.canUpload} sales={sales} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryPanel stages={history.stages} audit={history.audit} sales={sales} />
        </TabsContent>
      </DealTabs>
    </>
  );
}
