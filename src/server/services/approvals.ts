import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, Forbidden, NotFound, ValidationError } from "../errors";
import { recordChanges, recordEvent } from "../audit";
import { assertCanEditDeal, assertPermission, dealWhere, usersLite } from "../authz/scope";
import type { ApprovalRuleInput } from "@/contracts/approvals";
import { activeRules, getDeal, loadDeal, rulesMatchFor } from "./deals";
import { resolveSteps } from "@/domain/approvals";

// ── Rules (admin) ──

const ruleInclude = { steps: { orderBy: { stepNo: "asc" } }, businessUnit: { select: { id: true, name: true } } } satisfies Prisma.ApprovalRuleInclude;
const ruleOut = (r: Prisma.ApprovalRuleGetPayload<{ include: typeof ruleInclude }>) => ({ ...r, gmBelowPct: r.gmBelowPct?.toString() ?? null, dealValueAtLeast: r.dealValueAtLeast?.toString() ?? null });

export async function listRules(actor: Actor) {
  assertPermission(actor, "approvalRules.manage");
  const rows = await db.approvalRule.findMany({ where: { deletedAt: null }, include: ruleInclude, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return { rows: rows.map(ruleOut) };
}

async function checkRuleRefs(input: ApprovalRuleInput) {
  if (input.businessUnitId && !(await db.businessUnit.findUnique({ where: { id: input.businessUnitId } }))) throw new ValidationError("Pick a business unit.", { businessUnitId: "Pick a business unit." });
  for (const s of input.steps) if (s.approverKind === "USER" && s.approverUserId && !(await db.user.findFirst({ where: { id: s.approverUserId, isActive: true } }))) throw new ValidationError("One of the approvers is not an active user.", { steps: "Pick an active person." });
}

const stepsData = (input: ApprovalRuleInput) => input.steps.map((s, i) => ({ stepNo: i + 1, approverKind: s.approverKind, approverRole: s.approverKind === "ROLE" ? s.approverRole ?? null : null, approverUserId: s.approverKind === "USER" ? s.approverUserId ?? null : null }));

export async function createRule(actor: Actor, input: ApprovalRuleInput, requestId: string) {
  assertPermission(actor, "approvalRules.manage");
  await checkRuleRefs(input);
  if (await db.approvalRule.findUnique({ where: { name: input.name } })) throw new Conflict("A rule with that name already exists.", "DUPLICATE");
  const r = await db.$transaction(async (tx) => {
    const row = await tx.approvalRule.create({ data: { name: input.name, isActive: input.isActive, gmBelowPct: input.gmBelowPct ?? null, dealValueAtLeast: input.dealValueAtLeast ?? null, businessUnitId: input.businessUnitId ?? null, steps: { create: stepsData(input) } }, include: ruleInclude });
    await recordEvent(tx, { entityType: "approval_rule", entityId: row.id, action: "CREATE", userId: actor.id, requestId, newValue: row.name });
    return row;
  });
  return ruleOut(r);
}

export async function updateRule(actor: Actor, id: string, input: ApprovalRuleInput, requestId: string) {
  assertPermission(actor, "approvalRules.manage");
  const before = await db.approvalRule.findFirst({ where: { id, deletedAt: null }, include: ruleInclude });
  if (!before) throw new NotFound();
  await checkRuleRefs(input);
  if (input.name !== before.name && (await db.approvalRule.findUnique({ where: { name: input.name } }))) throw new Conflict("A rule with that name already exists.", "DUPLICATE");
  const r = await db.$transaction(async (tx) => {
    await tx.approvalRuleStep.deleteMany({ where: { approvalRuleId: id } });
    const row = await tx.approvalRule.update({ where: { id }, data: { name: input.name, isActive: input.isActive, gmBelowPct: input.gmBelowPct ?? null, dealValueAtLeast: input.dealValueAtLeast ?? null, businessUnitId: input.businessUnitId ?? null, steps: { create: stepsData(input) } }, include: ruleInclude });
    await recordChanges(tx, { entityType: "approval_rule", entityId: id, userId: actor.id, requestId, before: { ...ruleOut(before), steps: JSON.stringify(before.steps.map((s) => [s.approverKind, s.approverRole, s.approverUserId])) }, after: { ...ruleOut(row), steps: JSON.stringify(row.steps.map((s) => [s.approverKind, s.approverRole, s.approverUserId])) }, fields: ["name", "isActive", "gmBelowPct", "dealValueAtLeast", "businessUnitId", "steps"] });
    return row;
  });
  return ruleOut(r);
}

export async function deleteRule(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "approvalRules.manage");
  const r = await db.approvalRule.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw new NotFound();
  // The name is freed for reuse; the deleted rule keeps its history under a stamped name
  await db.approvalRule.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id, isActive: false, name: `${r.name} (deleted ${new Date().toISOString().slice(0, 19)})`.slice(0, 120) } });
  await recordEvent(db, { entityType: "approval_rule", entityId: id, action: "DELETE", userId: actor.id, requestId, oldValue: r.name });
}

