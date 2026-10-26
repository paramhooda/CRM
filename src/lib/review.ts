// Pipeline review engine (pure, unit-tested). Modelled on Salesforce Pipeline Inspection:
// rebuild each deal as it stood at a baseline from the audit log, then show what changed, what needs
// raising in the call, and how each sales person is doing.
import { STAGE_META, FORECAST_LABEL, HEALTH_LABEL, THRESHOLDS, type StageKey, type ForecastKey, type HealthKey } from "./constants";
import { inr, fmtDate } from "./format";

const DAY = 86_400_000;
export const ACTIVE: StageKey[] = ["IDENTIFIED", "QUALIFIED", "BOQ", "PRICING", "PROPOSAL", "NEGOTIATION"];
const FC_RANK: Record<string, number> = { OMITTED: 0, PIPELINE: 1, UPSIDE: 2, COMMIT: 3 };

// ───────────── Windows and baselines ─────────────

export const SINCE_OPTIONS = [
  { key: "last", label: "Last review" },
  { key: "7d", label: "7 days" },
  { key: "14d", label: "14 days" },
  { key: "30d", label: "30 days" },
  { key: "qtd", label: "Quarter start" },
] as const;
export type SinceKey = (typeof SINCE_OPTIONS)[number]["key"];
export const parseSince = (v: unknown): SinceKey => (SINCE_OPTIONS.some((o) => o.key === v) ? (v as SinceKey) : "last");

export type ReviewRef = { id: string; reviewedAt: Date; subjectIds: string[] };

/** Latest review whose scope included this person (an everyone-review, i.e. empty subjectIds, covers all). */
export function lastReviewFor(personId: string, reviews: ReviewRef[]): ReviewRef | null {
  let best: ReviewRef | null = null;
  for (const r of reviews) {
    if (r.subjectIds.length && !r.subjectIds.includes(personId)) continue;
    if (!best || r.reviewedAt > best.reviewedAt) best = r;
  }
  return best;
}

/** Baseline date for one person. "last" falls back to 7 days when they have never been reviewed. */
export function baselineFor(
  personId: string,
  since: SinceKey,
  reviews: ReviewRef[],
  now: Date,
  quarterStart: Date,
): { date: Date; label: string; reviewId: string | null } {
  if (since === "qtd") return { date: quarterStart, label: "quarter start", reviewId: null };
  if (since !== "last") {
    const days = Number(since.slice(0, -1));
    return { date: new Date(now.getTime() - days * DAY), label: `last ${days} days`, reviewId: null };
  }
  const r = lastReviewFor(personId, reviews);
  if (r) return { date: r.reviewedAt, label: "last review", reviewId: r.id };
  return { date: new Date(now.getTime() - 7 * DAY), label: "last 7 days (not reviewed yet)", reviewId: null };
}

// ───────────── Reconstruction ─────────────

export type AuditRow = { field: string | null; action: string; oldValue: string | null; newValue: string | null; changedAt: Date; by: string | null };

export type ReviewDeal = {
  id: string;
  code: string;
  name: string;
  account: string;
  ownerId: string;
  owner: string;
  stage: string;
  amount: number;
  probability: number;
  expectedCloseDate: Date;
  forecastCategory: string;
  healthLabel: string;
  healthScore: number;
  flags: string[];
  createdAt: Date;
  closedAt: Date | null;
  lastActivityAt: Date | null;
  nextStep: string | null;
  nextStepDate: Date | null;
  submissionDueDate: Date | null;
  dealRegExpiry: Date | null;
  dealRegStatus: string;
  closeDateSlipCount: number;
  lossReason: string | null;
  procurementMode: string;
};

type Change<T> = { from: T; to: T } | null;

export type Reconstruction = {
  isNew: boolean;
  stage: Change<string>;
  stageDir: "up" | "down" | "won" | "lost" | null;
  amount: Change<number>;
  close: Change<string>; // ISO dates (yyyy-mm-dd)
  forecast: Change<string>;
  health: Change<string>;
  ownerChanged: boolean;
  /** Close-date pushes (later dates) inside the window */
  pushes: number;
  changed: boolean;
  lastChangeAt: Date | null;
  changedBy: string[];
  /** State at the baseline (null for deals created after it) */
  start: { stage: string; amount: number; close: string; forecast: string; health: string } | null;
};

const isoDay = (v: string | Date) => (typeof v === "string" ? v : v.toISOString()).slice(0, 10);

/**
 * Rebuild a deal as it stood at `baseline`. `audits` are this deal's audit rows (any order); only rows
 * after the baseline count. The first change of each field in the window holds its value at the baseline.
 */
