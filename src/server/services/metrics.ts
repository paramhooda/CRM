import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { accountWhere, assertPermission, dealWhere, leadWhere, visibleOwnerIds } from "../authz/scope";
import { activeRules, approvalStateFor, dealDetailInclude, dealFacts, dealListWhere, peopleFor, rulesMatchFor, todayDate, viewerFor } from "./deals";
import { nextActions } from "@/domain/workflow";
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

export type HomeWindow = "30" | "90" | "fy";
const IST_MS = 330 * 60_000;
/** yyyy-mm-dd of an instant on the Indian business day. */
const dayKey = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const startOfIstDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_MS + (d.getTime() + IST_MS >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 86_400_000 ? 86_400_000 : 0));
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};
const pctChange = (now: number, before: number) => (before === 0 ? (now === 0 ? 0 : null) : Math.round(((now - before) / before) * 1000) / 10);

/** The sales home: numbers with their trend, a to-do list, flows, splits and per-unit rows, over a window of days. */
export async function homeMetrics(actor: Actor, f: DealListQuery, window: HomeWindow = "30") {
  assertPermission(actor, "home.view");
  const now = new Date();
  const fy = fiscalYearOf(now);
  const q = fiscalQuarterOf(now);
  const thisQ = quarterRange(fy, q);
  const thisFy = fiscalYearRange(fy);
  const today = todayDate(now);
  const todayStart = startOfIstDay(now);
  const days = window === "fy" ? Math.max(1, Math.round((todayStart.getTime() - thisFy.from.getTime()) / 86_400_000) + 1) : Number(window);
  const since = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
  const prevSince = new Date(since.getTime() - days * 86_400_000);
  const dayKeys = Array.from({ length: days }, (_, i) => dayKey(new Date(since.getTime() + i * 86_400_000)));
  const filterWhere = await dealListWhere(actor, { ...f, stage: undefined, open: undefined });
  const scopeWhere = await dealWhere(actor);
  const ownerIds = await visibleOwnerIds(actor);

  const [open, closedFy, targets, myApprovalsCount, myOpenRequests, created, wonMoves, moves, approvalsWindow, accounts, leads] = await Promise.all([
    db.deal.findMany({
      where: { AND: [filterWhere, { stage: { in: openStages } }] },
      select: { id: true, code: true, name: true, stage: true, forecastCategory: true, dealValue: true, expectedGmPct: true, expectedCloseDate: true, nextStep: true, nextStepDate: true, stageEnteredAt: true, accountId: true, owner: { select: { id: true, fullName: true } }, account: { select: { name: true } }, lines: { select: { lineValue: true, lineCost: true, businessUnit: { select: { id: true, name: true, colourToken: true } }, subBusinessUnit: { select: { id: true, name: true } }, oem: { select: { id: true, name: true } } } } },
    }),
    db.deal.findMany({ where: { AND: [scopeWhere, { stage: { in: ["CLOSED_WON", "CLOSED_LOST"] }, closedAt: { gte: thisFy.from } }] }, select: { stage: true, dealValue: true, closedAt: true } }),
    (async () => {
      const rows = await db.salesTarget.findMany({ where: { fiscalYear: fy, ...(ownerIds ? { userId: { in: ownerIds } } : {}) }, select: { quarter: true, targetValue: true } });
      return { fy: rows.reduce((a, r) => a + toNumber(r.targetValue), 0), quarter: rows.filter((r) => r.quarter === q).reduce((a, r) => a + toNumber(r.targetValue), 0) };
    })(),
    db.dealApproval.count({ where: { status: "PENDING", steps: { some: { approverUserIds: { has: actor.id }, decision: null } }, deal: { deletedAt: null } } }),
    db.presalesRequest.findMany({ where: { requestedById: actor.id, status: { in: ["REQUESTED", "IN_PROGRESS"] }, dueDate: { lt: today }, deal: { deletedAt: null } }, select: { id: true, dueDate: true, deal: { select: { id: true, code: true, name: true } }, assignedTo: { select: { fullName: true } } } }),
    db.deal.findMany({ where: { AND: [filterWhere, { createdAt: { gte: prevSince } }] }, select: { id: true, createdAt: true, dealValue: true, expectedGmPct: true, lines: { select: { businessUnit: { select: { id: true } } } } } }),
    db.dealStageHistory.findMany({ where: { toStage: "CLOSED_WON", changedAt: { gte: prevSince }, deal: filterWhere }, select: { changedAt: true, dealValueAtChange: true, deal: { select: { lines: { select: { businessUnit: { select: { id: true } } } } } } } }),
    db.dealStageHistory.findMany({ where: { changedAt: { gte: since }, fromStage: { not: null }, deal: filterWhere }, select: { changedAt: true, fromStage: true, toStage: true } }),
    db.dealApproval.findMany({ where: { deal: scopeWhere, OR: [{ status: "PENDING" }, { decidedAt: { gte: since } }] }, select: { status: true } }),
    (async () => {
      const where = await accountWhere(actor);
      const [active, fresh] = await Promise.all([db.account.count({ where }), db.account.count({ where: { AND: [where, { createdAt: { gte: since } }] } })]);
      const contacts = await db.contact.count({ where: { deletedAt: null, account: where } });
      return { active, fresh, contacts };
    })(),
    (async () => {
      const where = await leadWhere(actor);
      const [fresh, converted] = await Promise.all([db.lead.count({ where: { AND: [where, { createdAt: { gte: since } }] } }), db.lead.count({ where: { AND: [where, { convertedAt: { gte: since } }] } })]);
      return { fresh, converted };
    })(),
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

  // Daily series over the window, and the same measure over the previous window for the delta
  const series = (keyOf: Iterable<{ day: string; v: number }>) => {
    const m = new Map(dayKeys.map((k) => [k, 0]));
    for (const { day, v } of keyOf) if (m.has(day)) m.set(day, m.get(day)! + v);
    return dayKeys.map((k) => m.get(k)!);
  };
  const inWindow = (d: Date) => d >= since;
  const createdNow = created.filter((d) => inWindow(d.createdAt));
  const createdBefore = created.filter((d) => !inWindow(d.createdAt));
  const wonNow = wonMoves.filter((w) => inWindow(w.changedAt));
  const wonBefore = wonMoves.filter((w) => !inWindow(w.changedAt));
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
  const avgGm = (xs: { expectedGmPct: Prisma.Decimal | null }[]) => {
    const g = xs.filter((x) => x.expectedGmPct !== null);
    return g.length ? sum(g, (x) => toNumber(x.expectedGmPct)) / g.length : null;
  };
  const gmNow = avgGm(createdNow);
  const gmBefore = avgGm(createdBefore);
  const daysIn = (d: { stageEnteredAt: Date }) => Math.max(0, Math.floor((now.getTime() - d.stageEnteredAt.getTime()) / 86_400_000));

  const forward = (m: { fromStage: Stage | null; toStage: Stage }) => STAGE_META[m.toStage].order > (m.fromStage ? STAGE_META[m.fromStage].order : 0) && isOpen(m.toStage);
  const heatOf = (rows: { changedAt: Date }[]) => {
    const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const r of rows) {
      const t = new Date(r.changedAt.getTime() + IST_MS);
      const d = (t.getUTCDay() + 6) % 7;
      cells[d]![t.getUTCHours()]! += 1;
    }
    return cells;
  };
  const weekAgo = new Date(todayStart.getTime() - 6 * 86_400_000);

  const buOf = (ls: { businessUnit: { id: string } }[]) => new Set(ls.map((l) => l.businessUnit.id));
  const bus = new Map<string, { id: string; name: string; colourToken: string }>();
  for (const l of lines) bus.set(l.businessUnit.id, l.businessUnit);
  const ageBuckets = [{ key: "0-7", label: "0–7 days", min: 0, max: 7 }, { key: "8-14", label: "8–14 days", min: 8, max: 14 }, { key: "15-30", label: "15–30 days", min: 15, max: 30 }, { key: "31-60", label: "31–60 days", min: 31, max: 60 }, { key: "60+", label: "Over 60 days", min: 61, max: Infinity }];
  const ageing = (ds: typeof pipeline) => ageBuckets.map((b) => { const xs = ds.filter((d) => daysIn(d) >= b.min && daysIn(d) <= b.max); return { key: b.key, label: b.label, count: xs.length, value: Math.round(sum(xs, value)) }; });

  return {
    period: { fy: fyLabel(fy), quarter: `Q${q}`, quarterLabel: thisQ.label },
    window: { key: window, days, from: dayKeys[0]!, to: dayKeys[dayKeys.length - 1]! },
    kpis: {
      openPipeline: { value: Math.round(sum(pipeline, value)), count: pipeline.length, series: series(createdNow.map((d) => ({ day: dayKey(d.createdAt), v: 1 }))), opened: createdNow.length, delta: pctChange(createdNow.length, createdBefore.length) },
      commitThisQuarter: { value: Math.round(sum(commitQ, value)), count: commitQ.length, target: Math.round(targets.quarter), series: series(commitQ.map((d) => ({ day: dayKey(d.expectedCloseDate), v: 1 }))) },
      wonFytd: { value: Math.round(wonValue), count: won.length, target: Math.round(targets.fy), series: series(wonNow.map((w) => ({ day: dayKey(w.changedAt), v: toNumber(w.dealValueAtChange) }))), wonInWindow: { count: wonNow.length, value: Math.round(sum(wonNow, (w) => toNumber(w.dealValueAtChange))) }, delta: pctChange(sum(wonNow, (w) => toNumber(w.dealValueAtChange)), sum(wonBefore, (w) => toNumber(w.dealValueAtChange))) },
      pastClose: { count: pastClose.length, value: Math.round(sum(pastClose, value)), series: series(pastClose.map((d) => ({ day: dayKey(d.expectedCloseDate), v: 1 }))) },
      winRate: { pct: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 1000) / 10 : null, won: won.length, lost: lost.length },
      avgGm: { pct: gmDeals.length ? Math.round((gmDeals.reduce((a, d) => a + toNumber(d.expectedGmPct), 0) / gmDeals.length) * 10) / 10 : null, count: gmDeals.length, delta: gmNow !== null && gmBefore !== null ? Math.round((gmNow - gmBefore) * 10) / 10 : null },
    },
    todo: {
      approvals: myApprovalsCount,
      pastClose: pastClose.sort((a, b) => a.expectedCloseDate.getTime() - b.expectedCloseDate.getTime()).slice(0, 6).map(dealRef),
      pastCloseCount: pastClose.length,
      nextStep: noNextStep.slice(0, 6).map(dealRef),
      nextStepCount: noNextStep.length,
      overdueRequests: myOpenRequests.map((r) => ({ id: r.id, dueDate: r.dueDate, deal: r.deal, assignedTo: r.assignedTo.fullName })),
    },
    flow: dayKeys.map((day) => ({
      day,
      created: createdNow.filter((d) => dayKey(d.createdAt) === day).length,
      won: wonNow.filter((w) => dayKey(w.changedAt) === day).length,
      createdValue: Math.round(sum(createdNow.filter((d) => dayKey(d.createdAt) === day), value)),
      wonValue: Math.round(sum(wonNow.filter((w) => dayKey(w.changedAt) === day), (w) => toNumber(w.dealValueAtChange))),
      advanced: moves.filter((m) => dayKey(m.changedAt) === day && forward(m)).length,
      setBack: moves.filter((m) => dayKey(m.changedAt) === day && !forward(m) && isOpen(m.toStage)).length,
      closed: moves.filter((m) => dayKey(m.changedAt) === day && !isOpen(m.toStage) && m.toStage !== "HOLD").length,
    })),
    heat: { week: heatOf(moves.filter((m) => m.changedAt >= weekAgo)), window: heatOf(moves), weekCount: moves.filter((m) => m.changedAt >= weekAgo).length, windowCount: moves.length },
    stagePerformance: OPEN_STAGES.map((s) => {
      const inStage = open.filter((d) => d.stage === s);
      return { stage: s, label: STAGE_META[s].label, open: inStage.length, value: Math.round(sum(inStage, value)), medianDays: median(inStage.map(daysIn)), movedOn: moves.filter((m) => m.fromStage === s && forward(m)).length, lostFromHere: moves.filter((m) => m.fromStage === s && (m.toStage === "CLOSED_LOST" || m.toStage === "DROPPED")).length, wonFromHere: moves.filter((m) => m.fromStage === s && m.toStage === "CLOSED_WON").length };
    }),
    ageing: { all: ageing(pipeline), pastClose: ageing(pastClose) },
    approvalsWindow: { pending: approvalsWindow.filter((a) => a.status === "PENDING").length, approved: approvalsWindow.filter((a) => a.status === "APPROVED").length, rejected: approvalsWindow.filter((a) => a.status === "REJECTED").length },
    businessUnits: [...bus.values()].sort((a, b) => a.name.localeCompare(b.name)).map((bu) => {
      const ds = pipeline.filter((d) => d.lines.some((l) => l.businessUnit.id === bu.id));
      const ls = lines.filter((l) => l.businessUnit.id === bu.id && pipeline.some((d) => d.id === l.dealId));
      const costed = ls.filter((l) => l.lineCost !== null && l.lineValue !== null);
      const gmValue = sum(costed, lineValue);
      return {
        id: bu.id, name: bu.name, colourToken: bu.colourToken,
        open: ds.length, value: Math.round(sum(ls, lineValue)),
        gmPct: gmValue ? Math.round(((gmValue - sum(costed, (l) => toNumber(l.lineCost))) / gmValue) * 1000) / 10 : null,
        pastClose: ds.filter((d) => d.expectedCloseDate < today).length,
        noNextStep: ds.filter((d) => !d.nextStep || (d.nextStepDate && d.nextStepDate < today)).length,
        opened: createdNow.filter((d) => buOf(d.lines).has(bu.id)).length,
        won: wonNow.filter((w) => buOf(w.deal.lines).has(bu.id)).length,
      };
    }),
    accounts: { active: accounts.active, withOpenDeals: new Set(pipeline.map((d) => d.accountId)).size, fresh: accounts.fresh, contacts: accounts.contacts, leadsNew: leads.fresh, leadsConverted: leads.converted },
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
  const include = { deal: { select: { id: true, code: true, name: true, stage: true, account: { select: { name: true } }, owner: { select: { fullName: true } }, _count: { select: { lines: true } }, lines: { select: { unitPurchaseCost: true, oem: { select: { isOwnIp: true } } } } } }, requestedBy: { select: { fullName: true } } } as const;
  /** One line of plain guidance per request, so the queue says what is left to do. */
  const todo = (r: { status: string; deal: { stage: string; lines: { unitPurchaseCost: unknown; oem: { isOwnIp: boolean } }[] } }) => {
    if (r.deal.stage === "HOLD") return "Deal on hold";
    if (r.status === "REQUESTED") return "Not started";
    if (kind === "presales") return r.deal.lines.length === 0 ? "No lines yet: build the BOQ" : "Refine the lines, then submit the BOQ";
    const n = r.deal.lines.filter((l) => !l.oem.isOwnIp && l.unitPurchaseCost === null).length;
    return n === 0 ? "All lines costed: complete pricing" : `${n} line${n === 1 ? "" : "s"} to cost`;
  };
  const rows = kind === "pricing"
    ? await db.pricingRequest.findMany({ where: { assignedToId: userId, deal: { deletedAt: null } }, include, orderBy: [{ dueDate: "asc" }], take: 200 })
    : await db.presalesRequest.findMany({ where: { assignedToId: userId, deal: { deletedAt: null } }, include, orderBy: [{ dueDate: "asc" }], take: 200 });
  const out = rows.map((r) => ({ ...r, kind, todo: todo(r), overdue: (r.status === "REQUESTED" || r.status === "IN_PROGRESS") && r.dueDate < today, dueToday: r.dueDate.getTime() === today.getTime(), stageLabel: STAGE_META[r.deal.stage].label, dealOpen: isOpen(r.deal.stage) }));
  const open = out.filter((r) => r.status === "REQUESTED" || r.status === "IN_PROGRESS").sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueDate.getTime() - b.dueDate.getTime());
  const done = out.filter((r) => !(r.status === "REQUESTED" || r.status === "IN_PROGRESS")).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 25);
  return { user, kind, open, done, counts: { open: open.length, overdue: open.filter((r) => r.overdue).length, notStarted: open.filter((r) => r.status === "REQUESTED").length } };
}