// ── Approvals on deals ──

const approvalInclude = { steps: { orderBy: { stepNo: "asc" } }, requestedBy: { select: { id: true, fullName: true } }, deal: { select: { id: true, code: true, name: true, ownerId: true, dealValue: true, expectedGmPct: true, owner: { select: { id: true, fullName: true } }, account: { select: { id: true, name: true } } } } } satisfies Prisma.DealApprovalInclude;
type ApprovalRecord = Prisma.DealApprovalGetPayload<{ include: typeof approvalInclude }>;

async function approvalOut(a: ApprovalRecord) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(a.steps.flatMap((s) => [...s.approverUserIds, s.decidedById ?? ""]).filter(Boolean))] } }, select: { id: true, fullName: true } });
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  return {
    ...a,
    dealValue: a.dealValue.toString(),
    gmPct: a.gmPct?.toString() ?? null,
    deal: { ...a.deal, dealValue: a.deal.dealValue.toString(), expectedGmPct: a.deal.expectedGmPct?.toString() ?? null },
    steps: a.steps.map((s) => ({ ...s, approvers: s.approverUserIds.map((id) => ({ id, fullName: name.get(id) ?? "?" })), decidedByName: s.decidedById ? name.get(s.decidedById) ?? null : null, current: a.status === "PENDING" && s.stepNo === a.currentStep })),
  };
}

export async function listDealApprovals(actor: Actor, dealId: string) {
  await loadDeal(actor, dealId, { includeDeleted: true });
  assertPermission(actor, "deals.viewSales");
  const rows = await db.dealApproval.findMany({ where: { dealId }, include: approvalInclude, orderBy: { requestedAt: "desc" } });
  return { rows: await Promise.all(rows.map(approvalOut)) };
}

