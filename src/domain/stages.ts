// The sales process: stages, the path a deal follows, and which moves are allowed from where. Pure and
// unit-tested; the server re-checks every move with this module and the UI only offers what it allows.

export type Stage = "QUALIFIED" | "BOQ" | "PROPOSAL_SUBMITTED" | "NEGOTIATION" | "HOLD" | "CLOSED_WON" | "CLOSED_LOST" | "DROPPED";
export type StageTone = "qualified" | "boq" | "proposal" | "negotiation" | "hold" | "won" | "lost" | "dropped";

export const STAGE_META: Record<Stage, { label: string; probability: number; normDays: number | null; tone: StageTone; order: number }> = {
  QUALIFIED: { label: "Qualified", probability: 20, normDays: 30, tone: "qualified", order: 1 },
  BOQ: { label: "BOQ", probability: 35, normDays: 14, tone: "boq", order: 2 },
  PROPOSAL_SUBMITTED: { label: "Proposal Submitted", probability: 60, normDays: 30, tone: "proposal", order: 3 },
  NEGOTIATION: { label: "Negotiation", probability: 80, normDays: 21, tone: "negotiation", order: 4 },
  HOLD: { label: "Hold", probability: 0, normDays: 45, tone: "hold", order: 5 },
  CLOSED_WON: { label: "Closed-Won", probability: 100, normDays: null, tone: "won", order: 6 },
  CLOSED_LOST: { label: "Closed-Lost", probability: 0, normDays: null, tone: "lost", order: 7 },
  DROPPED: { label: "Dropped", probability: 0, normDays: null, tone: "dropped", order: 8 },
};

export const ALL_STAGES = Object.keys(STAGE_META) as Stage[];
export const OPEN_STAGES: Stage[] = ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION"];
export const CLOSED_STAGES: Stage[] = ["CLOSED_WON", "CLOSED_LOST", "DROPPED"];
export const isOpen = (s: Stage) => OPEN_STAGES.includes(s);
export const isClosed = (s: Stage) => CLOSED_STAGES.includes(s);
/** Open or on hold: the deal is still being worked. */
export const isLive = (s: Stage) => !isClosed(s);

/** The stages a deal passes through in order. Deals that need presales go through BOQ. */
export function pathFor(needsPresales: boolean): Stage[] {
  return needsPresales ? ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "CLOSED_WON"] : ["QUALIFIED", "PROPOSAL_SUBMITTED", "NEGOTIATION", "CLOSED_WON"];
}

export type StageAction = "ADVANCE" | "SKIP_BOQ" | "HOLD" | "RESUME" | "BACK" | "WON" | "LOST" | "DROPPED" | "REOPEN";

export type ApprovalState = "NONE_NEEDED" | "NEEDED" | "PENDING" | "APPROVED" | "REJECTED" | "STALE";

/** What the rules need to know about a deal to decide its moves. */
export type RequestStatus = "REQUESTED" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED" | "CANCELLED";

export type DealFacts = {
  stage: Stage;
  heldFromStage: Stage | null;
  lastOpenStage: Stage | null;
  needsPresales: boolean;
  deleted: boolean;
  lineCount: number;
  /** Lines without a sales price */
  unpricedLines: number;
  /** Lines without a purchase cost (own-IP lines usually carry the standard cost) */
  uncostedLines: number;
  /** Lines whose OEM is not own IP: the ones purchase prices */
  thirdPartyLines: number;
  uncostedThirdPartyLines: number;
  /** Documents presales may see (kinds not restricted to sales): the customer's requirement travels with the hand-over */
  presalesDocuments: number;
  /** Status of the latest request of each kind, or null when none was ever raised */
  presalesRequest: RequestStatus | null;
  pricingRequest: RequestStatus | null;
  openPresalesRequest: boolean;
  openPricingRequest: boolean;
  approvalState: ApprovalState;
  /** Names of the approval rules the prices match right now (empty when none) */
  approvalRules: string[];
  hasPrimaryContact: boolean;
  closeDatePast: boolean;
  hasPoDocument: boolean;
};

