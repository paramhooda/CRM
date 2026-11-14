import "server-only";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { NotFound, ValidationError } from "../errors";
import { assertPermission, usersLite, visibleOwnerIds } from "../authz/scope";
import { recordEvent } from "../audit";
import { changesSince, flagsFor, personSummary, FLAG_LABEL, type Flag } from "@/domain/review";
import { STAGE_META, isOpen } from "@/domain/stages";
import { teamUserIds } from "@/domain/scope";
import { fiscalQuarterOf, fiscalYearOf, quarterRange } from "@/domain/fiscal";
import { toNumber } from "@/domain/money";

export type ReviewScopeInput = { scope: "rep" | "team" | "everyone"; scopeUserId?: string | null; since: string };

/** Resolves who the review covers, within what the actor may see. */
async function subjects(actor: Actor, s: ReviewScopeInput): Promise<{ ids: string[]; scopeUserId: string | null }> {
  const users = await usersLite();
  const visible = await visibleOwnerIds(actor);
  const sales = users.filter((u) => u.isActive && u.role === "SALES" && (visible === null || visible.includes(u.id)));
  if (s.scope === "rep") {
    const id = s.scopeUserId ?? (actor.role === "SALES" ? actor.id : null);
    if (!id || !sales.some((u) => u.id === id)) throw new NotFound("That person isn't in your team.");
    return { ids: [id], scopeUserId: id };
  }
  if (s.scope === "team") {
    const id = s.scopeUserId ?? actor.id;
    if (visible !== null && !visible.includes(id) && id !== actor.id) throw new NotFound("That team isn't yours to see.");
    const team = new Set(teamUserIds(users, id));
    return { ids: sales.filter((u) => team.has(u.id)).map((u) => u.id), scopeUserId: id };
  }
  if (actor.role === "SALES") return { ids: [actor.id], scopeUserId: actor.id };
  return { ids: sales.map((u) => u.id), scopeUserId: null };
}

function sinceFor(key: string, now: Date, last: Date | null): Date {
  const day = 86_400_000;
  if (key === "last") return last ?? new Date(now.getTime() - 14 * day);
  const m = /^(\d+)d$/.exec(key);
  if (m) return new Date(now.getTime() - Number(m[1]) * day);
  if (key === "qtd") return quarterRange(fiscalYearOf(now), fiscalQuarterOf(now)).from;
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new ValidationError("Pick a start point for the review.", { since: "Not a date." });
  return d;
}

