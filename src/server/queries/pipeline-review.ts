import "server-only";
// Pipeline review read model (Salesforce Pipeline Inspection style). Each deal is compared with its owner's
// baseline: the owner's last review, or a fixed window. History comes from the audit log.
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { can, isManager, opportunityScope } from "@/lib/authz";
import { parsePeriodKey, fiscalPeriod, quarterRange } from "@/lib/fiscal";
import { toNumber } from "@/lib/format";
import { ensureRulesFresh } from "@/lib/opportunity-service";
import type { SearchParams } from "@/lib/filters";
import {
  ACTIVE, baselineFor, buildAgenda, dealInsights, median, parseSince, reconstruct, verdict,
  type AuditRow, type PersonStats, type ReviewDeal, type Reconstruction, type SinceKey,
} from "@/lib/review";

const DAY = 86_400_000;
const OPEN = [...ACTIVE, "HOLD"] as string[];
export const CLOSE_PERIODS = [
  { key: "all", label: "All open" },
  { key: "this-q", label: "This quarter" },
  { key: "next-q", label: "Next quarter" },
  { key: "this-fy", label: "This year" },
] as const;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function getPipelineReview(user: CurrentUser, sp: SearchParams) {
  await ensureRulesFresh(db);
  const now = new Date();
  const since: SinceKey = parseSince(one(sp.since));
  const closeKey = CLOSE_PERIODS.some((p) => p.key === one(sp.close)) ? (one(sp.close) as (typeof CLOSE_PERIODS)[number]["key"]) : "all";
  const closeRange = closeKey === "all" ? null : parsePeriodKey(closeKey, now);
  const cur = fiscalPeriod(now);
  const quarter = quarterRange(cur.fiscalYear, cur.quarter);

  // People: sales people and heads. A sales person only ever reviews themselves.
  const allPeople = await db.user.findMany({
    where: { active: true, role: { in: ["SALES", "SALES_HEAD"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, title: true, role: true, managerId: true },
  });
  const people = user.role === "SALES" ? allPeople.filter((p) => p.id === user.id) : allPeople;
  const team = people.filter((p) => p.managerId === user.id).map((p) => p.id);
  const whoRaw = one(sp.who) ?? (user.role === "SALES" ? user.id : "all");
  let selected: string[];
  let scopeKind: "all" | "team" | "people";
  if (user.role === "SALES") {
    selected = [user.id];
    scopeKind = "people";
  } else if (whoRaw === "all") {
    selected = people.map((p) => p.id);
    scopeKind = "all";
  } else if (whoRaw === "team" && team.length) {
    selected = team;
    scopeKind = "team";
  } else {
    selected = whoRaw.split(",").filter((id) => people.some((p) => p.id === id));
    scopeKind = "people";
    if (!selected.length) {
      selected = people.map((p) => p.id);
      scopeKind = "all";
    }
  }
  const selectedSet = new Set(selected);

  // Baselines per person
  const reviews = await db.pipelineReview.findMany({
    orderBy: { reviewedAt: "desc" },
    take: 200,
    select: { id: true, reviewedAt: true, subjectIds: true, notes: true, reviewedBy: { select: { name: true } } },
  });
  const baselines = new Map(people.map((p) => [p.id, baselineFor(p.id, since, reviews, now, quarter.start)]));
  const fallback = baselineFor("", since === "last" ? "7d" : since, [], now, quarter.start);
  const baseOf = (ownerId: string) => baselines.get(ownerId) ?? fallback;
  const minBaseline = new Date(Math.min(...[...baselines.values()].map((b) => b.date.getTime()), fallback.date.getTime()));

  // Deals: open now, or closed since the earliest baseline
  const raw = await db.opportunity.findMany({
    where: { AND: [opportunityScope(user), { OR: [{ stage: { in: OPEN as never } }, { closedAt: { gte: minBaseline } }] }] },
    select: {
      id: true, code: true, name: true, stage: true, amount: true, probability: true, expectedCloseDate: true, forecastCategory: true,
      healthLabel: true, healthScore: true, flags: true, createdAt: true, closedAt: true, lastActivityAt: true, nextStep: true,
      nextStepDate: true, submissionDueDate: true, dealRegExpiry: true, dealRegStatus: true, closeDateSlipCount: true, lossReason: true,
      procurementMode: true, salesOwnerId: true, presalesOwnerId: true,
      account: { select: { name: true } }, salesOwner: { select: { name: true } },
    },
  });
  const audits = await db.auditLog.findMany({
    where: { entityType: "Opportunity", entityId: { in: raw.map((o) => o.id) }, changedAt: { gt: minBaseline } },
    select: { entityId: true, action: true, field: true, oldValue: true, newValue: true, changedAt: true, changedBy: { select: { name: true } } },
  });
  const auditsBy = new Map<string, AuditRow[]>();
  for (const a of audits) {
    const xs = auditsBy.get(a.entityId) ?? [];
    xs.push({ field: a.field, action: a.action, oldValue: a.oldValue, newValue: a.newValue, changedAt: a.changedAt, by: a.changedBy?.name ?? null });
    auditsBy.set(a.entityId, xs);
  }

  type Row = { deal: ReviewDeal; rec: Reconstruction; canEdit: boolean };
  const rows: Row[] = raw.map((o) => {
    const deal: ReviewDeal = {
      id: o.id, code: o.code, name: o.name, account: o.account.name, ownerId: o.salesOwnerId, owner: o.salesOwner.name, stage: o.stage,
      amount: toNumber(o.amount), probability: o.probability, expectedCloseDate: o.expectedCloseDate, forecastCategory: o.forecastCategory,
      healthLabel: o.healthLabel, healthScore: o.healthScore, flags: o.flags, createdAt: o.createdAt, closedAt: o.closedAt,
      lastActivityAt: o.lastActivityAt, nextStep: o.nextStep, nextStepDate: o.nextStepDate, submissionDueDate: o.submissionDueDate,
      dealRegExpiry: o.dealRegExpiry, dealRegStatus: o.dealRegStatus, closeDateSlipCount: o.closeDateSlipCount, lossReason: o.lossReason,
      procurementMode: o.procurementMode,
    };
    return { deal, rec: reconstruct(deal, auditsBy.get(o.id) ?? [], baseOf(o.salesOwnerId).date), canEdit: can.editOpportunity(user, o) };
  });
  const isOpen = (r: Row) => OPEN.includes(r.deal.stage);
  const inClose = (r: Row) => !closeRange || (r.deal.expectedCloseDate >= closeRange.start && r.deal.expectedCloseDate < closeRange.end);
  const closedInWindow = (r: Row) => !!r.deal.closedAt && r.deal.closedAt > baseOf(r.deal.ownerId).date;

  // Activities, targets and trailing win rate per person
  const [acts, targets, closed12] = await Promise.all([
    db.activity.findMany({
      where: { ownerId: { in: people.map((p) => p.id) }, occurredAt: { gt: minBaseline, lte: now }, OR: [{ type: { not: "TASK" } }, { completedAt: { not: null } }] },
      select: { ownerId: true, occurredAt: true },
    }),
    db.salesTarget.findMany({ where: { fiscalYear: cur.fiscalYear, quarter: cur.quarter } }),
    db.opportunity.findMany({
      where: { AND: [opportunityScope(user), { stage: { in: ["WON", "LOST", "DROPPED"] }, closedAt: { gte: new Date(now.getTime() - 365 * DAY) } }] },
      select: { salesOwnerId: true, stage: true, amount: true, closedAt: true },
    }),
  ]);

  const statsFor = (ids: Set<string>, name: string, id: string): PersonStats => {
    const mine = rows.filter((r) => ids.has(r.deal.ownerId));
    const open = mine.filter((r) => isOpen(r) && ACTIVE.includes(r.deal.stage as never));
    const sum = (xs: Row[], f: (r: Row) => number = (r) => r.deal.amount) => xs.reduce((a, r) => a + f(r), 0);
    const wonW = mine.filter((r) => r.deal.stage === "WON" && closedInWindow(r));
    const lostW = mine.filter((r) => (r.deal.stage === "LOST" || r.deal.stage === "DROPPED") && closedInWindow(r));
    const pushed = mine.filter((r) => isOpen(r) && r.rec.pushes > 0);
    const past = open.filter((r) => r.deal.expectedCloseDate < now);
    const target = targets.filter((t) => ids.has(t.userId)).reduce((a, t) => a + toNumber(t.targetAmount), 0);
    const wonQ = closed12.filter((o) => ids.has(o.salesOwnerId) && o.stage === "WON" && o.closedAt && o.closedAt >= quarter.start).reduce((a, o) => a + toNumber(o.amount), 0);
    const w12 = closed12.filter((o) => ids.has(o.salesOwnerId) && o.stage === "WON").length;
    const l12 = closed12.filter((o) => ids.has(o.salesOwnerId) && o.stage !== "WON").length;
    return {
      id, name,
      open: sum(open), openCount: open.length,
      commit: sum(open.filter((r) => r.deal.forecastCategory === "COMMIT")),
      won: sum(wonW), wonCount: wonW.length, lost: sum(lostW), lostCount: lostW.length,
      advanced: mine.filter((r) => r.rec.stageDir === "up").length,
      newPipeline: sum(mine.filter((r) => r.rec.isNew)), newCount: mine.filter((r) => r.rec.isNew).length,
      pushedCount: pushed.length, pushedValue: sum(pushed),
      pastCloseCount: past.length, pastCloseValue: sum(past),
      quietCount: open.filter((r) => r.deal.flags.includes("NO_ACTIVITY")).length,
      commitAtRisk: open.filter((r) => r.deal.flags.includes("COMMIT_AT_RISK")).length,
      activities: acts.filter((a) => ids.has(a.ownerId) && a.occurredAt > baseOf(a.ownerId).date).length,
      fcUpgrades: mine.filter((r) => r.rec.forecast && rankFc(r.rec.forecast.to) > rankFc(r.rec.forecast.from)).length,
      winRate: w12 + l12 ? (w12 / (w12 + l12)) * 100 : null,
      remainingTarget: target > 0 ? target - wonQ : null,
      quarterPipeline: sum(open.filter((r) => r.deal.expectedCloseDate >= quarter.start && r.deal.expectedCloseDate < quarter.end)),
    };
  };
  const perPerson = people.map((p) => statsFor(new Set([p.id]), p.name, p.id));
  // Team benchmark: medians across the sales team (not shown to a sales person, who only sees their own book)
  const reps = perPerson.filter((p) => allPeople.find((x) => x.id === p.id)?.role === "SALES");
  const teamBench =
    isManager(user) && reps.length > 1
      ? {
          activities: median(reps.map((p) => p.activities)),
          newPipeline: median(reps.map((p) => p.newPipeline)),
          winRate: reps.some((p) => p.winRate !== null) ? median(reps.filter((p) => p.winRate !== null).map((p) => p.winRate!)) : null,
        }
      : null;
  const selectionStats = statsFor(selectedSet, scopeKind === "all" ? "Everyone" : "Selection", "selection");
  const single = selected.length === 1 ? selected[0]! : null;
  const verdictFor = single ? verdict(perPerson.find((p) => p.id === single)!, teamBench) : verdict(selectionStats, null);

  // Deal list and metrics for the selection
  const sel = rows.filter((r) => selectedSet.has(r.deal.ownerId));
  const openRows = sel.filter((r) => isOpen(r) && inClose(r));
  const closedRows = sel.filter((r) => closedInWindow(r) && ["WON", "LOST", "DROPPED"].includes(r.deal.stage));
  const startOpen = sel.filter((r) => r.rec.start && ACTIVE.includes(r.rec.start.stage as never) && (!closeRange || inClose(r)));
  const amt = (xs: Row[]) => xs.reduce((a, r) => a + r.deal.amount, 0);
  const startAmt = (xs: Row[], fc?: string) => xs.filter((r) => !fc || r.rec.start!.forecast === fc).reduce((a, r) => a + r.rec.start!.amount, 0);
  const activeNow = openRows.filter((r) => ACTIVE.includes(r.deal.stage as never));
  const byFc = (fc: string) => activeNow.filter((r) => r.deal.forecastCategory === fc);
  const grown = openRows.filter((r) => r.rec.isNew || (r.rec.amount && r.rec.amount.to > r.rec.amount.from));
  const shrunk = openRows.filter((r) => (r.rec.amount && r.rec.amount.to < r.rec.amount.from) || r.rec.stageDir === "down");
  const metrics = {
    total: { now: amt(activeNow), start: startAmt(startOpen), count: activeNow.length },
    commit: { now: amt(byFc("COMMIT")), start: startAmt(startOpen, "COMMIT"), count: byFc("COMMIT").length },
    upside: { now: amt(byFc("UPSIDE")), start: startAmt(startOpen, "UPSIDE"), count: byFc("UPSIDE").length },
    pipeline: { now: amt(byFc("PIPELINE")), start: startAmt(startOpen, "PIPELINE"), count: byFc("PIPELINE").length },
    won: { value: amt(closedRows.filter((r) => r.deal.stage === "WON")), count: closedRows.filter((r) => r.deal.stage === "WON").length },
    lost: { value: amt(closedRows.filter((r) => r.deal.stage !== "WON")), count: closedRows.filter((r) => r.deal.stage !== "WON").length },
    pushed: { value: amt(openRows.filter((r) => r.rec.pushes > 0)), count: openRows.filter((r) => r.rec.pushes > 0).length },
    grown: { value: grown.reduce((a, r) => a + (r.rec.isNew ? r.deal.amount : r.deal.amount - r.rec.amount!.from), 0), count: grown.length },
    shrunk: { value: shrunk.reduce((a, r) => a + (r.rec.amount && r.rec.amount.to < r.rec.amount.from ? r.rec.amount.from - r.deal.amount : 0), 0), count: shrunk.length },
  };

  // The review to follow up: for one person, their latest review; for everyone, the latest all-hands review;
  // for a team or several people, the latest review that covered any of them.
  const covering =
    scopeKind === "all"
      ? reviews.find((r) => !r.subjectIds.length)
      : reviews.find((r) => !r.subjectIds.length || r.subjectIds.some((id) => selectedSet.has(id)));
  const priorActions = covering
    ? await db.activity.findMany({
        where: { reviewId: covering.id, ownerId: { in: selected } },
        orderBy: [{ completedAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }],
        select: { id: true, subject: true, dueAt: true, completedAt: true, owner: { select: { name: true } }, opportunity: { select: { id: true, name: true } } },
      })
    : [];

  const baselineList = selected.map((id) => ({ id, name: people.find((p) => p.id === id)?.name ?? "", ...baseOf(id) }));
  return {
    now,
    since,
    closeKey,
    scope: { kind: scopeKind, selected, label: scopeKind === "all" ? "Everyone" : scopeKind === "team" ? "My team" : selected.length === 1 ? people.find((p) => p.id === selected[0])?.name ?? "" : `${selected.length} people` },
    canChooseOwner: user.role !== "SALES",
    hasTeam: team.length > 0 && team.length < people.length,
    people: people.map((p) => ({ id: p.id, name: p.name, title: p.title })),
    baselines: baselineList,
    lastReview: covering ? { id: covering.id, at: covering.reviewedAt, by: covering.reviewedBy.name, notes: covering.notes, subjects: covering.subjectIds } : null,
    priorActions: priorActions.map((a) => ({
      id: a.id, subject: a.subject, owner: a.owner.name, dueAt: a.dueAt, completedAt: a.completedAt, deal: a.opportunity,
      overdue: !a.completedAt && !!a.dueAt && a.dueAt < now,
    })),
    metrics,
    agenda: buildAgenda(sel.filter(inClose), now),
    verdict: verdictFor,
    // People with nothing in play (no open deals, no closes, no activity in the window) are left out
    rollup:
      scopeKind === "people" && single
        ? null
        : perPerson
            .filter((p) => selectedSet.has(p.id) && (p.openCount || p.wonCount || p.lostCount || p.activities))
            .sort((a, b) => b.open - a.open),
    teamBench,
    deals: openRows
      .map((r) => serialize(r, dealInsights(r.deal, r.rec, now)))
      .sort((a, b) => b.amount - a.amount),
    closed: closedRows.map((r) => serialize(r, [])).sort((a, b) => b.amount - a.amount),
  };
}

function rankFc(fc: string) {
  return ({ OMITTED: 0, PIPELINE: 1, UPSIDE: 2, COMMIT: 3 } as Record<string, number>)[fc] ?? 0;
}

function serialize(r: { deal: ReviewDeal; rec: Reconstruction; canEdit: boolean }, insights: ReturnType<typeof dealInsights>) {
  const d = r.deal;
  const iso = (x: Date | null) => (x ? x.toISOString() : null);
  return {
    id: d.id, code: d.code, name: d.name, account: d.account, ownerId: d.ownerId, owner: d.owner, stage: d.stage, amount: d.amount,
    probability: d.probability, expectedCloseDate: d.expectedCloseDate.toISOString(), forecastCategory: d.forecastCategory,
    healthLabel: d.healthLabel, healthScore: d.healthScore, lastActivityAt: iso(d.lastActivityAt), nextStep: d.nextStep,
    nextStepDate: iso(d.nextStepDate), closedAt: iso(d.closedAt), lossReason: d.lossReason, closeDateSlipCount: d.closeDateSlipCount,
    canEdit: r.canEdit,
    rec: {
      isNew: r.rec.isNew, changed: r.rec.changed, pushes: r.rec.pushes, stageDir: r.rec.stageDir, stage: r.rec.stage, amount: r.rec.amount,
      close: r.rec.close, forecast: r.rec.forecast, health: r.rec.health, changedBy: r.rec.changedBy,
    },
    insights,
  };
}

export type PipelineReviewData = Awaited<ReturnType<typeof getPipelineReview>>;
export type ReviewRow = PipelineReviewData["deals"][number];
