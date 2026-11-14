import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { assertPermission, dealWhere, visibleOwnerIds } from "../authz/scope";
import { dealListWhere, todayDate } from "./deals";
import type { DealListQuery } from "@/contracts/deals";
import { fiscalQuarterOf, fiscalYearOf, fiscalYearRange, quarterRange, fyLabel } from "@/domain/fiscal";
import { OPEN_STAGES, STAGE_META, isOpen, type Stage } from "@/domain/stages";
import { toNumber } from "@/domain/money";

const openStages: Stage[] = [...OPEN_STAGES, "HOLD"];

type Bucket = { key: string; label: string; count: number; value: number; colourToken?: string };

function bucketise<T>(rows: T[], key: (r: T) => { key: string; label: string; colourToken?: string } | null, value: (r: T) => number, dealIds?: (r: T) => string): Bucket[] {
  const m = new Map<string, Bucket & { deals: Set<string> }>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const b = m.get(k.key) ?? { ...k, count: 0, value: 0, deals: new Set<string>() };
    b.value += value(r);
    if (dealIds) b.deals.add(dealIds(r));
    else b.count++;
    m.set(k.key, b);
  }
  return [...m.values()].map(({ deals, ...b }) => ({ ...b, count: dealIds ? deals.size : b.count, value: Math.round(b.value) }));
}

/** The sales home: numbers first, a to-do list, then filterable charts. */
export async function homeMetrics(actor: Actor, f: DealListQuery) {
  assertPermission(actor, "home.view");
  const now = new Date();
  const fy = fiscalYearOf(now);
  const q = fiscalQuarterOf(now);
  const thisQ = quarterRange(fy, q);
  const thisFy = fiscalYearRange(fy);
  const today = todayDate(now);
  const filterWhere = await dealListWhere(actor, { ...f, stage: undefined, open: undefined });
  const scopeWhere = await dealWhere(actor);

  const [open, closedFy, targets, myApprovalsCount, myOpenRequests] = await Promise.all([
    db.deal.findMany({
      where: { AND: [filterWhere, { stage: { in: openStages } }] },
      select: { id: true, code: true, name: true, stage: true, forecastCategory: true, dealValue: true, expectedGmPct: true, expectedCloseDate: true, nextStep: true, nextStepDate: true, stageEnteredAt: true, owner: { select: { id: true, fullName: true } }, account: { select: { name: true } }, lines: { select: { lineValue: true, businessUnit: { select: { id: true, name: true, colourToken: true } }, subBusinessUnit: { select: { id: true, name: true } }, oem: { select: { id: true, name: true } } } } },
    }),
    db.deal.findMany({ where: { AND: [scopeWhere, { stage: { in: ["CLOSED_WON", "CLOSED_LOST"] }, closedAt: { gte: thisFy.from } }] }, select: { stage: true, dealValue: true, closedAt: true } }),
    (async () => {
      const ids = await visibleOwnerIds(actor);
      const rows = await db.salesTarget.findMany({ where: { fiscalYear: fy, ...(ids ? { userId: { in: ids } } : {}) }, select: { quarter: true, targetValue: true } });
      return { fy: rows.reduce((a, r) => a + toNumber(r.targetValue), 0), quarter: rows.filter((r) => r.quarter === q).reduce((a, r) => a + toNumber(r.targetValue), 0) };
    })(),
    db.dealApproval.count({ where: { status: "PENDING", steps: { some: { approverUserIds: { has: actor.id }, decision: null } }, deal: { deletedAt: null } } }),
    db.presalesRequest.findMany({ where: { requestedById: actor.id, status: { in: ["REQUESTED", "IN_PROGRESS"] }, dueDate: { lt: today }, deal: { deletedAt: null } }, select: { id: true, dueDate: true, deal: { select: { id: true, code: true, name: true } }, assignedTo: { select: { fullName: true } } } }),
  ]);
  const value = (d: { dealValue: Prisma.Decimal }) => toNumber(d.dealValue);
  const pipeline = open.filter((d) => d.stage !== "HOLD");
  const won = closedFy.filter((d) => d.stage === "CLOSED_WON");
  const lost = closedFy.filter((d) => d.stage === "CLOSED_LOST");
  const wonValue = won.reduce((a, d) => a + value(d), 0);
  const gmDeals = pipeline.filter((d) => d.expectedGmPct !== null);
  const commitQ = pipeline.filter((d) => d.forecastCategory === "COMMIT" && d.expectedCloseDate >= thisQ.from && d.expectedCloseDate <= thisQ.to);

  const lines = open.flatMap((d) => d.lines.map((l) => ({ ...l, dealId: d.id })));
  const lineValue = (l: { lineValue: Prisma.Decimal | null }) => toNumber(l.lineValue);
  const pastClose = pipeline.filter((d) => d.expectedCloseDate < today);
  const noNextStep = pipeline.filter((d) => !d.nextStep || (d.nextStepDate && d.nextStepDate < today));
  const dealRef = (d: (typeof open)[number]) => ({ id: d.id, code: d.code, name: d.name, account: d.account.name, owner: d.owner.fullName, stage: d.stage, stageLabel: STAGE_META[d.stage].label, dealValue: value(d), expectedCloseDate: d.expectedCloseDate, nextStep: d.nextStep, nextStepDate: d.nextStepDate });

  return {
    period: { fy: fyLabel(fy), quarter: `Q${q}`, quarterLabel: thisQ.label },
    kpis: {
      openPipeline: { value: Math.round(pipeline.reduce((a, d) => a + value(d), 0)), count: pipeline.length },
      commitThisQuarter: { value: Math.round(commitQ.reduce((a, d) => a + value(d), 0)), count: commitQ.length, target: Math.round(targets.quarter) },
      wonFytd: { value: Math.round(wonValue), count: won.length, target: Math.round(targets.fy) },
      winRate: { pct: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 1000) / 10 : null, won: won.length, lost: lost.length },
      avgGm: { pct: gmDeals.length ? Math.round((gmDeals.reduce((a, d) => a + toNumber(d.expectedGmPct), 0) / gmDeals.length) * 10) / 10 : null, count: gmDeals.length },
    },
    todo: {
      approvals: myApprovalsCount,
      pastClose: pastClose.sort((a, b) => a.expectedCloseDate.getTime() - b.expectedCloseDate.getTime()).slice(0, 6).map(dealRef),
      pastCloseCount: pastClose.length,
      nextStep: noNextStep.slice(0, 6).map(dealRef),
      nextStepCount: noNextStep.length,
      overdueRequests: myOpenRequests.map((r) => ({ id: r.id, dueDate: r.dueDate, deal: r.deal, assignedTo: r.assignedTo.fullName })),
    },
    charts: {
      byStage: openStages.map((s) => ({ key: s, label: STAGE_META[s].label, count: open.filter((d) => d.stage === s).length, value: Math.round(open.filter((d) => d.stage === s).reduce((a, d) => a + value(d), 0)) })),
      byForecast: (["COMMIT", "UPSIDE", "PIPELINE"] as const).map((k) => ({ key: k, label: k[0] + k.slice(1).toLowerCase(), count: pipeline.filter((d) => d.forecastCategory === k).length, value: Math.round(pipeline.filter((d) => d.forecastCategory === k).reduce((a, d) => a + value(d), 0)) })),
      byBusinessUnit: bucketise(lines, (l) => ({ key: l.businessUnit.id, label: l.businessUnit.name, colourToken: l.businessUnit.colourToken }), lineValue, (l) => l.dealId),
      bySubBusinessUnit: bucketise(lines, (l) => ({ key: l.subBusinessUnit.id, label: l.subBusinessUnit.name }), lineValue, (l) => l.dealId).sort((a, b) => b.value - a.value).slice(0, 12),
      byOem: bucketise(lines, (l) => ({ key: l.oem.id, label: l.oem.name }), lineValue, (l) => l.dealId).sort((a, b) => b.value - a.value).slice(0, 10),
      byOwner: actor.role === "SALES" ? [] : bucketise(pipeline, (d) => ({ key: d.owner.id, label: d.owner.fullName }), value).sort((a, b) => b.value - a.value),
    },
  };
}

