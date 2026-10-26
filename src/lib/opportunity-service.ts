import type { Tx } from "./db";
import { evaluateOpportunity } from "./rules/evaluate";
import { boqTotals } from "./boq";
import { toNumber } from "./format";
import type { StageKey, ForecastKey } from "./constants";
import type { Prisma } from "@prisma/client";

const ruleInclude = {
  lineItems: { select: { quantity: true, unitCost: true, unitPrice: true, billingFrequency: true, termMonths: true } },
  _count: { select: { contacts: true } },
  pricingRequests: { where: { status: { in: ["REQUESTED", "IN_PROGRESS"] } }, select: { dueDate: true } },
  presalesRequests: { where: { status: { in: ["REQUESTED", "IN_PROGRESS"] } }, select: { dueDate: true } },
} satisfies Prisma.OpportunityInclude;

/** Re-run the rules engine for one opportunity and persist score, label and flags. */
export async function recomputeOpportunity(tx: Tx, id: string, now = new Date()) {
  const o = await tx.opportunity.findUnique({ where: { id }, include: ruleInclude });
  if (!o) return null;
  const totals = boqTotals(o.lineItems);
  const margin = totals.marginPct ?? (o.expectedMarginPct !== null ? toNumber(o.expectedMarginPct) : null);
  const earliest = (ds: { dueDate: Date }[]) =>
    ds.length ? ds.map((d) => d.dueDate).sort((a, b) => a.getTime() - b.getTime())[0]! : null;
  const r = evaluateOpportunity(
    {
      stage: o.stage as StageKey,
      forecastCategory: o.forecastCategory as ForecastKey,
      amount: toNumber(o.amount),
      revenueModel: o.revenueModel,
      arrAmount: o.arrAmount === null ? null : toNumber(o.arrAmount),
      contractTermMonths: o.contractTermMonths,
      expectedCloseDate: o.expectedCloseDate,
      closeDateSlipCount: o.closeDateSlipCount,
      stageEnteredAt: o.stageEnteredAt,
      lastActivityAt: o.lastActivityAt,
      createdAt: o.createdAt,
      nextStep: o.nextStep,
      nextStepDate: o.nextStepDate,
      presalesOwnerId: o.presalesOwnerId,
      primaryContactId: o.primaryContactId,
      contactCount: o._count.contacts,
      marginPct: margin,
      openPricingDueDate: earliest(o.pricingRequests),
      openPresalesDueDate: earliest(o.presalesRequests),
      dealRegStatus: o.dealRegStatus,
      dealRegExpiry: o.dealRegExpiry,
      procurementMode: o.procurementMode,
      submissionDueDate: o.submissionDueDate,
    },
    now,
  );
  await tx.opportunity.update({
    where: { id },
    data: { healthScore: r.score, healthLabel: r.label, flags: r.flags, rulesEvaluatedAt: now },
  });
  // Audit health movement (system change) so pipeline reviews can rebuild health at any past date.
  // Skipped on the very first evaluation, when the stored label is just the column default.
  if (o.rulesEvaluatedAt && o.healthLabel !== r.label) {
    await tx.auditLog.create({
      data: { entityType: "Opportunity", entityId: id, action: "UPDATE", field: "healthLabel", oldValue: o.healthLabel, newValue: r.label, changedAt: now },
    });
  }
  return r;
}

/** Recompute every open opportunity. Called at startup, after seeding and periodically from dashboard loads. */
export async function recomputeAll(tx: Tx, now = new Date()) {
  const open = await tx.opportunity.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  for (const o of open) await recomputeOpportunity(tx, o.id, now);
  await tx.systemSetting.upsert({
    where: { key: "rules.lastRunAt" },
    create: { key: "rules.lastRunAt", value: now.toISOString() },
    update: { value: now.toISOString() },
  });
  return open.length;
}

/** Ensure rules are fresh (days-based rules drift as time passes). Cheap check, runs at most every 30 min. */
export async function ensureRulesFresh(tx: Tx) {
  const s = await tx.systemSetting.findUnique({ where: { key: "rules.lastRunAt" } });
  const last = s ? new Date(s.value).getTime() : 0;
  if (Date.now() - last > 30 * 60_000) await recomputeAll(tx);
}
