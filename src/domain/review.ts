// Pipeline review: what changed on a deal since a date (from its audit rows), what needs raising, and how each
// person is doing against target.
import { STAGE_META, isOpen, type Stage } from "./stages";
import { dec, type Money } from "./money";

export type AuditRow = { field: string | null; oldValue: string | null; newValue: string | null; changedAt: Date; action: string };

export const REVIEW_FIELDS = ["dealValue", "stage", "expectedCloseDate", "forecastCategory", "ownerId", "expectedGmPct"] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export type DealChanges = {
  changes: Partial<Record<ReviewField, { from: string | null; to: string | null }>>;
  /** Close date pushed out within the window */
  pushes: number;
  /** Created within the window */
  isNew: boolean;
};

/** Changes since `since`: for each field the value then (first old value) and the value now (last new value). */
export function changesSince(deal: { createdAt: Date }, rows: AuditRow[], since: Date): DealChanges {
  const changes: DealChanges["changes"] = {};
  let pushes = 0;
  const inWindow = rows.filter((r) => r.changedAt >= since && r.field && (REVIEW_FIELDS as readonly string[]).includes(r.field)).sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  for (const r of inWindow) {
    const f = r.field as ReviewField;
    const cur = changes[f];
    changes[f] = { from: cur ? cur.from : r.oldValue, to: r.newValue };
    if (f === "expectedCloseDate" && r.oldValue && r.newValue && r.newValue > r.oldValue) pushes++;
  }
  for (const f of Object.keys(changes) as ReviewField[]) if (changes[f]!.from === changes[f]!.to) delete changes[f];
  return { changes, pushes, isNew: deal.createdAt >= since };
}

export type Flag = "CLOSE_DATE_PASSED" | "SLIPPED" | "NO_ACTIVITY" | "STUCK" | "COMMIT_WITHOUT_PROPOSAL" | "NO_NEXT_STEP";

/** Which concerns the review raises and at what thresholds; Admin → Settings → Alerts. Everything off by default. */
export type AlertConfig = { quietDays: number | null; stuck: boolean; closeDatePassed: boolean; commitWithoutProposal: boolean; noNextStep: boolean };
export const ALL_ALERTS: AlertConfig = { quietDays: 21, stuck: true, closeDatePassed: true, commitWithoutProposal: true, noNextStep: true };

export function flagLabel(flag: Flag, cfg: AlertConfig): string {
  switch (flag) {
    case "CLOSE_DATE_PASSED": return "Close date passed";
    case "SLIPPED": return "Close date pushed";
    case "NO_ACTIVITY": return `No activity for ${cfg.quietDays ?? 21} days`;
    case "STUCK": return "Stuck in stage";
    case "COMMIT_WITHOUT_PROPOSAL": return "Commit without a proposal";
    case "NO_NEXT_STEP": return "No next step";
  }
}

export type DealForFlags = {
  stage: Stage;
  forecastCategory: "COMMIT" | "UPSIDE" | "PIPELINE";
  expectedCloseDate: Date;
  stageEnteredAt: Date;
  updatedAt: Date;
  nextStep: string | null;
};

/** The concerns on an open deal, for the alerts that are switched on. A pushed close date is always worth a look. */
export function flagsFor(d: DealForFlags, pushes: number, now: Date, cfg: AlertConfig): Flag[] {
  const out: Flag[] = [];
  if (!isOpen(d.stage)) return out;
  const day = 86_400_000;
  if (cfg.closeDatePassed && d.expectedCloseDate.getTime() < now.getTime() - day) out.push("CLOSE_DATE_PASSED");
  if (pushes > 0) out.push("SLIPPED");
  if (cfg.quietDays && now.getTime() - d.updatedAt.getTime() > cfg.quietDays * day) out.push("NO_ACTIVITY");
  const norm = STAGE_META[d.stage].normDays;
  if (cfg.stuck && norm && now.getTime() - d.stageEnteredAt.getTime() > norm * day) out.push("STUCK");
  if (cfg.commitWithoutProposal && d.forecastCategory === "COMMIT" && (d.stage === "QUALIFIED" || d.stage === "BOQ")) out.push("COMMIT_WITHOUT_PROPOSAL");
  if (cfg.noNextStep && !d.nextStep) out.push("NO_NEXT_STEP");
  return out;
}

export type PersonDeal = { stage: Stage; dealValue: Money; forecastCategory: "COMMIT" | "UPSIDE" | "PIPELINE"; closedAt: Date | null; flags: Flag[]; changes: DealChanges };

export type PersonSummary = {
  wonValue: number;
  wonCount: number;
  lostCount: number;
  advanced: number;
  newPipeline: number;
  pushed: number;
  pastClose: number;
  quiet: number;
  commitUpside: number;
  openPipeline: number;
  target: number | null;
  doneWell: string[];
  lagging: string[];
};

const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);

/** What a person did well and where they are lagging, over the review window and against the quarter's target. */
export function personSummary(deals: PersonDeal[], since: Date, target: number | null, cfg: AlertConfig = ALL_ALERTS): PersonSummary {
  const won = deals.filter((d) => d.stage === "CLOSED_WON" && d.closedAt && d.closedAt >= since);
  const lost = deals.filter((d) => d.stage === "CLOSED_LOST" && d.closedAt && d.closedAt >= since);
  const open = deals.filter((d) => isOpen(d.stage));
  const value = (d: PersonDeal) => dec(d.dealValue)?.toNumber() ?? 0;
  const s: PersonSummary = {
    wonValue: won.reduce((a, d) => a + value(d), 0),
    wonCount: won.length,
    lostCount: lost.length,
    advanced: deals.filter((d) => d.changes.changes.stage && isOpen(d.stage)).length,
    newPipeline: deals.filter((d) => d.changes.isNew).reduce((a, d) => a + value(d), 0),
    pushed: deals.filter((d) => d.changes.pushes > 0).length,
    pastClose: open.filter((d) => d.flags.includes("CLOSE_DATE_PASSED")).length,
    quiet: open.filter((d) => d.flags.includes("NO_ACTIVITY")).length,
    commitUpside: open.filter((d) => d.forecastCategory !== "PIPELINE").reduce((a, d) => a + value(d), 0),
    openPipeline: open.reduce((a, d) => a + value(d), 0),
    target,
    doneWell: [],
    lagging: [],
  };
  if (s.wonCount) s.doneWell.push(`Won ${s.wonCount} deal${s.wonCount > 1 ? "s" : ""} worth ${inr(s.wonValue)}`);
  if (s.advanced) s.doneWell.push(`Moved ${s.advanced} deal${s.advanced > 1 ? "s" : ""} forward`);
  if (s.newPipeline > 0) s.doneWell.push(`Added ${inr(s.newPipeline)} of new pipeline`);
  if (s.pushed) s.lagging.push(`Pushed the close date on ${s.pushed} deal${s.pushed > 1 ? "s" : ""}`);
  if (s.pastClose) s.lagging.push(`${s.pastClose} open deal${s.pastClose > 1 ? "s are" : " is"} past the close date`);
  if (s.quiet) s.lagging.push(`${s.quiet} deal${s.quiet > 1 ? "s have" : " has"} had no activity for ${cfg.quietDays ?? 21} days`);
  if (target !== null && target > 0) {
    const coverage = (s.wonValue + s.commitUpside) / target;
    if (coverage >= 1) s.doneWell.push(`Won plus commit and upside cover the quarter target (${Math.round(coverage * 100)}%)`);
    else s.lagging.push(`Won plus commit and upside cover ${Math.round(coverage * 100)}% of the quarter target (${inr(target)})`);
  }
  return s;
}
