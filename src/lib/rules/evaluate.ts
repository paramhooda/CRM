import { STAGE_META, THRESHOLDS, type StageKey, type ForecastKey, type HealthKey } from "../constants";
import { FLAG_META, type FlagCode } from "./flags";

export type RuleInput = {
  stage: StageKey;
  forecastCategory: ForecastKey;
  amount: number;
  revenueModel: "ONE_TIME" | "ARR";
  arrAmount: number | null;
  contractTermMonths: number | null;
  expectedCloseDate: Date;
  closeDateSlipCount: number;
  stageEnteredAt: Date;
  lastActivityAt: Date | null;
  createdAt: Date;
  nextStep: string | null;
  nextStepDate: Date | null;
  presalesOwnerId: string | null;
  primaryContactId: string | null;
  contactCount: number;
  marginPct: number | null;
  openPricingDueDate: Date | null;
  openPresalesDueDate: Date | null;
  dealRegStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  dealRegExpiry: Date | null;
  procurementMode: "DIRECT" | "RFQ" | "RFP" | "TENDER";
  submissionDueDate: Date | null;
};

export type RuleResult = { score: number; label: HealthKey; flags: FlagCode[]; reasons: string[] };

const DAY = 86_400_000;
const days = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

const STAGE_ORDER: Record<StageKey, number> = Object.fromEntries(
  Object.entries(STAGE_META).map(([k, v]) => [k, v.order]),
) as Record<StageKey, number>;

/**
 * Opportunity health model.
 * Score 0–100 starts at 50 and is adjusted by stage maturity, engagement recency, forecast confidence and
 * hygiene penalties (stale stage, slipped/overdue close date, missing next step). Labels:
 *  - DYING: no activity ≥ 21d, or stage age > 2× typical, or close date overdue > 14d, or score < 35
 *  - HOT: score ≥ 75, stage Proposal/Negotiation, activity within 7d, not overdue
 *  - AT_RISK: score < 60, or any critical or serious flag
 *  - HEALTHY: otherwise
 */