export async function pipelineReview(actor: Actor, s: ReviewScopeInput) {
  assertPermission(actor, "reviews.view");
  const now = new Date();
  const { ids, scopeUserId } = await subjects(actor, s);
  // "since last review" is per person: the latest review that covered them
  const lastReviews = await db.pipelineReview.findMany({ where: { subjectUserIds: { hasSome: ids.length ? ids : ["none"] } }, orderBy: { reviewedAt: "desc" }, select: { reviewedAt: true, subjectUserIds: true, notes: true, reviewedBy: { select: { fullName: true } } } });
  const lastFor = (id: string) => lastReviews.find((r) => r.subjectUserIds.includes(id))?.reviewedAt ?? null;
  const sinceByUser = new Map(ids.map((id) => [id, sinceFor(s.since, now, lastFor(id))]));
  const earliest = ids.length ? new Date(Math.min(...[...sinceByUser.values()].map((d) => d.getTime()))) : now;
  const deals = await db.deal.findMany({
    where: { deletedAt: null, ownerId: { in: ids }, OR: [{ stage: { in: ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD"] } }, { closedAt: { gte: earliest } }] },
    select: { id: true, code: true, name: true, stage: true, forecastCategory: true, dealValue: true, expectedGmPct: true, expectedCloseDate: true, stageEnteredAt: true, updatedAt: true, createdAt: true, closedAt: true, nextStep: true, nextStepDate: true, ownerId: true, owner: { select: { id: true, fullName: true } }, account: { select: { id: true, name: true } } },
    orderBy: [{ owner: { fullName: "asc" } }, { dealValue: "desc" }],
  });
  const audit = deals.length ? await db.auditLog.findMany({ where: { entityType: "deal", entityId: { in: deals.map((d) => d.id) }, changedAt: { gte: earliest }, field: { not: null } }, select: { entityId: true, field: true, oldValue: true, newValue: true, changedAt: true, action: true }, orderBy: { changedAt: "asc" } }) : [];
  const byDeal = new Map<string, typeof audit>();
  for (const a of audit) byDeal.set(a.entityId, [...(byDeal.get(a.entityId) ?? []), a]);
  const fy = fiscalYearOf(now), q = fiscalQuarterOf(now);
  const targets = new Map((await db.salesTarget.findMany({ where: { userId: { in: ids }, fiscalYear: fy, quarter: q } })).map((t) => [t.userId, toNumber(t.targetValue)]));
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });

  const rows = deals.map((d) => {
    const since = sinceByUser.get(d.ownerId)!;
    const changes = changesSince(d, byDeal.get(d.id) ?? [], since);
    const flags = flagsFor(d, changes.pushes, now);
    return { ...d, dealValue: toNumber(d.dealValue), expectedGmPct: d.expectedGmPct?.toString() ?? null, stageLabel: STAGE_META[d.stage].label, open: isOpen(d.stage), changes, flags, flagLabels: flags.map((f: Flag) => FLAG_LABEL[f]), daysInStage: Math.floor((now.getTime() - d.stageEnteredAt.getTime()) / 86_400_000) };
  });
  const people = users.map((u) => {
    const mine = rows.filter((r) => r.ownerId === u.id);
    const since = sinceByUser.get(u.id)!;
    return { user: u, since, lastReview: lastFor(u.id), summary: personSummary(mine.map((r) => ({ stage: r.stage, dealValue: r.dealValue, forecastCategory: r.forecastCategory, closedAt: r.closedAt, flags: r.flags, changes: r.changes })), since, targets.get(u.id) ?? null), deals: mine.length };
  });
  return { scope: s.scope, scopeUserId, since: s.since, people, deals: rows, flagged: rows.filter((r) => r.flags.length).length, changed: rows.filter((r) => Object.keys(r.changes.changes).length || r.changes.isNew).length };
}

export async function markReviewed(actor: Actor, input: { scope: "rep" | "team" | "everyone"; scopeUserId?: string | null; sinceDate: string; notes?: string | null }, requestId: string) {
  assertPermission(actor, "reviews.mark");
  const { ids, scopeUserId } = await subjects(actor, { ...input, since: input.sinceDate });
  const since = sinceFor(input.sinceDate, new Date(), null);
  const r = await db.pipelineReview.create({ data: { reviewedById: actor.id, scope: input.scope.toUpperCase() as "REP" | "TEAM" | "EVERYONE", scopeUserId, subjectUserIds: ids, sinceDate: since, notes: input.notes ?? null } });
  await recordEvent(db, { entityType: "pipeline_review", entityId: r.id, action: "CREATE", userId: actor.id, requestId, newValue: `${input.scope}${scopeUserId ? ` ${scopeUserId}` : ""}: ${ids.length} people` });
  return r;
}

export async function listReviews(actor: Actor) {
  assertPermission(actor, "reviews.view");
  const visible = await visibleOwnerIds(actor);
  const rows = await db.pipelineReview.findMany({ where: visible === null ? {} : { OR: [{ reviewedById: actor.id }, { subjectUserIds: { hasSome: visible } }] }, orderBy: { reviewedAt: "desc" }, take: 50, include: { reviewedBy: { select: { id: true, fullName: true } } } });
  const names = new Map((await db.user.findMany({ select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  return { rows: rows.map((r) => ({ ...r, subjects: r.subjectUserIds.map((id) => names.get(id) ?? "?") })) };
}
