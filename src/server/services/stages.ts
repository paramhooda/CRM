import "server-only";
import { db, type Tx } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, ValidationError } from "../errors";
import { recordEvent } from "../audit";
import { isManager } from "../authz/scope";
import { toDate } from "@/contracts/common";
import type { StageMoveInput } from "@/contracts/stages";
import { activeRules, approvalStateFor, dealFacts, getDeal, loadDeal, todayDate, type DealDetailRecord } from "./deals";
import { applyMove, findMove, handoverBlockers, STAGE_META, type Stage } from "@/domain/stages";
import { daysBetween } from "@/domain/fiscal";
import { canEditDeal } from "../authz/scope";

/** Records a stage change: the deal's new stage, the history row with days in the previous stage, and the audit row. */
type AuditedField = { field: string; oldValue: string | null; newValue: string | null };

export async function writeStageChange(tx: Tx, deal: { id: string; stage: Stage; stageEnteredAt: Date; dealValue: { toString(): string } }, to: Stage, actorId: string, requestId: string, note: string | null, extra: Record<string, unknown> = {}, audited: AuditedField[] = []) {
  const now = new Date();
  await tx.deal.update({ where: { id: deal.id }, data: { stage: to, stageEnteredAt: now, version: { increment: 1 }, ...extra } });
  await tx.dealStageHistory.create({
    data: { dealId: deal.id, fromStage: deal.stage, toStage: to, changedById: actorId, changedAt: now, daysInPreviousStage: daysBetween(deal.stageEnteredAt, now), dealValueAtChange: deal.dealValue.toString(), note },
  });
  await recordEvent(tx, { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "STAGE_CHANGE", userId: actorId, requestId, field: "stage", oldValue: deal.stage, newValue: to });
  // The fields a move sets alongside the stage (hold reason, loss reason, PO number…) get their own rows
  for (const a of audited) if (a.oldValue !== a.newValue) await recordEvent(tx, { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "UPDATE", userId: actorId, requestId, field: a.field, oldValue: a.oldValue, newValue: a.newValue });
}

async function cancelOpenRequests(tx: Tx, deal: DealDetailRecord, actorId: string, requestId: string, why: string) {
  const now = new Date();
  for (const r of deal.presalesRequests.filter((r) => r.status === "REQUESTED" || r.status === "IN_PROGRESS")) {
    await tx.presalesRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelledAt: now } });
    await recordEvent(tx, { entityType: "presales_request", entityId: r.id, dealId: deal.id, action: "UPDATE", userId: actorId, requestId, field: "status", oldValue: r.status, newValue: `CANCELLED (${why})` });
  }
  for (const r of deal.pricingRequests.filter((r) => r.status === "REQUESTED" || r.status === "IN_PROGRESS")) {
    await tx.pricingRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelledAt: now } });
    await recordEvent(tx, { entityType: "pricing_request", entityId: r.id, dealId: deal.id, action: "UPDATE", userId: actorId, requestId, field: "status", oldValue: r.status, newValue: `CANCELLED (${why})` });
  }
}