export function reconstruct(deal: ReviewDeal, audits: AuditRow[], baseline: Date): Reconstruction {
  const rows = audits.filter((a) => a.changedAt > baseline).sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  const isNew = deal.createdAt > baseline || rows.some((r) => r.action === "CREATE");
  const first = (field: string) => rows.find((r) => r.action === "UPDATE" && r.field === field);
  const startOf = <T>(field: string, now: T, parse: (s: string) => T): T => {
    const r = first(field);
    return r && r.oldValue !== null ? parse(r.oldValue) : now;
  };
  const start = {
    stage: startOf("stage", deal.stage, (s) => s),
    amount: startOf("amount", deal.amount, Number),
    close: startOf("expectedCloseDate", isoDay(deal.expectedCloseDate), isoDay),
    forecast: startOf("forecastCategory", deal.forecastCategory, (s) => s),
    health: startOf("healthLabel", deal.healthLabel, (s) => s),
  };
  const nowClose = isoDay(deal.expectedCloseDate);
  const pushes = rows.filter(
    (r) => r.action === "UPDATE" && r.field === "expectedCloseDate" && r.oldValue && r.newValue && new Date(r.newValue).getTime() - new Date(r.oldValue).getTime() > DAY,
  ).length;
  const ch = <T>(from: T, to: T, same = from === to): Change<T> => (isNew || same ? null : { from, to });
  const stage = ch(start.stage, deal.stage);
  const amount = ch(start.amount, deal.amount, Math.round(start.amount) === Math.round(deal.amount));
  const close = ch(start.close, nowClose);
  const forecast = ch(start.forecast, deal.forecastCategory);
  const health = deal.healthLabel === "CLOSED" ? null : ch(start.health, deal.healthLabel);
  let stageDir: Reconstruction["stageDir"] = null;
  if (stage) {
    const to = stage.to as StageKey;
    stageDir =
      to === "WON" ? "won" : to === "LOST" || to === "DROPPED" ? "lost" : to === "HOLD" ? "down" :
      (STAGE_META[to]?.order ?? 0) > (STAGE_META[stage.from as StageKey]?.order ?? 0) ? "up" : "down";
  }
  const ownerChanged = rows.some((r) => r.field === "salesOwnerId");
  const changedBy = [...new Set(rows.map((r) => r.by).filter((x): x is string => !!x))];
  return {
    isNew,
    stage,
    stageDir,
    amount,
    close,
    forecast,
    health,
    ownerChanged,
    pushes,
    changed: isNew || !!(stage || amount || close || forecast || health || ownerChanged),
    lastChangeAt: rows.length ? rows[rows.length - 1]!.changedAt : null,
    changedBy,
    start: isNew ? null : start,
  };
}

// ───────────── Deal insights (chips) ─────────────

export type Tone = "red" | "amber" | "green" | "blue" | "slate";
export type Insight = { code: string; label: string; tone: Tone; rank: number };

const daysFrom = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);

