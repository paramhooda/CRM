import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { opportunityScope } from "@/lib/authz";
import { oppWhere, parseOppFilters, type SearchParams } from "@/lib/filters";
import { toNumber } from "@/lib/format";
import { ensureRulesFresh } from "@/lib/opportunity-service";
import { hasLineFilter } from "@/lib/attribution";
import { attributeDeal, attributionLineSelect } from "./attributed";

export const SORTS: Record<string, (dir: "asc" | "desc") => Prisma.OpportunityOrderByWithRelationInput[]> = {
  amount: (d) => [{ amount: d }],
  close: (d) => [{ expectedCloseDate: d }],
  health: (d) => [{ healthScore: d }],
  stage: (d) => [{ stage: d }],
  updated: (d) => [{ updatedAt: d }],
  activity: (d) => [{ lastActivityAt: { sort: d, nulls: "first" } }],
  name: (d) => [{ name: d }],
  created: (d) => [{ createdAt: d }],
};

export const listSelect = {
  id: true, code: true, name: true, amount: true, arrAmount: true, stage: true, probability: true, forecastCategory: true,
  expectedCloseDate: true, closeDateSlipCount: true, lastActivityAt: true, healthLabel: true, healthScore: true, flags: true,
  revenueModel: true, accountType: true, createdAt: true, updatedAt: true, stageEnteredAt: true, nextStep: true,
  expectedMarginPct: true, dealRegStatus: true, procurementMode: true,
  account: { select: { id: true, name: true } },
  businessUnit: { select: { name: true } },
  category: { select: { name: true } },
  oem: { select: { name: true } },
  salesOwner: { select: { id: true, name: true } },
  presalesOwner: { select: { id: true, name: true } },
} as const;

export function serializeOpp<T extends { amount: unknown; arrAmount?: unknown; expectedMarginPct?: unknown }>(o: T) {
  return {
    ...o,
    amount: toNumber(o.amount),
    arrAmount: o.arrAmount === null || o.arrAmount === undefined ? null : toNumber(o.arrAmount),
    expectedMarginPct: o.expectedMarginPct === null || o.expectedMarginPct === undefined ? null : toNumber(o.expectedMarginPct),
  };
}

export async function listOpportunities(user: CurrentUser, sp: SearchParams, opts: { pageSize?: number; all?: boolean } = {}) {
  await ensureRulesFresh(db);
  const f = parseOppFilters(sp);
  const where: Prisma.OpportunityWhereInput = { AND: [opportunityScope(user), oppWhere(f)] };
  // default view hides closed deals unless a stage filter or "closed" toggle is set
  const showClosed = sp.closed === "1" || f.stage.length > 0 || f.status.some((x) => x !== "open");
  if (!showClosed) (where.AND as Prisma.OpportunityWhereInput[]).push({ stage: { notIn: ["WON", "LOST", "DROPPED"] } });
  const sortKey = typeof sp.sort === "string" && SORTS[sp.sort] ? sp.sort : "amount";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, total, agg] = await Promise.all([
    db.opportunity.findMany({
      where,
      select: listSelect,
      orderBy: [...SORTS[sortKey]!(dir), { id: "asc" }],
      ...(opts.all ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    }),
    db.opportunity.count({ where }),
    db.opportunity.aggregate({ where, _sum: { amount: true } }),
  ]);
  // With a BU / category / OEM filter each deal also carries its in-scope share ("Dell value"),
  // and the total is the sum of shares so mixed deals are not counted in full.
  let scoped: Map<string, number> | null = null;
  if (hasLineFilter(f)) {
    const all = await db.opportunity.findMany({
      where,
      select: { id: true, amount: true, businessUnit: { select: { name: true } }, category: { select: { name: true } }, oem: { select: { name: true } }, lineItems: attributionLineSelect },
    });
    scoped = new Map(all.map((o) => [o.id, attributeDeal(o, f).amount]));
  }
  return {
    rows: rows.map((r) => ({ ...serializeOpp(r), scopedAmount: scoped?.get(r.id) ?? null })),
    total,
    totalAmount: scoped ? [...scoped.values()].reduce((a, b) => a + b, 0) : toNumber(agg._sum.amount),
    dealTotalAmount: toNumber(agg._sum.amount),
    lineScoped: !!scoped,
    page,
    pageSize,
    sortKey,
    dir,
    showClosed,
  };
}

export type OppRow = Awaited<ReturnType<typeof listOpportunities>>["rows"][number];
