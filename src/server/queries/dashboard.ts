import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { opportunityScope } from "@/lib/authz";
import { oppWhere, parseOppFilters, type SearchParams } from "@/lib/filters";
import { ACTIVE_STAGES, STAGE_META, THRESHOLDS, type StageKey } from "@/lib/constants";
import { fiscalPeriod, fiscalYearRange, lastMonths, parsePeriodKey, quarterRange, periodLabel, fyLabel } from "@/lib/fiscal";
import { toNumber } from "@/lib/format";
import { FLAG_META, SEVERITY_RANK, type FlagCode } from "@/lib/rules/flags";
import { ensureRulesFresh } from "@/lib/opportunity-service";
import { reviewChanges } from "./reviews";
import { attribute, rollup, type AttrSlice } from "@/lib/attribution";
import { buildInsights } from "./insights";

const DAY = 86_400_000;

const oppSelect = {
  id: true, code: true, name: true, amount: true, arrAmount: true, stage: true, probability: true, forecastCategory: true,
  expectedCloseDate: true, closedAt: true, createdAt: true, stageEnteredAt: true, lastActivityAt: true, healthLabel: true,
  healthScore: true, flags: true, revenueModel: true, contractEndDate: true, dealRegExpiry: true, dealRegStatus: true,
  businessUnitId: true, nextStep: true,
  businessUnit: { select: { name: true } },
  category: { select: { name: true } },
  oem: { select: { name: true } },
  salesOwner: { select: { id: true, name: true } },
  account: { select: { id: true, name: true } },
  presalesOwnerId: true,
  closeDateSlipCount: true,
  accountType: true,
  lineItems: {
    select: {
      quantity: true, unitPrice: true, billingFrequency: true, termMonths: true,
      product: { select: { name: true, listPrice: true } },
      businessUnit: { select: { name: true } }, category: { select: { name: true } }, oem: { select: { name: true } },
    },
  },
} as const;