export type MyAction = { id: string; code: string; name: string; account: string; stage: Stage; owner: string; step: string; action: string | null; headline: string; due: string | null; overdue: boolean };

/**
 * What needs the signed-in person right now: every live deal in their scope whose current step is theirs
 * (their own deals, the requests assigned to them, the approvals waiting on them), overdue first. For a manager,
 * steps that belong to a team member count separately as "waiting on your team".
 */
export async function myActions(actor: Actor): Promise<{ rows: MyAction[]; count: number; team: number }> {
  const deals = await db.deal.findMany({ where: { AND: [await dealWhere(actor), { stage: { in: openStages } }] }, include: dealDetailInclude, orderBy: { updatedAt: "desc" }, take: 400 });
  const rules = await activeRules();
  const today = todayDate();
  const rows: MyAction[] = [];
  let team = 0;
  for (const deal of deals) {
    const matched = rulesMatchFor(deal, rules);
    const facts = dealFacts(deal, approvalStateFor(deal, rules), matched.map((m) => m.rule.name));
    const viewer = await viewerFor(actor, deal);
    const people = peopleFor(deal);
    const next = nextActions(facts, viewer, people);
    const cur = next.steps.find((s) => s.current);
    if (!cur) continue;
    const someoneElsesDeal = cur.owner === "SALES" && deal.ownerId !== actor.id;
    if (someoneElsesDeal && cur.mine) team++;
    if (!cur.mine || someoneElsesDeal) continue;
    const due = cur.owner === "PRESALES" ? people.presalesDue : cur.owner === "PURCHASE" ? people.pricingDue : cur.owner === "SALES" ? (deal.nextStepDate ?? deal.expectedCloseDate).toISOString().slice(0, 10) : null;
    rows.push({ id: deal.id, code: deal.code, name: deal.name, account: deal.account.name, stage: deal.stage, owner: deal.owner.fullName, step: cur.label, action: cur.action ?? null, headline: next.headline, due, overdue: !!due && new Date(due) < today });
  }
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  return { rows: rows.slice(0, 50), count: rows.length, team };
}