/** The deal owner has every move on their own deal; managers the same for their team. `isManager` is kept for callers. */
export type MoveActor = { canEdit: boolean; isManager: boolean };

export type Move = {
  action: StageAction;
  toStage: Stage;
  label: string;
  /** Primary action on the deal page (the Advance button) */
  primary: boolean;
  enabled: boolean;
  /** Why the move is not enabled */
  reason?: string;
  needsReason?: boolean;
  needsLossReason?: boolean;
  /** Needs a PO number and the Customer PO document */
  needsPo?: boolean;
  /** Needs a presales engineer and due date (entering BOQ) */
  needsPresalesRequest?: boolean;
  /** Entering BOQ with no document presales could work from: the move's dialog attaches one first */
  needsDocument?: boolean;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("N", String(n)));

/** The prices themselves: every line priced and costed (so the margin is known), and any approval given. */
export function priceBlockers(f: DealFacts): string[] {
  const out: string[] = [];
  if (f.lineCount === 0) out.push("Add at least one line.");
  if (f.uncostedLines > 0) out.push(`Enter the purchase cost on ${plural(f.uncostedLines, "the remaining line", "N lines")} (ask purchase for prices) so the margin is known.`);
  if (f.unpricedLines > 0) out.push(`Set a sales price on ${plural(f.unpricedLines, "the remaining line", "N lines")}.`);
  if (f.approvalState === "NEEDED" || f.approvalState === "STALE") out.push(`These prices need approval first${f.approvalRules.length ? ` (${f.approvalRules.join(", ")})` : ""}.`);
  if (f.approvalState === "PENDING") out.push("Waiting for approval.");
  if (f.approvalState === "REJECTED") out.push("Approval was rejected; change the prices and ask again.");
  return out;
}

/** Everything that must be true before a proposal can go out. Empty when the deal is ready. */
export function proposalBlockers(f: DealFacts): string[] {
  const out: string[] = [];
  if (f.openPresalesRequest) out.push("Presales has not submitted the BOQ yet.");
  if (f.openPricingRequest) out.push("Purchase has not completed pricing yet.");
  return [...out, ...priceBlockers(f)];
}

function qualifiedBlockers(f: DealFacts): string[] {
  const out: string[] = [];
  if (!f.hasPrimaryContact) out.push("Add the customer contact.");
  if (f.closeDatePast) out.push("The expected close date has passed; set a new one.");
  return out;
}

/** Handing a deal to presales: the customer's requirement must travel with it. */
export function handoverBlockers(f: DealFacts): string[] {
  return f.presalesDocuments === 0 ? ["Attach the customer's requirement (RFP, SoW or similar) under Documents first."] : [];
}

/** Closing as won: the prices are final and approved, nothing is open, and the PO is on file. */
export function wonBlockers(f: DealFacts): string[] {
  const out: string[] = [];
  if (f.openPresalesRequest || f.openPricingRequest) out.push("Close the open presales or pricing request first.");
  out.push(...priceBlockers(f));
  if (!f.hasPoDocument) out.push("Attach the customer's PO document.");
  return out;
}

const disabled = (m: Move, blockers: string[]): Move => (blockers.length ? { ...m, enabled: false, reason: blockers.join(" ") } : m);

