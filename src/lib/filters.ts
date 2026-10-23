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
  /** open | won | lost (lost includes dropped) */
  status: string[];
  /** Open-deal age bucket in days since creation: "0-30", "31-60", "181-" */
  age?: string;
  /** Created-date period key (same formats as period), e.g. M2026-08 */
  created?: string;
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
    status: list(sp.status).filter((x) => x === "open" || x === "won" || x === "lost"),
    age: one(sp.age),
    created: one(sp.created),
    period: one(sp.period),
    q: one(sp.q),
    account: one(sp.account),
    minAmt: Number.isFinite(min) && min > 0 ? min : undefined,
  };
}

export function activeFilterCount(f: OppFilters): number {
  return (
    [f.bu, f.cat, f.sales, f.presales, f.oem, f.stage, f.fc, f.health, f.atype, f.rev, f.flag, f.status].filter((x) => x.length)
      .length + (f.period ? 1 : 0) + (f.q ? 1 : 0) + (f.minAmt ? 1 : 0) + (f.age ? 1 : 0) + (f.created ? 1 : 0)
  );
}

/**
 * Build a Prisma where clause. `opts.ignore` lets a view drop dimensions it renders itself
 * (e.g. the pipeline board ignores the stage filter, the dashboard applies period separately).
 */
export function oppWhere(f: OppFilters, opts: { ignore?: (keyof OppFilters)[] } = {}): Prisma.OpportunityWhereInput {
  const ig = new Set(opts.ignore ?? []);
  const and: Prisma.OpportunityWhereInput[] = [];
  // BU, category and OEM live on line items: a deal matches when one of its lines matches all three.
  // Values are then narrowed to the matching lines (see scopeSlices) so mixed deals count only their share.
  const line: Prisma.OpportunityLineItemWhereInput = {};
  if (f.bu.length && !ig.has("bu")) line.businessUnitId = { in: f.bu };
  if (f.cat.length && !ig.has("cat")) line.categoryId = { in: f.cat };
  if (f.oem.length && !ig.has("oem")) line.oemId = { in: f.oem };
  if (Object.keys(line).length) and.push({ lineItems: { some: line } });
  if (f.sales.length && !ig.has("sales")) and.push({ salesOwnerId: { in: f.sales } });
  if (f.presales.length && !ig.has("presales")) and.push({ presalesOwnerId: { in: f.presales } });
  if (f.stage.length && !ig.has("stage")) and.push({ stage: { in: f.stage as never } });
  if (f.fc.length && !ig.has("fc")) and.push({ forecastCategory: { in: f.fc as never } });
  if (f.health.length && !ig.has("health")) and.push({ healthLabel: { in: f.health as never } });
  if (f.atype.length && !ig.has("atype")) and.push({ accountType: { in: f.atype as never } });
  if (f.rev.length && !ig.has("rev")) and.push({ revenueModel: { in: f.rev as never } });
  if (f.flag.length && !ig.has("flag")) and.push({ flags: { hasSome: f.flag } });
  if (f.status.length && !ig.has("status")) {
    const stages = f.status.flatMap((s) => STATUS_STAGES[s as keyof typeof STATUS_STAGES] ?? []);
    and.push({ stage: { in: stages as never } });
  }
  const age = parseAge(f.age);
  if (age && !ig.has("age")) {
    const now = Date.now();
    and.push({
      stage: { in: STATUS_STAGES.open as never },
      createdAt: { lte: new Date(now - age.min * DAY), ...(age.max !== null ? { gt: new Date(now - (age.max + 1) * DAY) } : {}) },
    });
  }
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
  if (f.created && !ig.has("created")) {
    const r = parsePeriodKey(f.created);
    if (r) and.push({ createdAt: { gte: r.start, lt: r.end } });
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

const DAY = 86_400_000;
const STATUS_STAGES = {
  open: ["IDENTIFIED", "QUALIFIED", "BOQ", "PROPOSAL", "NEGOTIATION"],
  won: ["WON"],
  lost: ["LOST", "DROPPED"],
} as const;
export const STATUS_LABEL: Record<string, string> = { open: "Open", won: "Won", lost: "Lost or dropped" };

/** "31-60" → {31, 60}; "181-" → {181, null} */
export function parseAge(v: string | undefined): { min: number; max: number | null } | null {
  const m = v ? /^(\d{1,4})-(\d{1,4})?$/.exec(v) : null;
  if (!m) return null;
  return { min: Number(m[1]), max: m[2] ? Number(m[2]) : null };
}

export function toQueryString(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const FILTER_KEYS = ["bu", "cat", "sales", "presales", "oem", "stage", "fc", "health", "atype", "rev", "flag", "status", "age", "created", "period", "q", "account", "minAmt"];

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

/**
 * Short name for an active BU / category / OEM filter, e.g. "Dell" or "Cloud · Dell, HPE".
 * Used to label in-scope values ("Dell value") and the "share of mixed deals" note. Null without a line filter.
 */
export function lineScopeLabel(
  f: Pick<OppFilters, "bu" | "cat" | "oem">,
  names: { bus: { id: string; name: string }[]; categories: { id: string; name: string }[]; oems: { id: string; name: string }[] },
): string | null {
  const pick = (ids: string[], xs: { id: string; name: string }[]) => {
    const n = ids.map((id) => xs.find((x) => x.id === id)?.name).filter(Boolean) as string[];
    return n.length > 2 ? `${n.length} ${xs === names.oems ? "OEMs" : xs === names.bus ? "BUs" : "categories"}` : n.join(", ");
  };
  const parts = [pick(f.bu, names.bus), pick(f.cat, names.categories), pick(f.oem, names.oems)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
