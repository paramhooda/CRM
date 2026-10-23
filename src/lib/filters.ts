// URL-driven filters shared by dashboard, pipeline, opportunity list and reports.
// Multi-value params are comma separated: ?bu=id1,id2&stage=BOQ,PROPOSAL
import type { Prisma } from "@prisma/client";
import { parsePeriodKey } from "./fiscal";

export type SearchParams = Record<string, string | string[] | undefined>;

export type OppFilters = {
  bu: string[];
  cat: string[];
  sales: string[];
  presales: string[];
  oem: string[];
  stage: string[];
  fc: string[];
  health: string[];
  atype: string[];
  rev: string[];
  flag: string[];
  period?: string;
  q?: string;
  account?: string;
  minAmt?: number;
};

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : (v ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function parseOppFilters(sp: SearchParams): OppFilters {
  const min = Number(one(sp.minAmt));
  return {
    bu: list(sp.bu),
    cat: list(sp.cat),
    sales: list(sp.sales),
    presales: list(sp.presales),
    oem: list(sp.oem),
    stage: list(sp.stage),
    fc: list(sp.fc),
    health: list(sp.health),
    atype: list(sp.atype),
    rev: list(sp.rev),
    flag: list(sp.flag),
    period: one(sp.period),
    q: one(sp.q),
    account: one(sp.account),
    minAmt: Number.isFinite(min) && min > 0 ? min : undefined,
  };
}

export function activeFilterCount(f: OppFilters): number {
  return (
    [f.bu, f.cat, f.sales, f.presales, f.oem, f.stage, f.fc, f.health, f.atype, f.rev, f.flag].filter((x) => x.length)
      .length + (f.period ? 1 : 0) + (f.q ? 1 : 0) + (f.minAmt ? 1 : 0)
  );
}

/**
 * Build a Prisma where clause. `opts.ignore` lets a view drop dimensions it renders itself
 * (e.g. the pipeline board ignores the stage filter, the dashboard applies period separately).
 */
export function oppWhere(f: OppFilters, opts: { ignore?: (keyof OppFilters)[] } = {}): Prisma.OpportunityWhereInput {
  const ig = new Set(opts.ignore ?? []);
  const and: Prisma.OpportunityWhereInput[] = [];
  // BU, category and OEM match the deal header or any of its line items (multi-OEM deals)
  if (f.bu.length && !ig.has("bu"))
    and.push({ OR: [{ businessUnitId: { in: f.bu } }, { lineItems: { some: { businessUnitId: { in: f.bu } } } }] });
  if (f.cat.length && !ig.has("cat"))
    and.push({ OR: [{ categoryId: { in: f.cat } }, { lineItems: { some: { categoryId: { in: f.cat } } } }] });
  if (f.sales.length && !ig.has("sales")) and.push({ salesOwnerId: { in: f.sales } });
  if (f.presales.length && !ig.has("presales")) and.push({ presalesOwnerId: { in: f.presales } });
  if (f.oem.length && !ig.has("oem"))
    and.push({ OR: [{ oemId: { in: f.oem } }, { lineItems: { some: { oemId: { in: f.oem } } } }] });
  if (f.stage.length && !ig.has("stage")) and.push({ stage: { in: f.stage as never } });
  if (f.fc.length && !ig.has("fc")) and.push({ forecastCategory: { in: f.fc as never } });
  if (f.health.length && !ig.has("health")) and.push({ healthLabel: { in: f.health as never } });
  if (f.atype.length && !ig.has("atype")) and.push({ accountType: { in: f.atype as never } });
  if (f.rev.length && !ig.has("rev")) and.push({ revenueModel: { in: f.rev as never } });
  if (f.flag.length && !ig.has("flag")) and.push({ flags: { hasSome: f.flag } });
  if (f.account && !ig.has("account")) and.push({ accountId: f.account });
  if (f.minAmt && !ig.has("minAmt")) and.push({ amount: { gte: f.minAmt } });
  if (f.q && !ig.has("q")) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { code: { contains: f.q, mode: "insensitive" } },
        { account: { name: { contains: f.q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.period && !ig.has("period")) {
    const r = parsePeriodKey(f.period);
    if (r) {
      and.push({
        OR: [
          { closedAt: null, expectedCloseDate: { gte: r.start, lt: r.end } },
          { closedAt: { gte: r.start, lt: r.end } },
        ],
      });
    }
  }
  return and.length ? { AND: and } : {};
}

export function toQueryString(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const FILTER_KEYS = ["bu", "cat", "sales", "presales", "oem", "stage", "fc", "health", "atype", "rev", "flag", "period", "q", "account", "minAmt"];

/** Build a link that keeps the current filters and overrides/adds some. */
export function withParams(sp: SearchParams, extra: Record<string, string | null>, path: string): string {
  const out = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = sp[k];
    const s = Array.isArray(v) ? v.join(",") : v;
    if (s) out.set(k, s);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v === null) out.delete(k);
    else out.set(k, v);
  }
  const q = out.toString();
  return q ? `${path}?${q}` : path;
}
