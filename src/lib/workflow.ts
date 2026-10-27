// Sales → Presales → Purchase → Quote workflow rules (pure, unit-tested).
// One derived state per deal tells everyone who the deal is waiting on and what is blocking it.
import { fmtDate } from "./format";
import { costExpired, linesText, needsInternalCost, needsPurchaseCost } from "./costing";

export type WorkflowState =
  | "ESTIMATE" // only quick estimates or nothing yet: presales not engaged
  | "WITH_PRESALES" // BOQ (or a revision of it) being prepared
  | "WAITING_ON_SALES" // presales asked sales a question
  | "NEEDS_PRICING" // purchase lines without a current cost and no pricing request open
  | "NEEDS_COSTING" // own-brand lines waiting on a cost from presales
  | "WITH_PURCHASE" // purchase is pricing
  | "READY_TO_QUOTE" // every line costed; sales sets prices and quotes
  | "QUOTE_SENT"
  | "CHANGES_REQUESTED" // customer asked for changes to the latest quote
  | "ACCEPTED"
  | "CLOSED";

export const WORKFLOW_META: Record<WorkflowState, { label: string; tone: "slate" | "blue" | "violet" | "amber" | "green" | "red" | "aqua"; waitingOn: "SALES" | "PRESALES" | "PURCHASE" | "CUSTOMER" | null }> = {
  ESTIMATE: { label: "Estimate only", tone: "slate", waitingOn: "SALES" },
  WITH_PRESALES: { label: "With presales", tone: "violet", waitingOn: "PRESALES" },
  WAITING_ON_SALES: { label: "Waiting on sales", tone: "amber", waitingOn: "SALES" },
  NEEDS_PRICING: { label: "Needs pricing", tone: "amber", waitingOn: "SALES" },
  NEEDS_COSTING: { label: "Needs costing", tone: "violet", waitingOn: "PRESALES" },
  WITH_PURCHASE: { label: "With purchase", tone: "aqua", waitingOn: "PURCHASE" },
  READY_TO_QUOTE: { label: "Ready to quote", tone: "blue", waitingOn: "SALES" },
  QUOTE_SENT: { label: "Quote with customer", tone: "blue", waitingOn: "CUSTOMER" },
  CHANGES_REQUESTED: { label: "Customer wants changes", tone: "amber", waitingOn: "SALES" },
  ACCEPTED: { label: "Quote accepted", tone: "green", waitingOn: null },
  CLOSED: { label: "Closed", tone: "slate", waitingOn: null },
};

export const OPEN_PRESALES = ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as const;
export const OPEN_PRICING = ["REQUESTED", "IN_PROGRESS"] as const;

type Req = { status: string; dueDate: Date; createdAt: Date; assignee: string } & Partial<{ submittedAt: Date | null; quotedAt: Date | null; quoteValidTill: Date | null; returnedAt: Date | null; returnReason: string | null; infoQuestion: string | null }>;

export type WorkflowInput = {
  stage: string;
  lines: { lineNo?: number; pricingStatus: string; unitCost: number | null; unitPrice: number | null; isEstimate: boolean; costSource?: string; costValidTill?: Date | null }[];
  presales: Req | null; // latest presales request
  pricing: Req | null; // latest pricing request
  quote: { status: string; version: number; validTill: Date; createdAt: Date } | null; // latest quote
  now: Date;
};

export type WorkflowView = {
  state: WorkflowState;
  label: string;
  tone: (typeof WORKFLOW_META)[WorkflowState]["tone"];
  waitingOn: (typeof WORKFLOW_META)[WorkflowState]["waitingOn"];
  owner: string | null;
  due: Date | null;
  overdue: boolean;
  /** Plain reasons why the next step cannot happen yet */
  blockers: string[];
  /** Purchase lines with no current cost (new, or changed since they were costed) */
  needsCost: number;
  /** Own-brand lines waiting on a cost from presales */
  needsInternalCost: number;
  /** Purchase lines whose supplier price has lapsed */
  expiredCost: number;
  needsPrice: number;
};

