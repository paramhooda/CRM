import "server-only";
import { Prisma, type Stage } from "@prisma/client";
import type { Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { recordChanges, recordEvent } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { boqTotals } from "@/lib/boq";
import { defaultForecast } from "@/lib/rules/evaluate";
import { STAGE_META, CLOSED_STAGES, type StageKey } from "@/lib/constants";
import { isManager } from "@/lib/authz";
import { checkMove, forecastError } from "@/lib/stage-rules";
import { loadStageFacts } from "./stage-facts";
import { billingReadinessIssues, lockForBilling, unlockForBilling, BillingLockedError } from "./billing";

const DAY = 86_400_000;
const LIVE_QUOTE: string[] = ["SUBMITTED", "CHANGES_REQUESTED"];
const OPEN_PS = ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as ("REQUESTED" | "IN_PROGRESS" | "NEEDS_INFO")[];
const OPEN_PQ = ["REQUESTED", "IN_PROGRESS"] as ("REQUESTED" | "IN_PROGRESS")[];
/** Everything a stage change can alter, so the audit trail (and pipeline review's reconstruction) sees all of it */
const CLOSE_FIELDS = ["stage", "amount", "forecastCategory", "probability", "poNumber", "poDate", "lossReason", "lossNotes", "closedAt", "expectedCloseDate", "holdReason"];

export { UserError } from "./errors";
import { UserError } from "./errors";

/**
 * Stage transitions with gates, history and side-effects. Every stage change goes through here.
 * `source: "user"` (the default) enforces the process rules in src/lib/stage-rules.ts; `"system"` is for the
 * workflow moving a deal into BOQ, Pricing or Proposal Submitted as work is handed over.
 */
export async function applyStageChange(
  tx: Tx,
  user: CurrentUser,
  id: string,
  to: StageKey,
  extra: { lossReason?: string; lossNotes?: string; poNumber?: string; poDate?: Date; note?: string; expectedCloseDate?: Date },
  opts: { keepProbability?: boolean; keepForecast?: boolean; source?: "user" | "system" } = {},
): Promise<{ warning?: string }> {
  let move: ReturnType<typeof checkMove> | null = null;
  if ((opts.source ?? "user") === "user") {
    const facts = (await loadStageFacts(tx, [id])).get(id);
    if (!facts) throw new UserError("Opportunity not found.");
    if (facts.stage === to) return {};
    move = checkMove(facts, { canEdit: true, isManager: isManager(user) }, to);
    if (!move.allowed) throw new UserError(move.reason ?? "This stage change is not allowed.");
    if (move.needs === "reason" && !extra.note?.trim()) throw new UserError("Give a reason for this change.");
  }
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
  const reopening = CLOSED_STAGES.includes(from) && !CLOSED_STAGES.includes(to);
  const poNumber = extra.poNumber?.trim();
  if (to === "WON") {
    if (!poNumber) throw new UserError("The customer's PO number is required to close as won.");
    if (!extra.poDate) throw new UserError("The PO date is required to close as won.");
    if (extra.poDate.getTime() > now.getTime() + DAY) throw new UserError("The PO date can't be in the future.");
    if (extra.poDate.getTime() < now.getTime() - 366 * DAY) throw new UserError("The PO date is more than a year ago. Check it.");
    const dup = await tx.opportunity.findFirst({
      where: { id: { not: id }, stage: "WON", deletedAt: null, poNumber: { equals: poNumber, mode: "insensitive" } },
      select: { code: true, name: true },
    });
    if (dup) throw new UserError(`PO ${poNumber} is already recorded on ${dup.code} (${dup.name}). Check the number: one PO is billed once.`);
    // The PO itself, not just its number: finance bills against the document
    if (!(await tx.opportunityDocument.count({ where: { opportunityId: id, kind: "CUSTOMER_PO" } })))
      throw new UserError("Attach the customer's PO before closing as won.");
    const issues = await billingReadinessIssues(tx, id);
    if (issues.length) throw new UserError(`Cannot close as won: ${issues.join(" ")}`);
  }
  if (to === "LOST" || to === "DROPPED") {
    if (!extra.lossReason?.trim()) throw new UserError(`Say why the deal is ${to === "LOST" ? "lost" : "dropped"}.`);
    const reasons = (await tx.picklistValue.findMany({ where: { type: "LOSS_REASON", active: true }, select: { value: true } })).map((r) => r.value);
    if (reasons.length && !reasons.includes(extra.lossReason) && extra.lossReason !== "Other")
      throw new UserError("Pick a reason from the list.");
  }
  // A reopened or resumed deal must look forward: a close date in the past would mark it overdue at once
  const today = new Date(now.toDateString());
  if ((reopening || from === "HOLD") && !CLOSED_STAGES.includes(to) && o.expectedCloseDate < today) {
    if (!extra.expectedCloseDate) throw new UserError("The expected close date has passed. Pick a new one.");
    if (extra.expectedCloseDate < today) throw new UserError("The new expected close date can't be in the past.");
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
    warning = totals.lines === 0 ? "Moved without a BOQ. Involve presales to prepare one." : "BOQ is not fully priced yet. Margin may be inaccurate.";
  }
  if (to === "BOQ" && !o.presalesOwnerId && o.presalesRequests.length === 0) {
    warning = "Deal is at BOQ without presales. Request a BOQ from presales.";
  }

  const stageMeta = STAGE_META[to];
  const isClosed = CLOSED_STAGES.includes(to);
  const wasDefaultForecast = o.forecastCategory === defaultForecast(from);
  const keptForecast = opts.keepForecast && !wasDefaultForecast && !forecastError(to, o.forecastCategory);
  const resuming = from === "HOLD";
  let forecast: string = isClosed || to === "HOLD" ? "OMITTED" : keptForecast ? o.forecastCategory : defaultForecast(to);
  if (resuming && !isClosed) {
    // Hold set the forecast to Omitted; resuming restores what the rep had chosen before, if it still fits
    const before = await tx.auditLog.findFirst({
      where: { entityType: "Opportunity", entityId: id, field: "forecastCategory", newValue: "OMITTED" },
      orderBy: { changedAt: "desc" },
      select: { oldValue: true },
    });
    if (before?.oldValue && before.oldValue !== "OMITTED" && !forecastError(to, before.oldValue)) forecast = before.oldValue;
  }
  // A reopened deal's quote was answered or rejected when it closed: it is not Commit until a quote is live again
  if (reopening && forecast === "COMMIT" && !(o.quotes[0] && ["SUBMITTED", "ACCEPTED"].includes(o.quotes[0].status))) forecast = "UPSIDE";
  const data: Prisma.OpportunityUpdateInput = {
    stage: to as Stage,
    stageEnteredAt: now,
    probability: opts.keepProbability && !isClosed ? o.probability : stageMeta.probability,
    forecastCategory: forecast as Prisma.OpportunityUpdateInput["forecastCategory"],
    closedAt: isClosed ? now : null,
    updatedById: user.id,
    // Hold remembers why and where to resume; leaving hold clears it
    ...(to === "HOLD" ? { holdReason: extra.note?.trim() || null, heldFromStage: from as Stage } : resuming ? { holdReason: null, heldFromStage: null } : {}),
    // Reopening forgets how the deal closed, so a later close records its own PO or reason
    ...(reopening ? { poNumber: null, poDate: null, lossReason: null, lossNotes: null } : {}),
    ...(extra.expectedCloseDate && (reopening || resuming) ? { expectedCloseDate: extra.expectedCloseDate } : {}),
  };
  if (to === "WON") {
    data.poNumber = poNumber;
    data.poDate = extra.poDate;
    if (o.revenueModel === "ARR" && o.contractTermMonths) {
      const start = o.contractStartDate ?? extra.poDate ?? now;
      data.contractStartDate = start;
      data.contractEndDate = new Date(start.getTime() + o.contractTermMonths * 30.44 * DAY);
    }
    if (totals.fullyPriced) data.amount = new Prisma.Decimal(Math.round(totals.totalPrice));
  }
  if (to === "LOST" || to === "DROPPED") {
    data.lossReason = extra.lossReason!.trim();
    data.lossNotes = extra.lossNotes?.trim() || null;
  }
  // Claim the move: if someone else changed the stage in the meantime, this change is refused, not applied twice
  const claimed = await tx.opportunity.updateMany({ where: { id, stage: from as Stage }, data: { ...(data as Prisma.OpportunityUpdateManyMutationInput), version: { increment: 1 } } });
  if (!claimed.count) throw new UserError("Someone else just changed this deal's stage. Reload the page.");
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
      note:
        extra.note?.trim() ||
        (to === "WON" ? `PO ${data.poNumber as string}` : to === "LOST" || to === "DROPPED" ? (data.lossReason as string) : null) ||
        (opts.source === "system" ? "Automatic: workflow hand-over" : null),
    },
  });
  const after = await tx.opportunity.findUniqueOrThrow({ where: { id } });
  await recordChanges(tx, { entityType: "Opportunity", entityId: id, before: o, after, fields: CLOSE_FIELDS, userId: user.id, at: now });

  if (to === "WON") {
    await tx.account.update({ where: { id: o.accountId }, data: { accountType: "EXISTING", status: "ACTIVE" } });
    // The PO is the customer's acceptance of the quote they were sent (the stage rules made sure it still matches)
    const q = o.quotes[0];
    if (q && q.status === "SUBMITTED") {
      await tx.quote.update({ where: { id: q.id }, data: { status: "ACCEPTED", respondedAt: now, responseNote: `PO ${poNumber}` } });
      await recordEvent(tx, { entityType: "Opportunity", entityId: id, action: "QUOTE_RESPONSE", userId: user.id, newValue: `Customer accepted ${q.code} v${q.version} with PO ${poNumber}` });
    }
  }
  if ((to === "LOST" || to === "DROPPED") && o.quotes[0] && LIVE_QUOTE.includes(o.quotes[0].status)) {
    const q = o.quotes[0];
    await tx.quote.update({ where: { id: q.id }, data: { status: "REJECTED", respondedAt: now } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: id, action: "QUOTE_RESPONSE", userId: user.id, newValue: `${q.code} v${q.version} closed as rejected (deal ${stageMeta.label.toLowerCase()})` });
  }
  // Resuming: the hold paused the clock on open requests, so their due dates move out by the time on hold
  let pausedDays = 0;
  if (resuming && last) {
    const held = Math.max(0, now.getTime() - last.changedAt.getTime());
    pausedDays = Math.round(held / DAY);
    if (held > 0) {
      await tx.$executeRaw`UPDATE "PresalesRequest" SET "dueDate" = "dueDate" + (${held} * interval '1 millisecond'), "remindedAt" = NULL, "escalatedAt" = NULL WHERE "opportunityId" = ${id} AND "status" IN ('REQUESTED', 'IN_PROGRESS', 'NEEDS_INFO')`;
      await tx.$executeRaw`UPDATE "PricingRequest" SET "dueDate" = "dueDate" + (${held} * interval '1 millisecond'), "remindedAt" = NULL, "escalatedAt" = NULL WHERE "opportunityId" = ${id} AND "status" IN ('REQUESTED', 'IN_PROGRESS')`;
    }
  }
  // Anyone still working on the deal is told to stop (closed) or that it is paused (hold)
  const openWork = { opportunityId: id, status: { in: OPEN_PS } };
  const [presalesOpen, pricingOpen] = await Promise.all([
    tx.presalesRequest.findMany({ where: openWork, select: { assignedToId: true } }),
    tx.pricingRequest.findMany({ where: { opportunityId: id, status: { in: OPEN_PQ } }, select: { assignedToId: true } }),
  ]);
  const workers = [...presalesOpen, ...pricingOpen].map((r) => r.assignedToId);
  if (isClosed) {
    const cancelReason = `Deal closed as ${stageMeta.label}`;
    await tx.presalesRequest.updateMany({ where: openWork, data: { status: "CANCELLED", cancelReason } });
    await tx.pricingRequest.updateMany({ where: { opportunityId: id, status: { in: OPEN_PQ } }, data: { status: "CANCELLED", cancelReason } });
  }
  const toldWorkers = workers.length > 0 && (isClosed || to === "HOLD" || resuming);
  if (toldWorkers) {
    await notify(tx, workers, {
      type: "WORKFLOW",
      title: isClosed ? `Stop work: ${o.name} closed as ${stageMeta.label}` : resuming ? `Resumed: ${o.name}` : `On hold: ${o.name}`,
      body: isClosed
        ? `${user.name} closed the deal. Your open request was cancelled.`
        : resuming
          ? `${user.name} resumed the deal.${pausedDays ? ` Your due date moved out by ${pausedDays} day${pausedDays > 1 ? "s" : ""}, the time it was on hold.` : ""}`
          : `${user.name} put the deal on hold${extra.note ? `: ${extra.note.trim()}` : ""}. Reminders are paused; you can still finish and submit what you are working on.`,
      link: `/opportunities/${id}`,
      exclude: user.id,
    });
  }
  // Work may have moved on while the deal was held (presales may finish and submit): resume to where it now is
  if (resuming && to === "BOQ") {
    const [ps, pq, submitted] = await Promise.all([
      tx.presalesRequest.count({ where: openWork }),
      tx.pricingRequest.count({ where: { opportunityId: id, status: { in: OPEN_PQ } } }),
      last ? tx.presalesRequest.count({ where: { opportunityId: id, status: "BOQ_SUBMITTED", submittedAt: { gte: last.changedAt } } }) : 0,
    ]);
    if (!ps && (pq || submitted)) await applyStageChange(tx, user, id, "PRICING", {}, { keepForecast: true, source: "system" });
  }
  // How it closed, for the people on the deal and the owner's manager
  const why = to === "WON" ? ` · PO ${poNumber}` : to === "LOST" || to === "DROPPED" ? ` · ${data.lossReason as string}` : reopening && extra.note ? ` · ${extra.note.trim()}` : "";
  const manager = isClosed || reopening ? (await tx.user.findUnique({ where: { id: o.salesOwnerId }, select: { managerId: true } }))?.managerId : null;
  await notify(tx, [o.salesOwnerId, o.presalesOwnerId, isClosed || reopening || resuming ? o.purchaseOwnerId : null, manager].filter((u) => !toldWorkers || !workers.includes(u ?? "")), {
    type: "STAGE_CHANGE",
    title: reopening ? `${o.name} reopened to ${stageMeta.label}` : `${o.name} moved to ${stageMeta.label}`,
    body: `By ${user.name}${why}`,
    link: `/opportunities/${id}`,
    exclude: user.id,
  });
  return { warning };
}

