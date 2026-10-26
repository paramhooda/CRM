import "server-only";
import { Prisma, type Stage } from "@prisma/client";
import type { Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { recordChanges } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { boqTotals } from "@/lib/boq";
import { defaultForecast } from "@/lib/rules/evaluate";
import { STAGE_META, CLOSED_STAGES, type StageKey } from "@/lib/constants";
import { billingReadinessIssues, lockForBilling, unlockForBilling, BillingLockedError } from "./billing";

const DAY = 86_400_000;
const LIVE_QUOTE: string[] = ["SUBMITTED", "CHANGES_REQUESTED"];

export class UserError extends Error {}

/** Stage transitions with gates, history, side-effects. Shared by the edit form, stage bar and pipeline board. */
export async function applyStageChange(
  tx: Tx,
  user: CurrentUser,
  id: string,
  to: StageKey,
  extra: { lossReason?: string; lossNotes?: string; poNumber?: string; poDate?: Date },
  opts: { keepProbability?: boolean; keepForecast?: boolean } = {},
): Promise<{ warning?: string }> {
  const o = await tx.opportunity.findUniqueOrThrow({
    where: { id },
    include: {
      lineItems: { select: { quantity: true, unitCost: true, unitPrice: true, billingFrequency: true, termMonths: true } },
      presalesRequests: { select: { id: true } },
      quotes: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  const from = o.stage as StageKey;
  if (from === to) return {};
  const now = new Date();
  if (to === "WON" && !(extra.poNumber ?? o.poNumber)) throw new UserError("PO number and PO date are required to close as won.");
  if (to === "WON" && !(extra.poDate ?? o.poDate)) throw new UserError("PO date is required to close as won.");
  if ((to === "LOST" || to === "DROPPED") && !(extra.lossReason ?? o.lossReason)) throw new UserError("A loss reason is required.");
  if (to === "WON") {
    const issues = await billingReadinessIssues(tx, id);
    if (issues.length) throw new UserError(`Cannot close as won: ${issues.join(" ")}`);
  }
  if (from === "WON") {
    try {
      await unlockForBilling(tx, id, { now, userId: user.id });
    } catch (e) {
      if (e instanceof BillingLockedError) throw new UserError(e.message);
      throw e;
    }
  }

  let warning: string | undefined;
  const totals = boqTotals(o.lineItems);
  if ((to === "PROPOSAL" || to === "NEGOTIATION") && !totals.fullyPriced) {
    warning = totals.lines === 0 ? "Moved without a BOQ. Pull in presales to prepare one." : "BOQ is not fully priced yet. Margin may be inaccurate.";
  }
  if (to === "BOQ" && !o.presalesOwnerId && o.presalesRequests.length === 0) {
    warning = "Deal is at BOQ without presales. Use 'Pull in presales' to request a BOQ.";
  }

  const stageMeta = STAGE_META[to];
  const isClosed = CLOSED_STAGES.includes(to);
  const wasDefaultForecast = o.forecastCategory === defaultForecast(from);
  const data: Prisma.OpportunityUpdateInput = {
    stage: to as Stage,
    stageEnteredAt: now,
    probability: opts.keepProbability && !isClosed ? o.probability : stageMeta.probability,
    forecastCategory:
      isClosed || to === "HOLD" ? "OMITTED" : opts.keepForecast && !wasDefaultForecast ? o.forecastCategory : defaultForecast(to),
    closedAt: isClosed ? now : null,
    updatedById: user.id,
  };
  if (to === "WON") {
    data.poNumber = extra.poNumber ?? o.poNumber;
    data.poDate = extra.poDate ?? o.poDate;
    if (o.revenueModel === "ARR" && o.contractTermMonths) {
      const start = o.contractStartDate ?? extra.poDate ?? now;
      data.contractStartDate = start;
      data.contractEndDate = new Date(start.getTime() + o.contractTermMonths * 30.44 * DAY);
    }
    if (totals.fullyPriced) data.amount = new Prisma.Decimal(Math.round(totals.totalPrice));
  }
  if (to === "LOST" || to === "DROPPED") {
    data.lossReason = extra.lossReason ?? o.lossReason;
    data.lossNotes = extra.lossNotes ?? o.lossNotes;
  }
  await tx.opportunity.update({ where: { id }, data });
  if (to === "WON") {
    await lockForBilling(tx, id, {
      poDate: (data.poDate as Date | undefined) ?? null,
      contractStart: (data.contractStartDate as Date | undefined) ?? o.contractStartDate,
      now,
      userId: user.id,
    });
  }

  const last = await tx.stageHistory.findFirst({ where: { opportunityId: id }, orderBy: { changedAt: "desc" } });
  await tx.stageHistory.create({
    data: {
      opportunityId: id, fromStage: from as Stage, toStage: to as Stage, amount: o.amount, changedById: user.id, changedAt: now,
      daysInPrevStage: last ? Math.round((now.getTime() - last.changedAt.getTime()) / DAY) : null,
    },
  });
  await recordChanges(tx, { entityType: "Opportunity", entityId: id, before: { stage: from }, after: { stage: to }, fields: ["stage"], userId: user.id, at: now });

  if (to === "WON") {
    await tx.account.update({ where: { id: o.accountId }, data: { accountType: "EXISTING", status: "ACTIVE" } });
    // The PO is the customer's acceptance of the latest quote they were sent
    if (o.quotes[0] && LIVE_QUOTE.includes(o.quotes[0].status))
      await tx.quote.update({ where: { id: o.quotes[0].id }, data: { status: "ACCEPTED", respondedAt: now, responseNote: `PO ${data.poNumber as string}` } });
  }
  if ((to === "LOST" || to === "DROPPED") && o.quotes[0] && LIVE_QUOTE.includes(o.quotes[0].status)) {
    await tx.quote.update({ where: { id: o.quotes[0].id }, data: { status: "REJECTED", respondedAt: now } });
  }
  // Anyone still working on the deal is told to stop (closed) or that it is paused (hold)
  const openWork = { opportunityId: id, status: { in: ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as ("REQUESTED" | "IN_PROGRESS" | "NEEDS_INFO")[] } };
  const [presalesOpen, pricingOpen] = await Promise.all([
    tx.presalesRequest.findMany({ where: openWork, select: { assignedToId: true } }),
    tx.pricingRequest.findMany({ where: { opportunityId: id, status: { in: ["REQUESTED", "IN_PROGRESS"] } }, select: { assignedToId: true } }),
  ]);
  const workers = [...presalesOpen, ...pricingOpen].map((r) => r.assignedToId);
  if (isClosed) {
    const cancelReason = `Deal closed as ${stageMeta.label}`;
    await tx.presalesRequest.updateMany({ where: openWork, data: { status: "CANCELLED", cancelReason } });
    await tx.pricingRequest.updateMany({ where: { opportunityId: id, status: { in: ["REQUESTED", "IN_PROGRESS"] } }, data: { status: "CANCELLED", cancelReason } });
  }
  const toldWorkers = workers.length > 0 && (isClosed || to === "HOLD");
  if (toldWorkers) {
    await notify(tx, workers, {
      type: "WORKFLOW",
      title: isClosed ? `Stop work: ${o.name} closed as ${stageMeta.label}` : `On hold: ${o.name}`,
      body: isClosed ? `${user.name} closed the deal. Your open request was cancelled.` : `${user.name} put the deal on hold. Pause work until it resumes.`,
      link: `/opportunities/${id}`,
      exclude: user.id,
    });
  }
  await notify(tx, [o.salesOwnerId, o.presalesOwnerId, isClosed ? o.purchaseOwnerId : null].filter((u) => !toldWorkers || !workers.includes(u ?? "")), {
    type: "STAGE_CHANGE",
    title: `${o.name} moved to ${stageMeta.label}`,
    body: `By ${user.name}`,
    link: `/opportunities/${id}`,
    exclude: user.id,
  });
  return { warning };
}

