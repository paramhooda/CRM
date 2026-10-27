// Stage rules: which stage moves a person may make, and why not. Pure and unit-tested; enforced on the server for
// every path (stage bar, pipeline board, edit form) and used by the UI to show only the moves that are allowed.
//
// Funnel: Identified → Qualified → BOQ → Pricing → Proposal Submitted → Negotiation → Won
// Resale deals (no presales) follow the same path without BOQ, the way Salesforce gives each sales process its own path.
// - Deals move one stage at a time, with one "advance" action; nobody can jump ahead.
// - A stage can be skipped only once the deal is in it (today: BOQ, when presales turns out not to be needed).
// - BOQ, Pricing and Proposal Submitted are entered by the workflow, never by clicking: requesting a BOQ moves the deal
//   to BOQ, submitting it (or requesting pricing) to Pricing, sending the quote to Proposal Submitted.
// - Won needs a quote with the customer, nothing still with presales or purchase, and the customer PO.
// - Moving back is a correction: managers only, with a reason, and never into the workflow stages.
// - Hold needs a reason and resumes to the stage it was held from. Reopening a closed deal is for managers only.
import { STAGE_META, type StageKey } from "./constants";

export const FUNNEL: StageKey[] = ["IDENTIFIED", "QUALIFIED", "BOQ", "PRICING", "PROPOSAL", "NEGOTIATION"];
/** Stages only the workflow can move a deal into */
export const WORKFLOW_STAGES: StageKey[] = ["BOQ", "PRICING", "PROPOSAL"];
const LIVE_QUOTE = ["SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED"];

export type StageFacts = {
  stage: StageKey;
  /** Stage the deal was in when put on hold */
  heldFromStage: StageKey | null;
  /** Last open stage before the deal was closed (where a reopen returns to) */
  lastOpenStage: StageKey | null;
  hasContact: boolean;
  closeDatePast: boolean;
  realLines: number;
  openPresales: boolean;
  openPricing: boolean;
  /** Status of the latest quote, if any */
  quoteStatus: string | null;
  /** Solution deal (path includes BOQ) or resale deal (path skips it) */
  presalesRequired: boolean;
};

/** The stages this deal goes through. A deal already in BOQ keeps BOQ on its path. */
export function pathFor(f: Pick<StageFacts, "presalesRequired" | "stage">): StageKey[] {
  return f.presalesRequired || f.stage === "BOQ" ? FUNNEL : FUNNEL.filter((s) => s !== "BOQ");
}

/** The stage after the current one on this deal's path (null when on hold, closed or at the end). */
export function nextStage(f: Pick<StageFacts, "presalesRequired" | "stage">): StageKey | null {
  const path = pathFor(f);
  const i = path.indexOf(f.stage);
  return i >= 0 && i < path.length - 1 ? path[i + 1]! : null;
}

/** Skipping a stage happens from inside it, with a reason. Only BOQ can be skipped: presales was not needed after all. */
export function checkSkip(f: StageFacts, a: Actor): { allowed: boolean; reason?: string; to: StageKey | null } {
  if (f.stage !== "BOQ") return { allowed: false, reason: "Only the BOQ stage can be skipped, once the deal is in it.", to: null };
  if (!a.canEdit) return { allowed: false, reason: "Only the deal owner or a sales manager can skip a stage.", to: "PRICING" };
  return { allowed: true, to: "PRICING" };
}

export type Actor = { canEdit: boolean; isManager: boolean };

/** What a move needs from the person: a reason, the PO, or a loss reason. */
export type Needs = "reason" | "po" | "lossReason";
export type Move = { to: StageKey; allowed: boolean; reason?: string; needs?: Needs; kind: "forward" | "back" | "hold" | "resume" | "close" | "reopen" };

const label = (s: StageKey) => STAGE_META[s].label;
const isClosed = (s: StageKey) => s === "WON" || s === "LOST" || s === "DROPPED";

const AUTOMATIC: Partial<Record<StageKey, string>> = {
  BOQ: "A deal moves to BOQ when sales requests a BOQ from presales.",
  PRICING: "A deal moves to Pricing when presales submits the BOQ, or sales requests pricing.",
  PROPOSAL: "A deal moves to Proposal Submitted when the quote is sent.",
};

/** Every possible target stage for a deal, with whether this person may move it there and why not. */
export function stageMoves(f: StageFacts, a: Actor): Move[] {
  const targets: StageKey[] = [...FUNNEL, "HOLD", "WON", "LOST", "DROPPED"];
  return targets.filter((t) => t !== f.stage).map((t) => checkMove(f, a, t));
}