export async function getDashboard(user: CurrentUser, sp: SearchParams) {
  await ensureRulesFresh(db);
  const now = new Date();
  const f = parseOppFilters(sp);
  const scope = { AND: [opportunityScope(user), oppWhere(f, { ignore: ["period"] })] };
  const opps = (await db.opportunity.findMany({ where: scope, select: oppSelect })).map((o) => {
    const amount = toNumber(o.amount);
    // Line-level attribution: multi-OEM / multi-BU deals are split by line value
    const slices = attribute(
      { amount, businessUnit: o.businessUnit.name, category: o.category.name, oem: o.oem?.name ?? null },
      o.lineItems.map((l) => ({
        quantity: l.quantity, unitPrice: l.unitPrice, listPrice: l.product?.listPrice ?? null, billingFrequency: l.billingFrequency,
        termMonths: l.termMonths, businessUnit: l.businessUnit.name, category: l.category.name, oem: l.oem.name, product: l.product?.name ?? null,
      })),
    );
    return { ...o, amount, arrAmount: o.arrAmount === null ? null : toNumber(o.arrAmount), slices, lineItems: undefined };
  });
  type O = (typeof opps)[number];

  const cur = fiscalPeriod(now);
  const q = quarterRange(cur.fiscalYear, cur.quarter);
  const fy = fiscalYearRange(cur.fiscalYear);
  const period = parsePeriodKey(f.period, now);

  const isActive = (o: O) => ACTIVE_STAGES.includes(o.stage as StageKey);
  const inRange = (d: Date | null, r: { start: Date; end: Date }) => !!d && d >= r.start && d < r.end;
  const closeIn = (o: O, r: { start: Date; end: Date }) => inRange(o.expectedCloseDate, r);

  // The period filter narrows the open pipeline by expected close and bookings by close date.
  const openAll = opps.filter(isActive);
  const open = period ? openAll.filter((o) => closeIn(o, period)) : openAll;
  const won = opps.filter((o) => o.stage === "WON");
  const lost = opps.filter((o) => o.stage === "LOST");
  const bookingsRange = period ?? fy;
  const wonInRange = won.filter((o) => inRange(o.closedAt, bookingsRange));
  const wonQtd = won.filter((o) => inRange(o.closedAt, q));
  const sum = (xs: O[], k: (o: O) => number = (o) => o.amount) => xs.reduce((a, o) => a + k(o), 0);

  // targets (scoped to visible sales people)
  const salesIds = f.sales.length ? f.sales : user.role === "SALES" ? [user.id] : undefined;
  const targets = await db.salesTarget.findMany({
    where: { fiscalYear: { in: [cur.fiscalYear - 1, cur.fiscalYear] }, ...(salesIds ? { userId: { in: salesIds } } : {}) },
    select: { userId: true, fiscalYear: true, quarter: true, targetAmount: true },
  });
  const targetFor = (fyr: number, qtr?: number, userId?: string) =>
    targets
      .filter((t) => t.fiscalYear === fyr && (qtr === undefined || t.quarter === qtr) && (!userId || t.userId === userId))
      .reduce((a, t) => a + toNumber(t.targetAmount), 0);
  // Targets are per sales rep; they are meaningless under BU/category/OEM slices or for presales/purchase scope.
  const targetsApplicable =
    !f.bu.length && !f.cat.length && !f.oem.length && !f.atype.length && !f.rev.length && !f.presales.length &&
    user.role !== "PRESALES" && user.role !== "PURCHASE";
  const qTarget = targetsApplicable ? targetFor(cur.fiscalYear, cur.quarter) : 0;
  const fyTarget = targetsApplicable ? targetFor(cur.fiscalYear) : 0;

  const commitQ = openAll.filter((o) => o.forecastCategory === "COMMIT" && closeIn(o, q));
  const upsideQ = openAll.filter((o) => o.forecastCategory === "UPSIDE" && closeIn(o, q));

  const trailing = { start: new Date(now.getTime() - 365 * DAY), end: new Date(now.getTime() + DAY) };
  const won12 = won.filter((o) => inRange(o.closedAt, period ?? trailing));
  const lost12 = lost.filter((o) => inRange(o.closedAt, period ?? trailing));
  const winRate = won12.length + lost12.length ? (won12.length / (won12.length + lost12.length)) * 100 : null;
  const winRateValue = sum(won12) + sum(lost12) ? (sum(won12) / (sum(won12) + sum(lost12))) * 100 : null;
  const avgDeal = won12.length ? sum(won12) / won12.length : 0;
  const avgCycle = won12.length
    ? won12.reduce((a, o) => a + (o.closedAt!.getTime() - o.createdAt.getTime()) / DAY, 0) / won12.length
    : 0;
  const arrBooked = sum(wonInRange.filter((o) => o.revenueModel === "ARR"), (o) => o.arrAmount ?? 0);

  // ── charts ──
  const funnel = ACTIVE_STAGES.map((s) => {
    const xs = open.filter((o) => o.stage === s);
    return { stage: STAGE_META[s].label, key: s, count: xs.length, amount: sum(xs) };
  });

  const buNames = [...new Set(opps.flatMap((o) => o.slices.map((sl) => sl.businessUnit)))];
  const BU_ORDER = ["IT Infrastructure", "Cloud", "Services", "Cybersecurity"];
  buNames.sort((a, b) => BU_ORDER.indexOf(a) - BU_ORDER.indexOf(b));
  const byBu = buNames.map((bu) => {
    const part = (xs: O[]) => xs.reduce((a, o) => a + o.slices.filter((sl) => sl.businessUnit === bu).reduce((b, sl) => b + sl.amount, 0), 0);
    return {
      bu,
      Commit: part(open.filter((o) => o.forecastCategory === "COMMIT")),
      Upside: part(open.filter((o) => o.forecastCategory === "UPSIDE")),
      Pipeline: part(open.filter((o) => o.forecastCategory === "PIPELINE")),
      total: part(open),
      won: part(wonInRange),
    };
  });

  const months = lastMonths(12, now);
  const trend = months.map((m) => {
    const xs = won.filter((o) => inRange(o.closedAt, m));
    const p = fiscalPeriod(new Date(m.start.getTime() + 2 * DAY));
    return {
      month: m.label,
      won: sum(xs),
      target: targetsApplicable ? targetFor(p.fiscalYear, p.quarter) / 3 : 0,
      deals: xs.length,
    };
  });

  const reps = new Map<string, { id: string; name: string; won: number; open: number; weighted: number; commit: number; target: number; deals: number }>();
  for (const o of opps) {
    const r = reps.get(o.salesOwner.id) ?? { id: o.salesOwner.id, name: o.salesOwner.name, won: 0, open: 0, weighted: 0, commit: 0, target: 0, deals: 0 };
    if (o.stage === "WON" && inRange(o.closedAt, bookingsRange)) r.won += o.amount;
    if (isActive(o)) {
      r.open += o.amount;
      r.weighted += (o.amount * o.probability) / 100;
      r.deals++;
      if (o.forecastCategory === "COMMIT") r.commit += o.amount;
    }
    reps.set(o.salesOwner.id, r);
  }
  for (const r of reps.values()) r.target = targetsApplicable ? targetFor(cur.fiscalYear, undefined, r.id) : 0;
  const leaderboard = [...reps.values()].sort((a, b) => b.won - a.won || b.open - a.open);

  const agingBuckets = [
    { label: "0–30d", min: 0, max: 30 },
    { label: "31–60d", min: 31, max: 60 },
    { label: "61–90d", min: 61, max: 90 },
    { label: "91–180d", min: 91, max: 180 },
    { label: "180d+", min: 181, max: Infinity },
  ];
  const aging = agingBuckets.map((b) => {
    const xs = open.filter((o) => {
      const age = (now.getTime() - o.createdAt.getTime()) / DAY;
      return age >= b.min && age <= b.max;
    });
    return { bucket: b.label, count: xs.length, amount: sum(xs) };
  });

  const oemSorted = rollup(open.flatMap((o) => o.slices), "oem");
  const oemMix = oemSorted.slice(0, 7).map((r) => ({ name: r.key, amount: r.amount }));
  if (oemSorted.length > 7) oemMix.push({ name: "Other", amount: oemSorted.slice(7).reduce((a, r) => a + r.amount, 0) });

  const winByBu = buNames.map((bu) => {
    const w = won12.filter((o) => o.businessUnit.name === bu).length;
    const l = lost12.filter((o) => o.businessUnit.name === bu).length;
    return { bu, rate: w + l ? Math.round((w / (w + l)) * 100) : 0, won: w, lost: l };
  });

  const openWithHold = period ? opps.filter((o) => (isActive(o) || o.stage === "HOLD") && closeIn(o, period)) : opps.filter((o) => isActive(o) || o.stage === "HOLD");
  const health = (["HOT", "HEALTHY", "AT_RISK", "DYING"] as const).map((h) => {
    const xs = openWithHold.filter((o) => o.healthLabel === h);
    return { label: h, count: xs.length, amount: sum(xs) };
  });

  const revenueMix = {
    oneTime: sum(open.filter((o) => o.revenueModel === "ONE_TIME")),
    arr: sum(open.filter((o) => o.revenueModel === "ARR")),
    arrAnnual: sum(open.filter((o) => o.revenueModel === "ARR"), (o) => o.arrAmount ?? 0),
  };

  // ── panels ──
  const concernMap = new Map<FlagCode, { code: FlagCode; count: number; amount: number }>();
  for (const o of openWithHold) {
    for (const fl of o.flags as FlagCode[]) {
      if (!(fl in FLAG_META)) continue;
      const c = concernMap.get(fl) ?? { code: fl, count: 0, amount: 0 };
      c.count++;
      c.amount += o.amount;
      concernMap.set(fl, c);
    }
  }
  const concerns = [...concernMap.values()].sort(
    (a, b) => SEVERITY_RANK[FLAG_META[b.code].severity] - SEVERITY_RANK[FLAG_META[a.code].severity] || b.amount - a.amount,
  );

  const pick = (xs: O[]) =>
    xs.map((o) => ({
      id: o.id, code: o.code, name: o.name, account: o.account.name, amount: o.amount, stage: o.stage, healthLabel: o.healthLabel,
      healthScore: o.healthScore, flags: o.flags, owner: o.salesOwner.name, expectedCloseDate: o.expectedCloseDate,
      lastActivityAt: o.lastActivityAt, forecastCategory: o.forecastCategory, nextStep: o.nextStep,
    }));
  const hot = pick(openWithHold.filter((o) => o.healthLabel === "HOT").sort((a, b) => b.amount - a.amount).slice(0, 6));
  const dying = pick(openWithHold.filter((o) => o.healthLabel === "DYING").sort((a, b) => b.amount - a.amount).slice(0, 6));
  const closingSoon = pick(
    openAll
      .filter((o) => o.expectedCloseDate >= new Date(now.getTime() - DAY) && o.expectedCloseDate <= new Date(now.getTime() + 30 * DAY))
      .sort((a, b) => a.expectedCloseDate.getTime() - b.expectedCloseDate.getTime())
      .slice(0, 6),
  );

  const renewals = won
    .filter((o) => o.revenueModel === "ARR" && o.contractEndDate && o.contractEndDate > now && o.contractEndDate.getTime() - now.getTime() < THRESHOLDS.renewalWindowDays * DAY)
    .map((o) => ({ id: o.id, name: o.name, account: o.account.name, arr: o.arrAmount ?? 0, end: o.contractEndDate! }))
    .sort((a, b) => a.end.getTime() - b.end.getTime())
    .slice(0, 5);

  const [presalesOpen, pricingOpen, changes] = await Promise.all([
    db.presalesRequest.findMany({
      where: { status: { in: ["REQUESTED", "IN_PROGRESS"] }, opportunity: scope },
      select: { dueDate: true },
    }),
    db.pricingRequest.findMany({
      where: { status: { in: ["REQUESTED", "IN_PROGRESS"] }, opportunity: scope },
      select: { dueDate: true },
    }),
    reviewChanges(user, sp, { summaryOnly: true }),
  ]);
  const workflow = {
    presalesOpen: presalesOpen.length,
    presalesOverdue: presalesOpen.filter((r) => r.dueDate < now).length,
    pricingOpen: pricingOpen.length,
    pricingOverdue: pricingOpen.filter((r) => r.dueDate < now).length,
  };

  // ── Overview extras: sparklines, deltas, forecast, calendar, flow, bookings mix ──
  const monthly = months.map((m) => ({
    label: m.label,
    created: sum(opps.filter((o) => inRange(o.createdAt, m))),
    won: sum(won.filter((o) => inRange(o.closedAt, m))),
  }));
  const prevQ = cur.quarter === 1 ? { fiscalYear: cur.fiscalYear - 1, quarter: 4 } : { fiscalYear: cur.fiscalYear, quarter: cur.quarter - 1 };
  const prevRange = quarterRange(prevQ.fiscalYear, prevQ.quarter);
  const elapsed = now.getTime() - q.start.getTime();
  const wonPrevSamePoint = sum(won.filter((o) => inRange(o.closedAt, { start: prevRange.start, end: new Date(prevRange.start.getTime() + elapsed) })));
  const prior12 = { start: new Date(now.getTime() - 730 * DAY), end: new Date(now.getTime() - 365 * DAY) };
  const wP = won.filter((o) => inRange(o.closedAt, prior12)).length;
  const lP = lost.filter((o) => inRange(o.closedAt, prior12)).length;
  const winRatePrior = wP + lP ? (wP / (wP + lP)) * 100 : null;

  const nextQ = cur.quarter === 4 ? { fiscalYear: cur.fiscalYear + 1, quarter: 1 } : { fiscalYear: cur.fiscalYear, quarter: cur.quarter + 1 };
  const nq = quarterRange(nextQ.fiscalYear, nextQ.quarter);
  const forecastRows = [
    { label: periodLabel(cur), range: q, target: qTarget, fy: cur.fiscalYear, qtr: cur.quarter },
    { label: `Q${nextQ.quarter} ${fyLabel(nextQ.fiscalYear)}`, range: nq, target: targetsApplicable ? targetFor(nextQ.fiscalYear, nextQ.quarter) : 0, fy: nextQ.fiscalYear, qtr: nextQ.quarter },
  ].map((r) => ({
    label: r.label,
    target: r.target,
    won: sum(won.filter((o) => inRange(o.closedAt, r.range))),
    commit: sum(openAll.filter((o) => o.forecastCategory === "COMMIT" && closeIn(o, r.range))),
    upside: sum(openAll.filter((o) => o.forecastCategory === "UPSIDE" && closeIn(o, r.range))),
    pipeline: sum(openAll.filter((o) => o.forecastCategory === "PIPELINE" && closeIn(o, r.range))),
  }));

  const weekStart = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * DAY);
  weekStart.setUTCHours(0, 0, 0, 0);
  const closingCalendar = Array.from({ length: 8 }, (_, i) => {
    const r = { start: new Date(weekStart.getTime() + i * 7 * DAY), end: new Date(weekStart.getTime() + (i + 1) * 7 * DAY) };
    const xs = openAll.filter((o) => closeIn(o, r));
    return { week: i === 0 ? "This wk" : r.start.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }), amount: sum(xs), count: xs.length, commit: sum(xs.filter((o) => o.forecastCategory === "COMMIT")) };
  });
  const overdueOpen = sum(openAll.filter((o) => o.expectedCloseDate < now));

  const wonSlices: AttrSlice[] = wonInRange.flatMap((o) => o.slices);
  const bookingsMix = {
    bu: rollup(wonSlices, "businessUnit"),
    oem: rollup(wonSlices, "oem").slice(0, 8),
    product: rollup(wonSlices.filter((sl) => sl.product), "product").slice(0, 10),
    category: rollup(wonSlices, "category").slice(0, 8),
  };

  const insights = buildInsights({
    now, open: openAll, won12, lost12, won, opps,
    pipelineByBu: rollup(openAll.flatMap((o) => o.slices), "businessUnit"),
    bookingsByBu: rollup(won12.flatMap((o) => o.slices), "businessUnit"),
    renewals,
  });

  return {
    monthly,
    deltas: {
      pipelineSinceReview: changes.pipelineAtReview === null ? null : sum(openAll) - changes.pipelineAtReview,
      wonVsPrevQuarter: sum(wonQtd) - wonPrevSamePoint,
      wonPrevSamePoint,
      winRatePrior,
    },
    forecastRows,
    closingCalendar,
    overdueOpen,
    bookingsMix,
    insights,
    filters: f,
    periodLabel: period?.label ?? null,
    quarterLabel: periodLabel(cur),
    fyLabel: fyLabel(cur.fiscalYear),
    targetsApplicable,
    kpis: {
      openPipeline: sum(open),
      openCount: open.length,
      weighted: sum(open, (o) => (o.amount * o.probability) / 100),
      commitQ: sum(commitQ),
      upsideQ: sum(upsideQ),
      wonQtd: sum(wonQtd),
      qTarget,
      bookings: sum(wonInRange),
      bookingsCount: wonInRange.length,
      fyTarget,
      winRate,
      winRateValue,
      avgDeal,
      avgCycle,
      arrBooked,
      coverage: qTarget - sum(wonQtd) > 0 ? sum(openAll.filter((o) => closeIn(o, q))) / (qTarget - sum(wonQtd)) : null,
    },
    funnel, byBu, trend, leaderboard, aging, oemMix, winByBu, health, revenueMix,
    concerns, hot, dying, closingSoon, renewals, workflow, changes,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