/** Asks for approval of the deal's current prices. 409 when no rule applies. */
export async function requestApproval(actor: Actor, dealId: string, requestId: string) {
  const deal = await loadDeal(actor, dealId);
  await assertCanEditDeal(actor, deal);
  if (deal.stage !== "QUALIFIED" && deal.stage !== "BOQ") throw new Conflict("Approval is asked for before the proposal goes out.", "WRONG_STAGE");
  if (deal.lines.some((l) => l.unitSalesPrice === null)) throw new Conflict("Set a sales price on every line first.", "UNPRICED");
  const rules = await activeRules();
  const matched = rulesMatchFor(deal, rules);
  if (!matched.length) throw new Conflict("These prices don't need approval.", "NOT_NEEDED");
  if (deal.approvals.some((a) => a.status === "PENDING" && a.priceFingerprint === deal.priceFingerprint)) throw new Conflict("Approval has already been requested for these prices.", "ALREADY_PENDING");
  if (deal.approvals.some((a) => a.status === "APPROVED" && a.priceFingerprint === deal.priceFingerprint)) throw new Conflict("These prices are already approved.", "ALREADY_APPROVED");
  const users = await usersLite();
  const names = new Map((await db.user.findMany({ select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  const usersByRole: Partial<Record<"ADMIN" | "SALES_HEAD" | "SALES" | "PRESALES" | "PURCHASE", string[]>> = {};
  for (const u of users) if (u.isActive) (usersByRole[u.role] ??= []).push(u.id);
  const steps = resolveSteps(
    matched.map((m) => ({ rule: { ...m.rule, gmBelowPct: m.rule.gmBelowPct?.toString() ?? null, dealValueAtLeast: m.rule.dealValueAtLeast?.toString() ?? null } })),
    { requesterId: actor.id, ownerManagerId: deal.owner.managerId, usersByRole, adminIds: usersByRole.ADMIN ?? [], nameOf: (id) => names.get(id) ?? "?" },
  );
  const firstOpen = steps.findIndex((s) => !s.autoPassed);
  const allAuto = firstOpen === -1;
  const a = await db.$transaction(async (tx) => {
    await tx.dealApproval.updateMany({ where: { dealId, status: "PENDING" }, data: { status: "SUPERSEDED", decidedAt: new Date() } });
    const row = await tx.dealApproval.create({
      data: {
        dealId, requestedById: actor.id, priceFingerprint: deal.priceFingerprint ?? "", dealValue: deal.dealValue, gmPct: deal.expectedGmPct,
        reasons: matched.flatMap((m) => m.reasons.map((r) => `${m.rule.name}: ${r}`)),
        status: allAuto ? "APPROVED" : "PENDING", currentStep: allAuto ? steps.length : firstOpen + 1, decidedAt: allAuto ? new Date() : null,
        steps: { create: steps.map((s) => ({ stepNo: s.stepNo, label: s.label, approverUserIds: s.approverUserIds, autoPassed: s.autoPassed, decision: s.autoPassed ? "APPROVED" : null, decidedAt: s.autoPassed ? new Date() : null })) },
      },
      include: approvalInclude,
    });
    await recordEvent(tx, { entityType: "deal", entityId: dealId, dealId, action: "UPDATE", userId: actor.id, requestId, field: "approval", newValue: allAuto ? "approved (no other approver needed)" : `requested: ${steps.map((s) => s.label).join(" → ")}` });
    return row;
  });
  return { approval: await approvalOut(a), deal: await getDeal(actor, dealId) };
}

/** Approvals waiting on the actor (current step lists them), plus their decided ones. */
export async function myApprovals(actor: Actor, status: "PENDING" | "DECIDED") {
  assertPermission(actor, "approvals.decide");
  const where: Prisma.DealApprovalWhereInput = status === "PENDING"
    ? { status: "PENDING", steps: { some: { approverUserIds: { has: actor.id }, decision: null } }, deal: { deletedAt: null } }
    : { steps: { some: { decidedById: actor.id } } };
  const rows = await db.dealApproval.findMany({ where, include: approvalInclude, orderBy: { requestedAt: "desc" }, take: 200 });
  const mine = status === "PENDING" ? rows.filter((a) => a.steps.some((s) => s.stepNo === a.currentStep && s.approverUserIds.includes(actor.id))) : rows;
  return { rows: await Promise.all(mine.map(approvalOut)) };
}

export async function decideApproval(actor: Actor, id: string, input: { decision: "APPROVED" | "REJECTED"; note?: string | null }, requestId: string) {
  const a = await db.dealApproval.findFirst({ where: { id, deal: await dealWhere(actor) }, include: approvalInclude });
  if (!a) throw new NotFound("That approval doesn't exist or isn't yours to see.");
  if (a.status !== "PENDING") throw new Conflict("This approval has already been decided.", "DECIDED");
  const step = a.steps.find((s) => s.stepNo === a.currentStep);
  if (!step || !step.approverUserIds.includes(actor.id)) throw new Forbidden("This step isn't yours to decide.");
  if (a.requestedById === actor.id) throw new Forbidden("You can't approve your own request.");
  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    await tx.dealApprovalStep.update({ where: { id: step.id }, data: { decision: input.decision, decidedById: actor.id, decidedAt: now, note: input.note ?? null } });
    let data: Prisma.DealApprovalUpdateInput;
    if (input.decision === "REJECTED") data = { status: "REJECTED", decidedAt: now };
    else {
      const next = a.steps.find((s) => s.stepNo > a.currentStep && !s.autoPassed);
      data = next ? { currentStep: next.stepNo } : { status: "APPROVED", decidedAt: now, currentStep: a.steps.length };
    }
    const row = await tx.dealApproval.update({ where: { id }, data, include: approvalInclude });
    await recordEvent(tx, { entityType: "deal", entityId: a.dealId, dealId: a.dealId, action: "UPDATE", userId: actor.id, requestId, field: "approval", oldValue: `step ${step.stepNo}: ${step.label}`, newValue: `${input.decision.toLowerCase()}${input.note ? `: ${input.note}` : ""}${row.status !== "PENDING" ? ` (${row.status.toLowerCase()})` : ""}` });
    return row;
  });
  return approvalOut(updated);
}