/** Presales and purchase: what is on their plate, overdue first. */
export async function myWork(actor: Actor, forUserId?: string) {
  assertPermission(actor, "myWork.view");
  const userId = actor.role === "ADMIN" && forUserId ? forUserId : actor.id;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, role: true } });
  if (!user) return { user: null, open: [], done: [] };
  const today = todayDate();
  const kind = user.role === "PURCHASE" ? "pricing" : "presales";
  const include = { deal: { select: { id: true, code: true, name: true, stage: true, account: { select: { name: true } }, owner: { select: { fullName: true } }, _count: { select: { lines: true } } } }, requestedBy: { select: { fullName: true } } } as const;
  const rows = kind === "pricing"
    ? await db.pricingRequest.findMany({ where: { assignedToId: userId, deal: { deletedAt: null } }, include, orderBy: [{ dueDate: "asc" }], take: 200 })
    : await db.presalesRequest.findMany({ where: { assignedToId: userId, deal: { deletedAt: null } }, include, orderBy: [{ dueDate: "asc" }], take: 200 });
  const out = rows.map((r) => ({ ...r, kind, overdue: (r.status === "REQUESTED" || r.status === "IN_PROGRESS") && r.dueDate < today, dueToday: r.dueDate.getTime() === today.getTime(), stageLabel: STAGE_META[r.deal.stage].label, dealOpen: isOpen(r.deal.stage) }));
  const open = out.filter((r) => r.status === "REQUESTED" || r.status === "IN_PROGRESS").sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueDate.getTime() - b.dueDate.getTime());
  const done = out.filter((r) => !(r.status === "REQUESTED" || r.status === "IN_PROGRESS")).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 25);
  return { user, kind, open, done, counts: { open: open.length, overdue: open.filter((r) => r.overdue).length, notStarted: open.filter((r) => r.status === "REQUESTED").length } };
}