/** Every stage move goes through here. The rules decide what is allowed; this applies it and its side effects. */
export async function moveStage(actor: Actor, dealId: string, input: StageMoveInput, requestId: string) {
  const deal = await loadDeal(actor, dealId);
  if (deal.version !== input.version) throw new Conflict("Someone else changed this deal. Reload to see the latest and try again.", "STALE");
  const rules = await activeRules();
  const facts = dealFacts(deal, approvalStateFor(deal, rules));
  const canEdit = await canEditDeal(actor, deal);
  const move = findMove(facts, { canEdit, isManager: isManager(actor) }, input.action);
  if (!move) throw new Conflict("That move isn't available from this stage.", "NOT_ALLOWED");
  if (!move.enabled) throw new Conflict(move.reason ?? "That move isn't allowed right now.", "NOT_ALLOWED");
  if (move.needsDocument) throw new Conflict(handoverBlockers(facts)[0]!, "NO_DOCUMENT");

  if (move.needsReason && !input.reason) throw new ValidationError("Give a reason.", { reason: "Required." });
  let lossReasonName: string | null = null;
  if (move.needsLossReason) {
    if (!input.lossReasonId) throw new ValidationError("Pick a reason.", { lossReasonId: "Required." });
    const lr = await db.lossReason.findFirst({ where: { id: input.lossReasonId, isActive: true } });
    const wanted = move.action === "LOST" ? "LOST" : "DROPPED";
    if (!lr || (lr.appliesTo !== "BOTH" && lr.appliesTo !== wanted)) throw new ValidationError("That reason doesn't apply here.", { lossReasonId: "Pick another reason." });
    lossReasonName = lr.name;
  }
  if (move.needsPo && !input.poNumber) throw new ValidationError("Enter the customer's PO number.", { poNumber: "Required." });
  let presales: { assigneeId: string; assigneeName: string; dueDate: Date; scope: string } | null = null;
  if (move.needsPresalesRequest) {
    const assigneeId = input.presalesAssigneeId ?? deal.presalesOwnerId;
    if (!assigneeId) throw new ValidationError("Pick the presales engineer.", { presalesAssigneeId: "Required." });
    const u = await db.user.findFirst({ where: { id: assigneeId, role: "PRESALES", isActive: true } });
    if (!u) throw new ValidationError("Pick a presales engineer.", { presalesAssigneeId: "Pick a presales engineer." });
    if (!input.presalesDueDate) throw new ValidationError("Set a due date for the BOQ.", { presalesDueDate: "Required." });
    const due = toDate(input.presalesDueDate);
    if (due < todayDate()) throw new ValidationError("The due date can't be in the past.", { presalesDueDate: "Can't be in the past." });
    const scope = input.presalesScope?.trim() ?? "";
    if (scope.length < 3) throw new ValidationError("Say what presales should size and specify.", { presalesScope: "Required." });
    presales = { assigneeId, assigneeName: u.fullName, dueDate: due, scope };
  }

  const applied = applyMove(facts, move);
  const note = input.reason ?? lossReasonName ?? (input.poNumber ? `PO ${input.poNumber}` : null);
  await db.$transaction(async (tx) => {
    const extra: Record<string, unknown> = {
      heldFromStage: applied.heldFromStage,
      lastOpenStage: applied.lastOpenStage,
      needsPresales: applied.needsPresales,
      closedAt: applied.closes ? new Date() : null,
      holdReason: move.action === "HOLD" ? input.reason : null,
    };
    if (move.action === "LOST" || move.action === "DROPPED") Object.assign(extra, { lossReasonId: input.lossReasonId, lossNotes: input.lossNotes ?? null });
    if (applied.toStage === "CLOSED_WON") Object.assign(extra, { poNumber: input.poNumber });
    if (move.action === "REOPEN") Object.assign(extra, { lossReasonId: null, lossNotes: null, poNumber: null });
    if (presales) Object.assign(extra, { presalesOwnerId: presales.assigneeId });
    const audited: AuditedField[] = [];
    if (move.action === "HOLD") audited.push({ field: "holdReason", oldValue: deal.holdReason, newValue: input.reason ?? null });
    if (move.action === "LOST" || move.action === "DROPPED") audited.push({ field: "lossReasonId", oldValue: deal.lossReason?.name ?? null, newValue: lossReasonName }, { field: "lossNotes", oldValue: deal.lossNotes, newValue: input.lossNotes ?? null });
    if (applied.toStage === "CLOSED_WON") audited.push({ field: "poNumber", oldValue: deal.poNumber, newValue: input.poNumber ?? null });
    if (move.action === "REOPEN") audited.push({ field: "lossReasonId", oldValue: deal.lossReason?.name ?? null, newValue: null }, { field: "poNumber", oldValue: deal.poNumber, newValue: null });
    if (presales) audited.push({ field: "presalesOwnerId", oldValue: deal.presalesOwner?.fullName ?? null, newValue: presales.assigneeName });
    await writeStageChange(tx, deal, applied.toStage, actor.id, requestId, note, extra, audited);

    if (presales) {
      const r = await tx.presalesRequest.create({ data: { dealId: deal.id, requestedById: actor.id, assignedToId: presales.assigneeId, dueDate: presales.dueDate, scope: presales.scope } });
      await recordEvent(tx, { entityType: "presales_request", entityId: r.id, dealId: deal.id, action: "CREATE", userId: actor.id, requestId, newValue: `BOQ requested, due ${presales.dueDate.toISOString().slice(0, 10)}` });
    }
    if (move.action === "SKIP_BOQ") await cancelOpenRequests(tx, { ...deal, pricingRequests: [] }, actor.id, requestId, "BOQ skipped");
    if (applied.closes) await cancelOpenRequests(tx, deal, actor.id, requestId, `deal ${STAGE_META[applied.toStage].label.toLowerCase()}`);
  });
  return getDeal(actor, dealId);
}