export function checkMove(f: StageFacts, a: Actor, to: StageKey): Move {
  const no = (kind: Move["kind"], reason: string): Move => ({ to, allowed: false, reason, kind });
  const yes = (kind: Move["kind"], needs?: Needs): Move => ({ to, allowed: true, kind, needs });
  if (!a.canEdit) return no("forward", "Only the deal owner or a sales manager can change the stage.");

  // ── Closed deals ──
  if (isClosed(f.stage)) {
    const back = f.lastOpenStage ?? "NEGOTIATION";
    if (to === back) return a.isManager ? yes("reopen", "reason") : no("reopen", "Only a sales manager can reopen a closed deal.");
    return no("reopen", `The deal is ${label(f.stage)}. A sales manager can reopen it to ${label(back)}.`);
  }

  // ── On hold ──
  if (f.stage === "HOLD") {
    const back = f.heldFromStage ?? "QUALIFIED";
    if (to === back) return yes("resume");
    if (to === "LOST" || to === "DROPPED") return yes("close", "lossReason");
    return no("resume", `The deal is on hold. Resume it to ${label(back)} first.`);
  }

  // ── Open deals ──
  if (to === "HOLD") return yes("hold", "reason");
  if (to === "LOST" || to === "DROPPED") return yes("close", "lossReason");
  if (to === "WON") {
    if (f.stage !== "PROPOSAL" && f.stage !== "NEGOTIATION") return no("close", "A deal can be won only after the quote is sent (Proposal Submitted or Negotiation).");
    if (f.openPresales || f.openPricing) return no("close", "A BOQ or pricing request is still open. Finish or cancel it first.");
    if (!f.quoteStatus || !LIVE_QUOTE.includes(f.quoteStatus)) return no("close", "Send the customer a quote before closing as won.");
    return yes("close", "po");
  }

  const path = pathFor(f);
  const from = path.indexOf(f.stage);
  if (FUNNEL.indexOf(to) > FUNNEL.indexOf(f.stage)) {
    const next = path[from + 1];
    if (to !== next) return no("forward", next ? `Deals move one stage at a time. Next is ${label(next)}.` : "This deal is at the last stage before closing.");
    if (WORKFLOW_STAGES.includes(to)) return no("forward", AUTOMATIC[to]!);
    if (to === "QUALIFIED") {
      if (!f.hasContact) return no("forward", "Add the customer contact before qualifying the deal.");
      if (f.closeDatePast) return no("forward", "The expected close date has passed. Update it before moving the deal on.");
      return yes("forward");
    }
    if (to === "NEGOTIATION") {
      if (!f.quoteStatus || !LIVE_QUOTE.includes(f.quoteStatus)) return no("forward", "Send the customer a quote first.");
      if (f.openPresales || f.openPricing) return no("forward", "A BOQ or pricing request is open. Send the revised quote first.");
      return yes("forward");
    }
    return no("forward", "This move is not part of the process.");
  }

  // Moving back: one stage, as a manager's correction
  if (!a.isManager) return no("back", "Only a sales manager can move a deal back. To change the solution, use Request BOQ change.");
  if (to !== path[from - 1]) return no("back", `A deal moves back one stage at a time${from > 0 ? `, to ${label(path[from - 1]!)}` : ""}.`);
  // BOQ and Pricing are worked stages: going back to them means new work, so it goes through Request BOQ change
  if (to === "BOQ" || to === "PRICING") return no("back", `${label(to)} is set by the workflow. Use Request BOQ change to send the deal back to presales.`);
  if (f.openPresales || f.openPricing) return no("back", "Cancel the open BOQ or pricing request before moving the deal back.");
  return yes("back", "reason");
}

/** Commit is a promise to the forecast: only deals whose quote is with the customer can be committed. */
export function forecastError(stage: StageKey, forecast: string): string | null {
  if (forecast === "COMMIT" && stage !== "PROPOSAL" && stage !== "NEGOTIATION")
    return "Only deals with a quote sent (Proposal Submitted or Negotiation) can be in Commit.";
  if (forecast !== "OMITTED" && (isClosed(stage) || stage === "HOLD")) return "Closed and on-hold deals are omitted from the forecast.";
  return null;
}

/**
 * Field rules when someone edits a deal: the forecast must fit the stage, and a changed close date or next-step date
 * cannot be in the past (pushing a deal into the past hides it from every "closing soon" view).
 * Only changed fields are checked, so old data never blocks an unrelated edit.
 */
export function dealFieldErrors(
  stage: StageKey,
  before: { forecastCategory: string; expectedCloseDate: Date; nextStepDate: Date | null },
  after: { forecastCategory: string; expectedCloseDate: Date; nextStepDate: Date | null },
  now = new Date(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  const today = new Date(now.toDateString()).getTime();
  const day = (d: Date) => new Date(d.toDateString()).getTime();
  if (after.forecastCategory !== before.forecastCategory) {
    const e = forecastError(stage, after.forecastCategory);
    if (e) errors.forecastCategory = e;
  }
  if (!isClosed(stage) && day(after.expectedCloseDate) !== day(before.expectedCloseDate) && day(after.expectedCloseDate) < today)
    errors.expectedCloseDate = "The expected close date cannot be in the past.";
  if (after.nextStepDate && (!before.nextStepDate || day(after.nextStepDate) !== day(before.nextStepDate)) && day(after.nextStepDate) < today)
    errors.nextStepDate = "The next step date cannot be in the past.";
  return errors;
}