const isOpen = (r: Req | null, open: readonly string[]) => !!r && open.includes(r.status);

/** The single source of truth for "where is this deal in the workflow, and who is it waiting on". */
export function deriveWorkflow(i: WorkflowInput): WorkflowView {
  const real = i.lines.filter((l) => !l.isEstimate);
  const lines = i.lines.map((l) => ({ ...l, costSource: l.costSource ?? "PURCHASE" }));
  const needsCost = lines.filter(needsPurchaseCost).length;
  const internal = lines.filter(needsInternalCost);
  const expired = lines.filter((l) => costExpired(l, i.now));
  const needsPrice = real.filter((l) => l.unitPrice === null).length;
  const estimates = i.lines.filter((l) => l.isEstimate).length;
  const blockers: string[] = [];
  let state: WorkflowState;
  let owner: string | null = null;
  let due: Date | null = null;

  if (i.stage === "WON") state = "ACCEPTED";
  else if (i.stage === "LOST" || i.stage === "DROPPED") state = "CLOSED";
  else if (isOpen(i.presales, OPEN_PRESALES)) {
    state = i.presales!.status === "NEEDS_INFO" ? "WAITING_ON_SALES" : "WITH_PRESALES";
    owner = i.presales!.assignee;
    due = i.presales!.status === "NEEDS_INFO" ? null : i.presales!.dueDate;
    if (state === "WAITING_ON_SALES") blockers.push(`${i.presales!.assignee} asked: ${i.presales!.infoQuestion ?? "see the request"}`);
  } else if (isOpen(i.pricing, OPEN_PRICING)) {
    state = "WITH_PURCHASE";
    owner = i.pricing!.assignee;
    due = i.pricing!.dueDate;
  } else {
    // The latest quote counts only if nothing in the BOQ or pricing moved after it
    const lastWork = Math.max(
      i.presales?.submittedAt?.getTime() ?? 0,
      i.pricing?.quotedAt?.getTime() ?? 0,
      i.pricing?.returnedAt?.getTime() ?? 0,
    );
    const quoteCurrent = !!i.quote && i.quote.createdAt.getTime() >= lastWork && ["SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED"].includes(i.quote.status);
    if (quoteCurrent && i.quote!.status === "SUBMITTED") {
      state = "QUOTE_SENT";
      if (i.quote!.validTill < i.now) blockers.push(`Quote v${i.quote!.version} expired on ${fmtDate(i.quote!.validTill)}. Re-issue it or record the customer's response.`);
    } else if (quoteCurrent && i.quote!.status === "CHANGES_REQUESTED") state = "CHANGES_REQUESTED";
    else if (quoteCurrent && i.quote!.status === "ACCEPTED") state = "ACCEPTED";
    else if (!real.length) state = "ESTIMATE";
    else if (needsCost > 0) state = "NEEDS_PRICING";
    else if (internal.length) state = "NEEDS_COSTING";
    else state = "READY_TO_QUOTE";
  }

  if (state === "READY_TO_QUOTE" || state === "CHANGES_REQUESTED") {
    if (estimates) blockers.push(`Replace ${estimates} estimate line${estimates > 1 ? "s" : ""} with catalogue products.`);
    if (expired.length) {
      const first = new Date(Math.min(...expired.map((l) => l.costValidTill!.getTime())));
      const which = expired.every((l) => l.lineNo) ? ` on ${linesText(expired.map((l) => l.lineNo!))}` : "";
      blockers.push(`Supplier pricing${which} expired on ${fmtDate(first)}. Ask purchase to re-validate it.`);
    }
  }
  if (state === "NEEDS_PRICING" && i.pricing?.status === "RETURNED")
    blockers.push(`Purchase sent the BOQ back: ${i.pricing.returnReason ?? "see the request"}`);
  if (state === "NEEDS_PRICING") blockers.push(`${needsCost} line${needsCost > 1 ? "s need" : " needs"} a current cost from purchase.`);
  if ((state === "NEEDS_PRICING" || state === "NEEDS_COSTING") && internal.length) {
    const which = internal.every((l) => l.lineNo) ? linesText(internal.map((l) => l.lineNo!)) : `${internal.length} own-brand line${internal.length > 1 ? "s" : ""}`;
    blockers.push(`${which[0].toUpperCase()}${which.slice(1)} need${internal.length > 1 ? "" : "s"} a cost from presales.`);
  }

  const meta = WORKFLOW_META[state];
  return { state, label: meta.label, tone: meta.tone, waitingOn: meta.waitingOn, owner, due, overdue: !!due && due < i.now, blockers, needsCost, needsInternalCost: internal.length, expiredCost: expired.length, needsPrice };
}

