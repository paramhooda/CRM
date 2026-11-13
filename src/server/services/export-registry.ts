import "server-only";
// Exports for deals, lines, leads and the audit log. Accounts and contacts are built into exports.ts.
import { registerExport, type ExportQuery } from "./exports";
import { csvResponse, fmtDate, stamp } from "../csv";
import type { CsvColumn } from "@/domain/csv";
import { allDeals, dealListWhere, type DealListRow } from "./deals";
import { allLeads, type LeadRow } from "./leads";
import { allAudit, type AuditRow } from "./audit-log";
import { dealListQuery } from "@/contracts/deals";
import { db } from "../db";
import { STAGE_META } from "@/domain/stages";
import { isSupportRole } from "@/domain/scope";

const str = (q: ExportQuery, k: string) => (typeof q[k] === "string" ? (q[k] as string) : undefined);
const bool = (q: ExportQuery, k: string) => str(q, k) === "true";

registerExport("deals", async (actor, q) => {
  const f = dealListQuery.parse(q);
  const rows = await allDeals(actor, f, str(q, "sort"));
  const sales = !isSupportRole(actor.role);
  const cols: CsvColumn<DealListRow>[] = [
    { header: "Code", value: (r) => r.code },
    { header: "Deal", value: (r) => r.name },
    { header: "Account", value: (r) => r.account.name },
    { header: "Owner", value: (r) => r.owner.fullName },
    { header: "Stage", value: (r) => r.stageLabel },
    { header: "Days in stage", value: (r) => r.daysInStage },
    ...(sales
      ? ([
          { header: "Forecast", value: (r) => (r as DealListRow & { forecastCategory?: string }).forecastCategory },
          { header: "Deal value (INR)", value: (r) => (r as DealListRow & { dealValue?: string }).dealValue },
          { header: "ARR (INR)", value: (r) => (r as DealListRow & { annualRecurringValue?: string }).annualRecurringValue },
          { header: "Expected GM %", value: (r) => (r as DealListRow & { expectedGmPct?: string | null }).expectedGmPct },
        ] as CsvColumn<DealListRow>[])
      : []),
    { header: "Primary BU", value: (r) => r.primaryBusinessUnit?.name },
    { header: "Primary OEM", value: (r) => r.primaryOem?.name },
    { header: "Business units", value: (r) => r.businessUnits.map((b) => b.name).join("; ") },
    { header: "Lines", value: (r) => r.lineCount },
    { header: "Needs presales", value: (r) => (r.needsPresales ? "Yes" : "No") },
    { header: "Presales owner", value: (r) => r.presalesOwner?.fullName },
    { header: "Expected close", value: (r) => fmtDate(r.expectedCloseDate) },
    { header: "Next step", value: (r) => r.nextStep },
    { header: "Next step date", value: (r) => fmtDate(r.nextStepDate) },
    { header: "Created", value: (r) => fmtDate(r.createdAt) },
    { header: "Updated", value: (r) => fmtDate(r.updatedAt) },
  ];
  return csvResponse(`deals-${stamp()}.csv`, cols, rows);
});