export function evaluateOpportunity(o: RuleInput, now: Date = new Date()): RuleResult {
  const reasons: string[] = [];
  if (o.stage === "WON" || o.stage === "LOST" || o.stage === "DROPPED") {
    return { score: o.stage === "WON" ? 100 : 0, label: "CLOSED", flags: [], reasons: ["Closed"] };
  }

  const flags = new Set<FlagCode>();
  const meta = STAGE_META[o.stage];
  const isHold = o.stage === "HOLD";
  const activityAge = days(o.lastActivityAt ?? o.createdAt, now);
  const stageAge = days(o.stageEnteredAt, now);
  const overdueDays = days(o.expectedCloseDate, now); // positive => overdue
  const order = STAGE_ORDER[o.stage];

  let score = 50;

  // Stage maturity (0..24)
  score += Math.round(meta.probability * 0.3);

  // Engagement recency
  if (activityAge <= THRESHOLDS.warmActivityDays) {
    score += 15;
  } else if (activityAge <= 14) {
    score += 5;
  } else if (activityAge < THRESHOLDS.noActivityDays) {
    score -= 5;
    reasons.push(`Last activity ${activityAge}d ago`);
  } else {
    score -= 20;
    flags.add("NO_ACTIVITY");
    reasons.push(`No activity for ${activityAge} days`);
  }

  // Forecast confidence
  if (o.forecastCategory === "COMMIT") score += 10;
  else if (o.forecastCategory === "UPSIDE") score += 3;

  // Stage age
  if (meta.staleAfterDays > 0 && stageAge > meta.staleAfterDays) {
    score -= stageAge > meta.staleAfterDays * 2 ? 20 : 10;
    flags.add("STALE_STAGE");
    reasons.push(`${stageAge} days in ${meta.label}`);
  }

  // Close date hygiene
  if (o.closeDateSlipCount > 0) score -= Math.min(15, o.closeDateSlipCount * 5);
  if (o.closeDateSlipCount >= THRESHOLDS.slipCountConcern) {
    flags.add("CLOSE_DATE_SLIPPED");
    reasons.push(`Close date slipped ${o.closeDateSlipCount} times`);
  }
  if (overdueDays > 0) {
    score -= overdueDays > 30 ? 25 : 15;
    flags.add("CLOSE_DATE_OVERDUE");
    reasons.push(`Close date passed ${overdueDays} days ago`);
  }

  // Next step
  if (!o.nextStep || (o.nextStepDate && days(o.nextStepDate, now) > 0)) {
    score -= 5;
    flags.add("NO_NEXT_STEP");
  }

  // Workflow SLAs
  if (order >= STAGE_ORDER.BOQ && !isHold && !o.presalesOwnerId) flags.add("NO_PRESALES");
  if (o.openPricingDueDate && days(o.openPricingDueDate, now) > 0) {
    flags.add("PRICING_PENDING");
    score -= 5;
  }
  if (o.openPresalesDueDate && days(o.openPresalesDueDate, now) > 0) {
    flags.add("PRESALES_OVERDUE");
    score -= 5;
  }

  // Commercials
  if (o.marginPct !== null && o.marginPct < THRESHOLDS.lowMarginPct) flags.add("LOW_MARGIN");
  if (o.revenueModel === "ARR" && (!o.contractTermMonths || !o.arrAmount)) flags.add("ARR_TERM_MISSING");

  // Relationship coverage
  if (!o.primaryContactId) flags.add("NO_CONTACT");
  if (o.amount >= THRESHOLDS.highValueAmount && o.contactCount <= 1) flags.add("SINGLE_THREADED");

  // OEM deal registration
  if (
    o.dealRegStatus === "PENDING" ||
    o.dealRegStatus === "EXPIRED" ||
    (o.dealRegStatus === "APPROVED" && o.dealRegExpiry && days(now, o.dealRegExpiry) <= THRESHOLDS.dealRegExpiryWarnDays)
  ) {
    if (order >= STAGE_ORDER.BOQ) flags.add("DEAL_REG_EXPIRING");
  }

  // Tender / RFP submission
  if (
    (o.procurementMode === "RFP" || o.procurementMode === "TENDER") &&
    o.submissionDueDate &&
    order < STAGE_ORDER.PROPOSAL
  ) {
    const left = days(now, o.submissionDueDate);
    if (left <= THRESHOLDS.rfpDueWarnDays) flags.add("SUBMISSION_DUE");
  }

  // Commit sanity
  if (
    o.forecastCategory === "COMMIT" &&
    (order < STAGE_ORDER.PROPOSAL || overdueDays > 0 || activityAge >= THRESHOLDS.noActivityDays || isHold)
  ) {
    flags.add("COMMIT_AT_RISK");
  }

  if (isHold) score -= 15;
  score = Math.max(0, Math.min(100, score));

  let label: HealthKey;
  const severities = [...flags].map((f) => FLAG_META[f].severity);
  const hasCriticalOrSerious = severities.some((x) => x === "critical" || x === "serious");
  if (
    activityAge >= THRESHOLDS.noActivityDays ||
    (meta.staleAfterDays > 0 && stageAge > meta.staleAfterDays * 2) ||
    overdueDays > THRESHOLDS.overdueGraceDays ||
    score < 35
  ) {
    label = "DYING";
  } else if (
    score >= 75 &&
    (o.stage === "PROPOSAL" || o.stage === "NEGOTIATION") &&
    activityAge <= THRESHOLDS.warmActivityDays &&
    overdueDays <= 0
  ) {
    label = "HOT";
  } else if (score < 60 || hasCriticalOrSerious) {
    label = "AT_RISK";
  } else {
    label = "HEALTHY";
  }

  if (label === "HOT") reasons.unshift("Late-stage, recently engaged and on schedule");
  return { score, label, flags: [...flags], reasons };
}

/** Default forecast category for a stage when the user has not overridden it. */
export function defaultForecast(stage: StageKey): ForecastKey {
  switch (stage) {
    case "NEGOTIATION":
      return "COMMIT";
    case "PROPOSAL":
      return "UPSIDE";
    case "HOLD":
    case "WON":
    case "LOST":
    case "DROPPED":
      return "OMITTED";
    default:
      return "PIPELINE";
  }
}