/** Salesforce-style deal insights: what is wrong (or good) about this deal right now and in the window. */
export function dealInsights(d: ReviewDeal, rec: Reconstruction, now: Date): Insight[] {
  const out: Insight[] = [];
  const open = ACTIVE.includes(d.stage as StageKey) || d.stage === "HOLD";
  if (open) {
    if (d.expectedCloseDate < now) out.push({ code: "CLOSE_PASSED", label: `Close date passed ${daysFrom(d.expectedCloseDate, now)}d`, tone: "red", rank: 100 });
    if (d.submissionDueDate && ["IDENTIFIED", "QUALIFIED", "BOQ", "PRICING"].includes(d.stage)) {
      const dd = Math.ceil((d.submissionDueDate.getTime() - now.getTime()) / DAY);
      if (dd < 0) out.push({ code: "BID_MISSED", label: `Bid date passed ${-dd}d`, tone: "red", rank: 95 });
      else if (dd <= 3) out.push({ code: "BID_DUE", label: dd === 0 ? "Bid due today" : `Bid due in ${dd}d`, tone: "red", rank: 90 });
    }
    if (d.flags.includes("COMMIT_AT_RISK")) out.push({ code: "COMMIT_AT_RISK", label: "Commit at risk", tone: "red", rank: 88 });
    if (d.nextStepDate && d.nextStepDate < now && daysFrom(d.nextStepDate, now) >= 1)
      out.push({ code: "NEXT_STEP_OVERDUE", label: `Next step overdue ${daysFrom(d.nextStepDate, now)}d`, tone: "red", rank: 80 });
    if (d.flags.includes("NO_ACTIVITY")) out.push({ code: "NO_ACTIVITY", label: `No activity ${d.lastActivityAt ? daysFrom(d.lastActivityAt, now) : "—"}d`, tone: "red", rank: 75 });
    if (rec.pushes > 0) out.push({ code: "PUSHED", label: rec.pushes > 1 ? `Pushed ${rec.pushes}× in window` : "Close date pushed", tone: "amber", rank: 70 });
    else if (d.closeDateSlipCount >= THRESHOLDS.slipCountConcern) out.push({ code: "SLIPPED", label: `Slipped ${d.closeDateSlipCount}× overall`, tone: "amber", rank: 65 });
    if (d.flags.includes("PRESALES_OVERDUE")) out.push({ code: "BOQ_OVERDUE", label: "BOQ overdue", tone: "amber", rank: 62 });
    if (d.flags.includes("PRICING_PENDING")) out.push({ code: "PRICING_OVERDUE", label: "Pricing overdue", tone: "amber", rank: 61 });
    if (d.flags.includes("DEAL_REG_EXPIRING")) out.push({ code: "DEAL_REG", label: "Deal reg expiring", tone: "amber", rank: 60 });
    if (rec.health?.to === "DYING") out.push({ code: "NOW_DYING", label: "Became dying", tone: "red", rank: 85 });
    if (rec.stageDir === "down") out.push({ code: "MOVED_BACK", label: d.stage === "HOLD" ? "Put on hold" : "Moved back", tone: "amber", rank: 58 });
    if (rec.forecast && FC_RANK[rec.forecast.to]! < FC_RANK[rec.forecast.from]!) out.push({ code: "FC_DOWN", label: "Forecast downgraded", tone: "amber", rank: 56 });
    if (rec.amount && rec.amount.to < rec.amount.from) out.push({ code: "VALUE_DOWN", label: "Value reduced", tone: "amber", rank: 55 });
    if (d.flags.includes("STALE_STAGE")) out.push({ code: "STUCK", label: "Stuck in stage", tone: "amber", rank: 50 });
    if (d.flags.includes("NO_NEXT_STEP")) out.push({ code: "NO_NEXT_STEP", label: "No next step", tone: "amber", rank: 45 });
    if (d.flags.includes("LOW_MARGIN")) out.push({ code: "LOW_MARGIN", label: `Margin below ${THRESHOLDS.lowMarginPct}%`, tone: "amber", rank: 40 });
    if (rec.stageDir === "up") out.push({ code: "ADVANCED", label: "Advanced", tone: "green", rank: 20 });
    if (rec.forecast && FC_RANK[rec.forecast.to]! > FC_RANK[rec.forecast.from]!) out.push({ code: "FC_UP", label: "Forecast upgraded", tone: "green", rank: 18 });
    if (rec.amount && rec.amount.to > rec.amount.from) out.push({ code: "VALUE_UP", label: "Value increased", tone: "green", rank: 16 });
    if (rec.isNew) out.push({ code: "NEW", label: "New", tone: "blue", rank: 15 });
    if (!rec.changed && !(d.lastActivityAt && d.lastActivityAt > (rec.lastChangeAt ?? new Date(0)) && daysFrom(d.lastActivityAt, now) < 14))
      out.push({ code: "NO_MOVEMENT", label: "No movement", tone: "slate", rank: 10 });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

// ───────────── Call agenda ─────────────

export type AgendaItem = { dealId: string; deal: string; owner: string; amount: number; fact: string };
export type AgendaGroup = { key: string; title: string; hint: string; tone: Tone; items: AgendaItem[] };

/**
 * What must be raised in the call. Each deal appears once, under its most urgent heading, with every fact
 * about it in one line: breaches first, then commit risk, slips, regressions, blockers and silence.
 */
export function buildAgenda(rows: { deal: ReviewDeal; rec: Reconstruction }[], now: Date): AgendaGroup[] {
  const groups: AgendaGroup[] = [
    { key: "deadlines", title: "Deadlines breached or due", hint: "Close dates, bid dates and next steps that have passed", tone: "red", items: [] },
    { key: "commit", title: "Commit at risk", hint: "Committed deals that may not land this period", tone: "red", items: [] },
    { key: "slipped", title: "Slipped", hint: "Close dates pushed out in this window, or repeatedly", tone: "amber", items: [] },
    { key: "backwards", title: "Went backwards", hint: "Moved back, downgraded, value cut or became dying", tone: "amber", items: [] },
    { key: "requests", title: "BOQ, pricing and OEM blockers", hint: "Overdue presales or pricing, expiring deal registration", tone: "amber", items: [] },
    { key: "quiet", title: "Gone quiet", hint: "No activity, no next step, or stuck in stage", tone: "slate", items: [] },
  ];
  const g = (k: string) => groups.find((x) => x.key === k)!;
  for (const { deal: d, rec } of rows) {
    if (!(ACTIVE.includes(d.stage as StageKey) || d.stage === "HOLD")) continue;
    const facts: { group: string; text: string }[] = [];
    const add = (k: string, fact: string) => facts.push({ group: k, text: fact });
    const deadline: string[] = [];
    if (d.expectedCloseDate < now) deadline.push(`close date ${fmtDate(d.expectedCloseDate, "short")} passed ${daysFrom(d.expectedCloseDate, now)} days ago`);
    if (d.submissionDueDate && ["IDENTIFIED", "QUALIFIED", "BOQ", "PRICING"].includes(d.stage)) {
      const dd = Math.ceil((d.submissionDueDate.getTime() - now.getTime()) / DAY);
      if (dd < 0) deadline.push(`bid submission ${fmtDate(d.submissionDueDate, "short")} missed`);
      else if (dd <= 3) deadline.push(`bid due ${dd === 0 ? "today" : `in ${dd} days`}`);
    }
    if (d.nextStepDate && daysFrom(d.nextStepDate, now) >= 1) deadline.push(`next step overdue ${daysFrom(d.nextStepDate, now)} days`);
    if (deadline.length) add("deadlines", cap(deadline.join("; ")));
    if (d.flags.includes("COMMIT_AT_RISK") || (d.forecastCategory === "COMMIT" && (d.healthLabel === "DYING" || d.healthLabel === "AT_RISK")))
      add("commit", `Commit, health ${HEALTH_LABEL[d.healthLabel as HealthKey]?.toLowerCase() ?? d.healthLabel}, closes ${fmtDate(d.expectedCloseDate, "short")}`);
    if (rec.close && rec.pushes > 0) add("slipped", `Close date ${fmtDate(rec.close.from, "short")} → ${fmtDate(rec.close.to, "short")}${d.closeDateSlipCount >= THRESHOLDS.slipCountConcern ? ` · slipped ${d.closeDateSlipCount}× overall` : ""}`);
    else if (d.closeDateSlipCount >= THRESHOLDS.slipCountConcern) add("slipped", `Slipped ${d.closeDateSlipCount}× overall`);
    const back: string[] = [];
    if (rec.stageDir === "down" && rec.stage) back.push(`${stageLabel(rec.stage.from)} → ${stageLabel(rec.stage.to)}`);
    if (rec.forecast && FC_RANK[rec.forecast.to]! < FC_RANK[rec.forecast.from]!) back.push(`forecast ${fcLabel(rec.forecast.from)} → ${fcLabel(rec.forecast.to)}`);
    if (rec.amount && rec.amount.to < rec.amount.from) back.push(`value ${inr(rec.amount.from)} → ${inr(rec.amount.to)}`);
    if (rec.health?.to === "DYING") back.push("became dying");
    if (back.length) add("backwards", cap(back.join("; ")));
    const quiet: string[] = [];
    if (d.flags.includes("NO_ACTIVITY")) quiet.push(`no activity for ${d.lastActivityAt ? daysFrom(d.lastActivityAt, now) : "many"} days`);
    if (!d.nextStep) quiet.push("no next step");
    if (d.flags.includes("STALE_STAGE")) quiet.push(`stuck in ${stageLabel(d.stage)}`);
    if (quiet.length) add("quiet", cap(quiet.join("; ")));
    const req: string[] = [];
    if (d.flags.includes("PRESALES_OVERDUE")) req.push("BOQ from presales overdue");
    if (d.flags.includes("PRICING_PENDING")) req.push("pricing from purchase overdue");
    if (d.flags.includes("DEAL_REG_EXPIRING"))
      req.push(
        !d.dealRegExpiry ? "OEM deal registration needs renewal"
        : d.dealRegExpiry < now ? `OEM deal registration expired ${fmtDate(d.dealRegExpiry, "short")}`
        : `OEM deal registration expires ${fmtDate(d.dealRegExpiry, "short")}`,
      );
    if (req.length) add("requests", cap(req.join("; ")));
    if (facts.length) {
      const order = groups.map((x) => x.key);
      const top = facts.reduce((a, f) => (order.indexOf(f.group) < order.indexOf(a.group) ? f : a));
      g(top.group).items.push({ dealId: d.id, deal: d.name, owner: d.owner, amount: d.amount, fact: facts.map((f) => f.text).join(" · ") });
    }
  }
  for (const x of groups) x.items.sort((a, b) => b.amount - a.amount);
  return groups.filter((x) => x.items.length);
}

// ───────────── Done well / lagging ─────────────

export type PersonStats = {
  id: string;
  name: string;
  open: number;
  openCount: number;
  commit: number;
  won: number;
  wonCount: number;
  lost: number;
  lostCount: number;
  advanced: number;
  newPipeline: number;
  newCount: number;
  pushedCount: number;
  pushedValue: number;
  pastCloseCount: number;
  pastCloseValue: number;
  quietCount: number;
  commitAtRisk: number;
  activities: number;
  fcUpgrades: number;
  winRate: number | null;
  /** Remaining quarter target (target − won this quarter); null when no target */
  remainingTarget: number | null;
  /** Open value expected to close this quarter */
  quarterPipeline: number;
};

export const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Plain-language verdict for a person (or the selection), benchmarked against the team when known. */
export function verdict(p: PersonStats, team: { activities: number; newPipeline: number; winRate: number | null } | null) {
  const good: string[] = [];
  const bad: string[] = [];
  const coverage = p.remainingTarget && p.remainingTarget > 0 ? p.quarterPipeline / p.remainingTarget : null;
  if (p.wonCount) good.push(`Won ${plural(p.wonCount, "deal")} worth ${inr(p.won)}`);
  if (p.advanced >= 2) good.push(`Moved ${p.advanced} deals to a later stage`);
  if (p.fcUpgrades) good.push(`Upgraded the forecast on ${plural(p.fcUpgrades, "deal")}`);
  if (p.newPipeline > 0 && (!team || p.newPipeline >= team.newPipeline))
    good.push(`Added ${inr(p.newPipeline)} of new pipeline${team && team.newPipeline > 0 ? ` (team median ${inr(team.newPipeline)})` : ""}`);
  if (team && p.activities > 0 && p.activities >= team.activities) good.push(`Logged ${p.activities} activities (team median ${Math.round(team.activities)})`);
  if (team && p.winRate !== null && team.winRate !== null && p.winRate >= team.winRate + 5) good.push(`Win rate ${Math.round(p.winRate)}% vs team ${Math.round(team.winRate)}%`);
  if (coverage !== null && coverage >= 3) good.push(`Quarter pipeline covers ${coverage.toFixed(1)}× the remaining target`);
  if (p.remainingTarget !== null && p.remainingTarget <= 0) good.push("Quarter target already achieved");
  if (p.openCount && !p.pastCloseCount && !p.pushedCount) good.push("No missed or pushed close dates");

  if (p.pastCloseCount) bad.push(`${plural(p.pastCloseCount, "deal")} past close date (${inr(p.pastCloseValue)}): re-date or close`);
  if (p.commitAtRisk) bad.push(`${plural(p.commitAtRisk, "commit deal")} at risk`);
  if (p.pushedCount) bad.push(`${plural(p.pushedCount, "close date")} pushed out (${inr(p.pushedValue)})`);
  if (coverage !== null && coverage < 3) bad.push(`Quarter coverage ${coverage.toFixed(1)}× against 3× needed for the remaining ${inr(p.remainingTarget)}`);
  if (p.quietCount) bad.push(`${plural(p.quietCount, "deal")} with no activity for ${THRESHOLDS.noActivityDays}+ days`);
  if (team && team.activities > 0 && p.activities < team.activities * 0.6) bad.push(`Only ${p.activities} activities (team median ${Math.round(team.activities)})`);
  if (team && team.newPipeline > 0 && p.newPipeline < team.newPipeline * 0.5) bad.push(`Little new pipeline: ${inr(p.newPipeline)} (team median ${inr(team.newPipeline)})`);
  if (team && p.winRate !== null && team.winRate !== null && p.winRate <= team.winRate - 10) bad.push(`Win rate ${Math.round(p.winRate)}% vs team ${Math.round(team.winRate)}%`);
  if (p.lostCount && p.lost > p.won) bad.push(`Lost ${plural(p.lostCount, "deal")} worth ${inr(p.lost)} in this window`);
  return { good, bad };
}

// ───────────── helpers ─────────────

export const stageLabel = (s: string) => STAGE_META[s as StageKey]?.label ?? s;
export const fcLabel = (s: string) => FORECAST_LABEL[s as ForecastKey] ?? s;
export const healthLabel = (s: string) => HEALTH_LABEL[s as HealthKey] ?? s;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