registerExport("deal-lines", async (actor, q) => {
  const f = dealListQuery.parse(q);
  const where = await dealListWhere(actor, f);
  const sales = !isSupportRole(actor.role);
  const rows = await db.dealLine.findMany({
    where: { deal: where },
    include: { deal: { select: { code: true, name: true, stage: true, account: { select: { name: true } }, owner: { select: { fullName: true } } } }, product: { select: { code: true } }, businessUnit: { select: { name: true } }, subBusinessUnit: { select: { name: true } }, oem: { select: { name: true } }, salesMethod: { select: { name: true } } },
    orderBy: [{ deal: { code: "asc" } }, { lineNo: "asc" }],
    take: 20_000,
  });
  type L = (typeof rows)[number];
  const cols: CsvColumn<L>[] = [
    { header: "Deal code", value: (r) => r.deal.code },
    { header: "Deal", value: (r) => r.deal.name },
    { header: "Account", value: (r) => r.deal.account.name },
    { header: "Owner", value: (r) => r.deal.owner.fullName },
    { header: "Stage", value: (r) => STAGE_META[r.deal.stage].label },
    { header: "Line", value: (r) => r.lineNo },
    { header: "Product code", value: (r) => r.product?.code },
    { header: "Description", value: (r) => r.description },
    { header: "Business unit", value: (r) => r.businessUnit.name },
    { header: "Sub BU", value: (r) => r.subBusinessUnit.name },
    { header: "OEM", value: (r) => r.oem.name },
    { header: "Quantity", value: (r) => r.quantity.toString() },
    { header: "Unit", value: (r) => r.unit },
    { header: "Revenue model", value: (r) => r.revenueModel },
    { header: "Term (months)", value: (r) => r.termMonths },
    { header: "Unit purchase cost", value: (r) => r.unitPurchaseCost?.toString() },
    ...(sales
      ? ([
          { header: "Unit sales price", value: (r) => r.unitSalesPrice?.toString() },
          { header: "Line value (INR)", value: (r) => r.lineValue?.toString() },
          { header: "Annual value (INR)", value: (r) => r.annualValue?.toString() },
          { header: "GM %", value: (r) => r.expectedGmPct?.toString() },
          { header: "Sales method", value: (r) => r.salesMethod?.name },
        ] as CsvColumn<L>[])
      : []),
    { header: "Updated", value: (r) => fmtDate(r.updatedAt) },
  ];
  return csvResponse(`deal-lines-${stamp()}.csv`, cols, rows);
});

registerExport("leads", async (actor, q) => {
  if (isSupportRole(actor.role)) return csvResponse(`leads-${stamp()}.csv`, [], []);
  const rows = await allLeads(actor, { q: str(q, "q"), status: str(q, "status"), sourceId: str(q, "source"), ownerId: str(q, "owner"), includeDeleted: bool(q, "includeDeleted") }, str(q, "sort"));
  const cols: CsvColumn<LeadRow>[] = [
    { header: "Code", value: (r) => r.code },
    { header: "Company", value: (r) => r.companyName },
    { header: "Contact", value: (r) => r.contactName },
    { header: "Email", value: (r) => r.contactEmail },
    { header: "Phone", value: (r) => r.contactPhone },
    { header: "Source", value: (r) => r.leadSource.name },
    { header: "Industry", value: (r) => r.industry?.name },
    { header: "Segment", value: (r) => r.segment?.name },
    { header: "Business unit", value: (r) => r.businessUnit?.name },
    { header: "Estimated value (INR)", value: (r) => r.estimatedValue },
    { header: "Status", value: (r) => r.status },
    { header: "Owner", value: (r) => r.owner.fullName },
    { header: "Created", value: (r) => fmtDate(r.createdAt) },
    { header: "Updated", value: (r) => fmtDate(r.updatedAt) },
  ];
  return csvResponse(`leads-${stamp()}.csv`, cols, rows);
});

registerExport("audit", async (actor, q) => {
  const rows = await allAudit(actor, { entityType: str(q, "entity_type"), entityId: str(q, "entity_id"), userId: str(q, "user_id"), action: str(q, "action"), from: str(q, "from") ? new Date(`${str(q, "from")}T00:00:00Z`) : undefined, to: str(q, "to") ? new Date(`${str(q, "to")}T23:59:59Z`) : undefined });
  const cols: CsvColumn<AuditRow>[] = [
    { header: "When", value: (r) => r.changedAt.toISOString() },
    { header: "Who", value: (r) => r.changedBy?.fullName },
    { header: "Record", value: (r) => r.entityType },
    { header: "Record id", value: (r) => r.entityId },
    { header: "Deal id", value: (r) => r.dealId },
    { header: "Action", value: (r) => r.action },
    { header: "Field", value: (r) => r.field },
    { header: "Old value", value: (r) => r.oldValue },
    { header: "New value", value: (r) => r.newValue },
  ];
  return csvResponse(`audit-${stamp()}.csv`, cols, rows);
});