/** Every move that applies to the deal in its current stage, enabled or not, with the reason when not. */
export function allowedMoves(f: DealFacts, actor: MoveActor): Move[] {
  const moves: Move[] = [];
  if (f.deleted) return moves;
  const path = pathFor(f.needsPresales);
  const noEdit = !actor.canEdit ? ["You can't change this deal."] : [];

  if (isOpen(f.stage)) {
    const idx = path.indexOf(f.stage);
    const next = path[idx + 1]!;
    let gates: string[] = [];
    let extra: Partial<Move> = {};
    if (f.stage === "QUALIFIED") {
      gates = qualifiedBlockers(f);
      // A presales request raised earlier is reused rather than doubled; a missing requirement document is asked
      // for in the move itself (the server still refuses the move without it)
      if (next === "BOQ") extra = { needsPresalesRequest: !f.openPresalesRequest, needsDocument: handoverBlockers(f).length > 0 };
      else gates = [...gates, ...proposalBlockers(f)];
    } else if (next === "PROPOSAL_SUBMITTED") gates = proposalBlockers(f);
    else if (next === "CLOSED_WON") {
      gates = wonBlockers(f);
      extra = { needsPo: true };
    }
    const label = next === "CLOSED_WON" ? "Close as won" : `Advance to ${STAGE_META[next].label}`;
    moves.push(disabled({ action: "ADVANCE", toStage: next, label, primary: true, enabled: true, ...extra }, [...noEdit, ...gates]));

    if (f.stage === "BOQ") moves.push(disabled({ action: "SKIP_BOQ", toStage: "PROPOSAL_SUBMITTED", label: "Skip BOQ (no presales needed)", primary: false, enabled: true }, [...noEdit, ...proposalBlockers({ ...f, openPresalesRequest: false })]));
    if (f.stage === "PROPOSAL_SUBMITTED")
      moves.push(disabled({ action: "WON", toStage: "CLOSED_WON", label: "Close as won", primary: false, enabled: true, needsPo: true }, [...noEdit, ...wonBlockers(f)]));
    moves.push(disabled({ action: "HOLD", toStage: "HOLD", label: "Put on hold", primary: false, enabled: true, needsReason: true }, noEdit));
    if (idx > 0) {
      const prev = path[idx - 1]!;
      moves.push(disabled({ action: "BACK", toStage: prev, label: `Move back to ${STAGE_META[prev].label}`, primary: false, enabled: true, needsReason: true }, noEdit));
    }
  }
  if (f.stage === "HOLD") {
    const back = f.heldFromStage && isOpen(f.heldFromStage) ? f.heldFromStage : "QUALIFIED";
    moves.push(disabled({ action: "RESUME", toStage: back, label: `Resume in ${STAGE_META[back].label}`, primary: true, enabled: true }, noEdit));
  }
  if (isLive(f.stage)) {
    moves.push(disabled({ action: "LOST", toStage: "CLOSED_LOST", label: "Close as lost", primary: false, enabled: true, needsLossReason: true }, noEdit));
    moves.push(disabled({ action: "DROPPED", toStage: "DROPPED", label: "Drop", primary: false, enabled: true, needsLossReason: true }, noEdit));
  }
  if (isClosed(f.stage)) {
    const back = f.lastOpenStage && isOpen(f.lastOpenStage) ? f.lastOpenStage : "QUALIFIED";
    moves.push(disabled({ action: "REOPEN", toStage: back, label: `Reopen in ${STAGE_META[back].label}`, primary: false, enabled: true, needsReason: true }, noEdit));
  }
  return moves;
}

/** The move for an action, if it applies in this stage (enabled or not). */
export function findMove(f: DealFacts, actor: MoveActor, action: StageAction): Move | undefined {
  return allowedMoves(f, actor).find((m) => m.action === action);
}

/** What changes on the deal when a move is applied, besides the stage itself. */
export function applyMove(f: DealFacts, move: Move): { toStage: Stage; heldFromStage: Stage | null; lastOpenStage: Stage | null; needsPresales: boolean; closes: boolean } {
  const to = move.toStage;
  return {
    toStage: to,
    heldFromStage: to === "HOLD" ? f.stage : null,
    lastOpenStage: isClosed(to) ? (f.stage === "HOLD" ? f.heldFromStage ?? "QUALIFIED" : f.stage) : isOpen(to) ? null : f.lastOpenStage,
    needsPresales: move.action === "SKIP_BOQ" ? false : f.needsPresales,
    closes: isClosed(to),
  };
}
