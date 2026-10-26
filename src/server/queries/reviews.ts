import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { opportunityScope } from "@/lib/authz";
import { oppWhere, parseOppFilters, type SearchParams } from "@/lib/filters";
import { STAGE_META, FORECAST_LABEL, type StageKey, type ForecastKey } from "@/lib/constants";
import { toNumber } from "@/lib/format";

const DAY = 86_400_000;
const FC_RANK: Record<string, number> = { OMITTED: 0, PIPELINE: 1, UPSIDE: 2, COMMIT: 3 };

export type ReviewSnapshot = Record<string, { h: string; a: number; s: string }>;

export type OppChange = {
  id: string;
  code: string;
  name: string;
  account: string;
  owner: string;
  amount: number;
  stage: string;
  healthLabel: string;
  flags: string[];
  isNew: boolean;
  stageFrom?: string;
  stageTo?: string;
  stageDir?: "up" | "down" | "won" | "lost";
  amountFrom?: number;
  amountTo?: number;
  closeFrom?: string;
  closeTo?: string;
  closeDir?: "pushed" | "pulled";
  forecastFrom?: string;
  forecastTo?: string;
  healthFrom?: string;
  ownerChanged?: boolean;
  lastChangedAt: Date;
  changedBy: string[];
};

export async function reviewChanges(user: CurrentUser, sp: SearchParams, opts: { summaryOnly?: boolean } = {}) {
  // Baseline: the latest review that covered everyone (or, for a sales person, covered them)
  const reviews = (
    await db.pipelineReview.findMany({
      orderBy: { reviewedAt: "desc" },
      take: 50,
      select: { id: true, reviewedAt: true, notes: true, snapshot: true, subjectIds: true },
    })
  ).filter((r) => (user.role === "SALES" ? !r.subjectIds.length || r.subjectIds.includes(user.id) : !r.subjectIds.length));
  const sinceKey = typeof sp.since === "string" ? sp.since : undefined;
  let since: Date;
  let sinceLabel: string;
  let snapshot: ReviewSnapshot | null = null;
  const chosen = sinceKey ? reviews.find((r) => r.id === sinceKey) : undefined;
  if (sinceKey && /^\d+d$/.test(sinceKey)) {
    since = new Date(Date.now() - Number(sinceKey.slice(0, -1)) * DAY);
    sinceLabel = `last ${sinceKey.slice(0, -1)} days`;
  } else if (chosen) {
    since = chosen.reviewedAt;
    sinceLabel = "selected review";
    snapshot = (chosen.snapshot as ReviewSnapshot | null) ?? null;
  } else if (reviews[0]) {
    since = reviews[0].reviewedAt;
    sinceLabel = "your last review";
    snapshot = (reviews[0].snapshot as ReviewSnapshot | null) ?? null;
  } else {
    since = new Date(Date.now() - 7 * DAY);
    sinceLabel = "last 7 days";
  }

  const f = parseOppFilters(sp);
  const scope = { AND: [opportunityScope(user), oppWhere(f, { ignore: ["period"] })] };
  const opps = await db.opportunity.findMany({
    where: scope,
    select: {
      id: true, code: true, name: true, amount: true, stage: true, healthLabel: true, flags: true, createdAt: true,
      account: { select: { name: true } }, salesOwner: { select: { name: true } },
    },
  });
  const byId = new Map(opps.map((o) => [o.id, o]));
  const logs = await db.auditLog.findMany({
    where: { entityType: "Opportunity", changedAt: { gt: since }, entityId: { in: [...byId.keys()] } },
    orderBy: { changedAt: "asc" },
    select: { entityId: true, action: true, field: true, oldValue: true, newValue: true, changedAt: true, changedBy: { select: { name: true } } },
  });

  const map = new Map<string, OppChange>();
  const get = (id: string) => {
    let c = map.get(id);
    if (!c) {
      const o = byId.get(id)!;
      c = {
        id, code: o.code, name: o.name, account: o.account.name, owner: o.salesOwner.name, amount: toNumber(o.amount),
        stage: o.stage, healthLabel: o.healthLabel, flags: o.flags, isNew: false, lastChangedAt: since, changedBy: [],
      };
      map.set(id, c);
    }
    return c;
  };

  for (const l of logs) {
    const c = get(l.entityId);
    c.lastChangedAt = l.changedAt;
    if (l.changedBy && !c.changedBy.includes(l.changedBy.name)) c.changedBy.push(l.changedBy.name);
    if (l.action === "CREATE") c.isNew = true;
    if (l.action !== "UPDATE") continue;
    switch (l.field) {
      case "stage":
        if (c.stageFrom === undefined) c.stageFrom = l.oldValue ?? undefined;
        c.stageTo = l.newValue ?? undefined;
        break;
      case "amount":
        if (c.amountFrom === undefined) c.amountFrom = Number(l.oldValue);
        c.amountTo = Number(l.newValue);
        break;
      case "expectedCloseDate":
        if (c.closeFrom === undefined) c.closeFrom = l.oldValue ?? undefined;
        c.closeTo = l.newValue ?? undefined;
        break;
      case "forecastCategory":
        if (c.forecastFrom === undefined) c.forecastFrom = l.oldValue ?? undefined;
        c.forecastTo = l.newValue ?? undefined;
        break;
      case "salesOwnerId":
        c.ownerChanged = true;
        break;
      case "healthLabel":
        if (c.healthFrom === undefined && l.oldValue) c.healthFrom = l.oldValue;
        break;
    }
  }

  // Health movement against a legacy review snapshot (newer history comes from audited health changes)
  if (snapshot) {
    for (const o of opps) {
      const prev = snapshot[o.id];
      if (prev && prev.h !== o.healthLabel && o.healthLabel !== "CLOSED" && !map.get(o.id)?.healthFrom) get(o.id).healthFrom = prev.h;
    }
  }

  const items: OppChange[] = [];
  for (const c of map.values()) {
    if (c.stageFrom !== undefined && c.stageTo !== undefined) {
      if (c.stageFrom === c.stageTo) {
        c.stageFrom = c.stageTo = undefined;
      } else {
        const to = c.stageTo as StageKey;
        c.stageDir =
          to === "WON" ? "won" : to === "LOST" || to === "DROPPED" ? "lost" :
          to === "HOLD" ? "down" :
          STAGE_META[to].order > STAGE_META[c.stageFrom as StageKey].order ? "up" : "down";
      }
    }
    if (c.amountFrom !== undefined && c.amountFrom === c.amountTo) c.amountFrom = c.amountTo = undefined;
    if (c.closeFrom && c.closeTo) {
      if (c.closeFrom.slice(0, 10) === c.closeTo.slice(0, 10)) c.closeFrom = c.closeTo = undefined;
      else c.closeDir = new Date(c.closeTo) > new Date(c.closeFrom) ? "pushed" : "pulled";
    }
    if (c.forecastFrom && c.forecastFrom === c.forecastTo) c.forecastFrom = c.forecastTo = undefined;
    if (c.healthFrom && (c.healthFrom === c.healthLabel || c.healthLabel === "CLOSED")) c.healthFrom = undefined;
    const meaningful =
      c.isNew || c.stageDir || c.amountFrom !== undefined || c.closeDir || c.forecastFrom || c.healthFrom || c.ownerChanged;
    if (meaningful) items.push(c);
  }
  items.sort((a, b) => b.lastChangedAt.getTime() - a.lastChangedAt.getTime());

  const s = {
    total: items.length,
    created: items.filter((i) => i.isNew),
    advanced: items.filter((i) => i.stageDir === "up"),
    regressed: items.filter((i) => i.stageDir === "down"),
    won: items.filter((i) => i.stageDir === "won"),
    lost: items.filter((i) => i.stageDir === "lost"),
    valueUp: items.filter((i) => i.amountFrom !== undefined && i.amountTo! > i.amountFrom),
    valueDown: items.filter((i) => i.amountFrom !== undefined && i.amountTo! < i.amountFrom),
    pushed: items.filter((i) => i.closeDir === "pushed"),
    pulled: items.filter((i) => i.closeDir === "pulled"),
    upgraded: items.filter((i) => i.forecastFrom && FC_RANK[i.forecastTo!]! > FC_RANK[i.forecastFrom]!),
    downgraded: items.filter((i) => i.forecastFrom && FC_RANK[i.forecastTo!]! < FC_RANK[i.forecastFrom]!),
    newlyDying: items.filter((i) => i.healthFrom && i.healthLabel === "DYING"),
    newlyHot: items.filter((i) => i.healthFrom && i.healthLabel === "HOT"),
  };
  const sumAmt = (xs: OppChange[]) => xs.reduce((a, x) => a + x.amount, 0);
  const valueDelta = items.reduce((a, i) => a + (i.amountFrom !== undefined ? i.amountTo! - i.amountFrom : 0), 0);
  const summary = {
    total: s.total,
    created: { count: s.created.length, amount: sumAmt(s.created) },
    advanced: { count: s.advanced.length, amount: sumAmt(s.advanced) },
    regressed: { count: s.regressed.length, amount: sumAmt(s.regressed) },
    won: { count: s.won.length, amount: sumAmt(s.won) },
    lost: { count: s.lost.length, amount: sumAmt(s.lost) },
    valueUp: { count: s.valueUp.length },
    valueDown: { count: s.valueDown.length },
    valueDelta,
    pushed: { count: s.pushed.length, amount: sumAmt(s.pushed) },
    pulled: { count: s.pulled.length },
    upgraded: { count: s.upgraded.length },
    downgraded: { count: s.downgraded.length },
    newlyDying: { count: s.newlyDying.length, amount: sumAmt(s.newlyDying) },
    newlyHot: { count: s.newlyHot.length, amount: sumAmt(s.newlyHot) },
  };

  // Active pipeline value at the baseline, rebuilt from the audit log for the same scope and filters
  const ACTIVE = new Set(["IDENTIFIED", "QUALIFIED", "BOQ", "PROPOSAL", "NEGOTIATION"]);
  const firstOld = new Map<string, string | null>();
  for (const l of logs) {
    if (l.action !== "UPDATE" || (l.field !== "stage" && l.field !== "amount")) continue;
    const k = `${l.entityId}:${l.field}`;
    if (!firstOld.has(k)) firstOld.set(k, l.oldValue);
  }
  const createdInWindow = new Set(logs.filter((l) => l.action === "CREATE").map((l) => l.entityId));
  const pipelineAtReview = opps.reduce((a, o) => {
    if (o.createdAt > since || createdInWindow.has(o.id)) return a;
    const stage = firstOld.get(`${o.id}:stage`) ?? o.stage;
    const amount = firstOld.has(`${o.id}:amount`) ? Number(firstOld.get(`${o.id}:amount`)) : toNumber(o.amount);
    return ACTIVE.has(stage) ? a + amount : a;
  }, 0);

  return {
    since,
    sinceLabel,
    pipelineAtReview,
    hasSnapshot: !!snapshot,
    reviews: reviews.map((r) => ({ id: r.id, reviewedAt: r.reviewedAt, notes: r.notes })),
    summary,
    items: opts.summaryOnly ? items.slice(0, 6) : items,
  };
}

export function describeStage(s?: string) {
  return s ? STAGE_META[s as StageKey]?.label ?? s : "";
}
export function describeForecast(s?: string) {
  return s ? FORECAST_LABEL[s as ForecastKey] ?? s : "";
}