// ───────────── BOQ line changes ─────────────

export type LineSpec = {
  productId: string | null;
  partNumber: string | null;
  description: string;
  quantity: number;
  billingFrequency: string;
  termMonths: number | null;
  oemId: string;
  categoryId: string;
};

/**
 * A costed line whose specification changed needs a fresh cost: purchase priced a different thing.
 * Sell price and notes do not count; quantity and term do (volume and duration change supplier pricing).
 */
export function specChanged(a: LineSpec, b: LineSpec): boolean {
  return (
    a.productId !== b.productId ||
    (a.partNumber ?? "") !== (b.partNumber ?? "") ||
    a.description.trim() !== b.description.trim() ||
    Number(a.quantity) !== Number(b.quantity) ||
    a.billingFrequency !== b.billingFrequency ||
    (a.termMonths ?? null) !== (b.termMonths ?? null) ||
    a.oemId !== b.oemId ||
    a.categoryId !== b.categoryId
  );
}

/** When sales answers a presales question, the due date moves out by however long presales waited. */
export function resumeDueDate(due: Date, pausedAt: Date | null, now: Date): Date {
  if (!pausedAt) return due;
  const waited = Math.max(0, now.getTime() - pausedAt.getTime());
  return new Date(due.getTime() + waited);
}

/** Who may edit the BOQ specification right now, given open requests. Returns a reason when locked. */
export function specLock(input: {
  presalesOpen: { assigneeId: string } | null;
  pricingOpen: boolean;
  userId: string;
  isManager: boolean;
}): string | null {
  if (input.pricingOpen && !input.isManager)
    return "The BOQ is with purchase for pricing. Use Request revision to change it, so purchase prices the right thing.";
  if (input.presalesOpen && input.presalesOpen.assigneeId !== input.userId && !input.isManager)
    return "Presales is working on the BOQ. Ask them for changes, or wait until they submit it.";
  return null;
}

// ───────────── Reminders and escalations ─────────────

export type Nudge = "REMIND_DUE" | "ESCALATE" | "REMIND_SALES" | null;

/**
 * What the automation should do about an open request right now. Each nudge is sent once:
 * `remindedAt` / `escalatedAt` are cleared when the request is reassigned or its due date moves.
 */
export function requestNudge(
  r: { status: string; dueDate: Date; remindedAt: Date | null; escalatedAt: Date | null; infoRequestedAt?: Date | null },
  now: Date,
): Nudge {
  const DAY = 86_400_000;
  if (r.status === "NEEDS_INFO") {
    const asked = r.infoRequestedAt;
    if (asked && now.getTime() - asked.getTime() >= 2 * DAY && (!r.remindedAt || r.remindedAt < asked)) return "REMIND_SALES";
    return null;
  }
  if (r.status !== "REQUESTED" && r.status !== "IN_PROGRESS") return null;
  const left = r.dueDate.getTime() - now.getTime();
  if (left < 0) return r.escalatedAt ? null : "ESCALATE";
  if (left <= DAY && !r.remindedAt) return "REMIND_DUE";
  return null;
}

/** A sent quote about to lapse: remind sales once, three days before. */
export function quoteExpiring(q: { status: string; validTill: Date; remindedAt: Date | null }, now: Date) {
  const left = q.validTill.getTime() - now.getTime();
  return q.status === "SUBMITTED" && !q.remindedAt && left >= 0 && left <= 3 * 86_400_000;
}
