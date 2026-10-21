import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { opportunityScope } from "@/lib/authz";
import { oppWhere, parseOppFilters, type SearchParams } from "@/lib/filters";
import { ACTIVE_STAGES, STAGE_META, type StageKey } from "@/lib/constants";
import { fiscalPeriod, quarterRange, parsePeriodKey, fyLabel } from "@/lib/fiscal";
import { toNumber } from "@/lib/format";

const DAY = 86_400_000;

export async function getReports(user: CurrentUser, sp: SearchParams) {
  const now = new Date();
  const f = parseOppFilters(sp);
  const scope = { AND: [opportunityScope(user), oppWhere(f, { ignore: ["period"] })] };
  const opps = (
    await db.opportunity.findMany({
      where: scope,
      select: {
        id: true, amount: true, stage: true, probability: true, forecastCategory: true, expectedCloseDate: true, closedAt: true,
        createdAt: true, lossReason: true, competitors: true, accountType: true, healthLabel: true, revenueModel: true,
        businessUnit: { select: { name: true } }, category: { select: { name: true } },
        salesOwner: { select: { id: true, name: true } },
        stageHistory: { select: { toStage: true, changedAt: true }, orderBy: { changedAt: "asc" } },
      },
    })
  ).map((o) => ({ ...o, amount: toNumber(o.amount) }));
  type O = (typeof opps)[number];
  const cur = fiscalPeriod(now);
  const period = parsePeriodKey(f.period, now) ?? { start: new Date(now.getTime() - 365 * DAY), end: new Date(now.getTime() + DAY), label: "Trailing 12 months" };
  const inP = (d: Date | null) => !!d && d >= period.start && d < period.end;
  const sum = (xs: O[]) => xs.reduce((a, o) => a + o.amount, 0);
  const won = opps.filter((o) => o.stage === "WON" && inP(o.closedAt));
  const lost = opps.filter((o) => (o.stage === "LOST" || o.stage === "DROPPED") && inP(o.closedAt));
  const open = opps.filter((o) => ACTIVE_STAGES.includes(o.stage as StageKey));

  // Loss reasons
  const lossMap = new Map<string, { count: number; amount: number }>();
  for (const o of lost) {
    const k = o.lossReason ?? "Not specified";
    const x = lossMap.get(k) ?? { count: 0, amount: 0 };
    x.count++;
    x.amount += o.amount;
    lossMap.set(k, x);
  }
  const lossReasons = [...lossMap.entries()].map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.amount - a.amount);

  const rate = (w: O[], l: O[]) => (w.length + l.length ? Math.round((w.length / (w.length + l.length)) * 100) : null);
  const byAccountType = (["NEW_LOGO", "EXISTING"] as const).map((t) => ({
    type: t,
    rate: rate(won.filter((o) => o.accountType === t), lost.filter((o) => o.accountType === t)),
    won: sum(won.filter((o) => o.accountType === t)),
    count: won.filter((o) => o.accountType === t).length,
  }));
  const compMap = new Map<string, { w: number; l: number }>();
  for (const o of [...won, ...lost]) {
    if (!o.competitors) continue;
    const x = compMap.get(o.competitors) ?? { w: 0, l: 0 };
    if (o.stage === "WON") x.w++;
    else x.l++;
    compMap.set(o.competitors, x);
  }
  const competitors = [...compMap.entries()].map(([name, v]) => ({ name, ...v, rate: Math.round((v.w / (v.w + v.l)) * 100) })).sort((a, b) => b.w + b.l - (a.w + a.l));

  // Forecast vs target per quarter of current FY
  const targets = await db.salesTarget.findMany({
    where: { fiscalYear: cur.fiscalYear, ...(f.sales.length ? { userId: { in: f.sales } } : user.role === "SALES" ? { userId: user.id } : {}) },
  });
  const targetsApplicable = !f.bu.length && !f.cat.length && !f.oem.length && !f.atype.length && !f.rev.length;
  const quarters = [1, 2, 3, 4].map((q) => {
    const r = quarterRange(cur.fiscalYear, q);
    const w = opps.filter((o) => o.stage === "WON" && o.closedAt && o.closedAt >= r.start && o.closedAt < r.end);
    const inQ = open.filter((o) => o.expectedCloseDate >= r.start && o.expectedCloseDate < r.end);
    return {
      label: `Q${q}`,
      current: q === cur.quarter,
      past: r.end <= now,
      target: targetsApplicable ? targets.filter((t) => t.quarter === q).reduce((a, t) => a + toNumber(t.targetAmount), 0) : 0,
      won: sum(w),
      commit: sum(inQ.filter((o) => o.forecastCategory === "COMMIT")),
      upside: sum(inQ.filter((o) => o.forecastCategory === "UPSIDE")),
      pipeline: sum(inQ.filter((o) => o.forecastCategory === "PIPELINE")),
    };
  });

  // Stage velocity & conversion (from stage history)
  const stageDays = new Map<string, number[]>();
  const reached = new Map<string, number>();
  for (const o of opps) {
    const seen = new Set<string>();
    o.stageHistory.forEach((h, i) => {
      seen.add(h.toStage);
      const next = o.stageHistory[i + 1];
      const end = next?.changedAt ?? (o.closedAt ? o.closedAt : now);
      if (ACTIVE_STAGES.includes(h.toStage as StageKey) && next) {
        const arr = stageDays.get(h.toStage) ?? [];
        arr.push((end.getTime() - h.changedAt.getTime()) / DAY);
        stageDays.set(h.toStage, arr);
      }
    });
    if (o.stage === "WON") seen.add("WON");
    for (const s of seen) reached.set(s, (reached.get(s) ?? 0) + 1);
  }
  const velocity = ACTIVE_STAGES.map((s) => {
    const d = stageDays.get(s) ?? [];
    return { stage: STAGE_META[s].label, key: s, avgDays: d.length ? Math.round(d.reduce((a, x) => a + x, 0) / d.length) : 0, samples: d.length, benchmark: STAGE_META[s].staleAfterDays };
  });
  const funnelStages = [...ACTIVE_STAGES, "WON"] as StageKey[];
  const conversion = funnelStages.slice(0, -1).map((s, i) => {
    const from = reached.get(s) ?? 0;
    const to = reached.get(funnelStages[i + 1]!) ?? 0;
    return { from: STAGE_META[s].label, to: STAGE_META[funnelStages[i + 1]!].label, rate: from ? Math.round((to / from) * 100) : 0, n: from };
  });

  // BU x Category matrix
  const cats = await db.category.findMany({ where: { active: true }, include: { businessUnit: true }, orderBy: [{ businessUnit: { sortOrder: "asc" } }, { sortOrder: "asc" }] });
  const matrix = cats.map((c) => {
    const xs = opps.filter((o) => o.category.name === c.name && o.businessUnit.name === c.businessUnit.name);
    const w = xs.filter((o) => o.stage === "WON" && inP(o.closedAt));
    const l = xs.filter((o) => (o.stage === "LOST" || o.stage === "DROPPED") && inP(o.closedAt));
    return {
      bu: c.businessUnit.name, category: c.name,
      open: sum(xs.filter((o) => ACTIVE_STAGES.includes(o.stage as StageKey))),
      openCount: xs.filter((o) => ACTIVE_STAGES.includes(o.stage as StageKey)).length,
      won: sum(w), winRate: rate(w, l),
    };
  });

  // Rep scorecard
  const reps = new Map<string, { id: string; name: string; open: number; weighted: number; commit: number; won: number; wonN: number; lostN: number; dying: number; deals: number; target: number }>();
  for (const o of opps) {
    const r = reps.get(o.salesOwner.id) ?? { id: o.salesOwner.id, name: o.salesOwner.name, open: 0, weighted: 0, commit: 0, won: 0, wonN: 0, lostN: 0, dying: 0, deals: 0, target: 0 };
    if (ACTIVE_STAGES.includes(o.stage as StageKey)) {
      r.open += o.amount; r.weighted += (o.amount * o.probability) / 100; r.deals++;
      if (o.forecastCategory === "COMMIT") r.commit += o.amount;
      if (o.healthLabel === "DYING") r.dying++;
    }
    if (o.stage === "WON" && inP(o.closedAt)) { r.won += o.amount; r.wonN++; }
    if ((o.stage === "LOST" || o.stage === "DROPPED") && inP(o.closedAt)) r.lostN++;
    reps.set(o.salesOwner.id, r);
  }
  const allTargets = await db.salesTarget.findMany({ where: { fiscalYear: cur.fiscalYear } });
  for (const r of reps.values()) r.target = targetsApplicable ? allTargets.filter((t) => t.userId === r.id).reduce((a, t) => a + toNumber(t.targetAmount), 0) : 0;

  return {
    periodLabel: period.label,
    fy: fyLabel(cur.fiscalYear),
    targetsApplicable,
    totals: { won: sum(won), wonN: won.length, lost: sum(lost), lostN: lost.length, winRate: rate(won, lost), open: sum(open) },
    lossReasons, byAccountType, competitors, quarters, velocity, conversion, matrix,
    reps: [...reps.values()].sort((a, b) => b.won - a.won || b.open - a.open),
  };
}
