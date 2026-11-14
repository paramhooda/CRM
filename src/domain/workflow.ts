// What happens next on a deal, who does it, and which hand-over actions are allowed right now. Pure and
// unit-tested; the server answers requests with the same rules and the deal page only renders the result.
import { isClosed, isOpen, type DealFacts, type Stage } from "./stages";
import type { Role } from "./scope";

export type Party = "SALES" | "PRESALES" | "PURCHASE" | "APPROVER" | "MANAGER";

/** Who is looking at the deal, and what they are to it. `canEdit` is the raw owner-or-manager check. */
export type Viewer = {
  role: Role;
  canEdit: boolean;
  isManager: boolean;
  isAssignedPresales: boolean;
  isAssignedPurchase: boolean;
  /** The current approval step lists the viewer */
  isApprover: boolean;
};

/** Names and due dates the panel needs to say who is waited on. Dates are yyyy-mm-dd. */
export type People = { owner: string; presales: string | null; purchase: string | null; presalesDue: string | null; pricingDue: string | null };

export type RequestKind = "presales" | "pricing";

/** Why a request of this kind cannot be raised now; empty when it can. */
export function requestBlockers(kind: RequestKind, f: DealFacts, v: Viewer): string[] {
  const out: string[] = [];
  if (f.deleted) return ["This deal is deleted."];
  if (!isOpen(f.stage)) return [f.stage === "HOLD" ? "The deal is on hold. Resume it first." : "This deal is closed."];
  if (kind === "presales") {
    if (f.stage === "QUALIFIED") out.push("Hand the deal to presales with Advance to BOQ.");
    else if (f.stage !== "BOQ") out.push("Presales is involved in the BOQ stage only; a manager can move the deal back.");
    if (f.openPresalesRequest) out.push("There is already an open presales request on this deal.");
    if (f.presalesDocuments === 0) out.push("Attach the customer's requirement (RFP, SoW or similar) under Documents first.");
    if (!v.canEdit) out.push("Only the deal owner or a manager can ask presales.");
    return out;
  }
  if (f.openPricingRequest) out.push("There is already an open pricing request on this deal.");
  if (f.lineCount === 0) out.push("Add the lines first; purchase prices what is on the deal.");
  else if (f.thirdPartyLines === 0) out.push("Every line is own IP; there is nothing for purchase to price.");
  if (f.openPresalesRequest && !v.isAssignedPresales && v.role !== "ADMIN") out.push("Presales is still working on the BOQ; they ask purchase, or wait for the BOQ.");
  if (!v.canEdit && !v.isAssignedPresales) out.push("Only the deal owner, their manager or the assigned presales engineer can ask purchase.");
  return out;
}

/** May the viewer attach a file? Anyone working the deal while it is live; admins always. */
export function canUploadDocument(v: Viewer, stage: Stage, deleted: boolean): boolean {
  if (deleted) return false;
  if (v.role === "ADMIN") return true;
  if (isClosed(stage)) return false;
  return v.canEdit || v.isAssignedPresales || v.isAssignedPurchase;
}

export type StepAction =
  | "SET_CONTACT" | "FIX_CLOSE_DATE" | "ATTACH_DOCUMENT" | "ADD_LINES" | "ADVANCE" | "ASK_PRESALES" | "ASK_PRICING"
  | "START_REQUEST" | "SUBMIT_BOQ" | "ENTER_COSTS" | "COMPLETE_PRICING" | "SET_PRICES" | "ASK_APPROVAL" | "DECIDE_APPROVAL"
  | "ATTACH_PO" | "CLOSE_WON" | "RESUME" | "REOPEN";

export type Step = {
  key: string;
  label: string;
  owner: Party;
  done: boolean;
  /** The first step not done */
  current: boolean;
  /** The viewer is the one to do it */
  mine: boolean;
  hint?: string;
  action?: StepAction;
};

export type NextActions = {
  headline: string;
  detail?: string;
  /** Set when the current step is someone else's */
  waitingOn?: { party: Party; name: string | null; due: string | null };
  steps: Step[];
};

const PARTY_LABEL: Record<Party, string> = { SALES: "sales", PRESALES: "presales", PURCHASE: "purchase", APPROVER: "the approvers", MANAGER: "a manager" };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("N", String(n)));

type Draft = Omit<Step, "done" | "current" | "mine"> & { done?: boolean };

function isMine(v: Viewer, p: Party): boolean {
  switch (p) {
    case "SALES": return v.canEdit;
    case "PRESALES": return v.isAssignedPresales || v.role === "ADMIN";
    case "PURCHASE": return v.isAssignedPurchase || v.role === "ADMIN";
    case "APPROVER": return v.isApprover;
    case "MANAGER": return v.isManager;
  }
}

/** The pricing block shared by every stage after the lines exist: costs, then sales prices, then approval. */
function priceSteps(f: DealFacts): Draft[] {
  const out: Draft[] = [];
  if (f.thirdPartyLines > 0) {
    const n = f.uncostedThirdPartyLines;
    if (f.openPricingRequest) {
      if (f.pricingRequest === "REQUESTED") out.push({ key: "start-pricing", label: "Start pricing", owner: "PURCHASE", action: "START_REQUEST", hint: "Purchase has been asked for prices." });
      out.push({ key: "costs", label: n > 0 ? `Enter the purchase cost on ${plural(n, "the remaining line", "N lines")} and complete pricing` : "Complete pricing", owner: "PURCHASE", action: n > 0 ? "ENTER_COSTS" : "COMPLETE_PRICING" });
    } else out.push({ key: "ask-pricing", label: "Ask purchase for prices", owner: "SALES", action: "ASK_PRICING", done: n === 0, hint: "Purchase enters the purchase cost on every third-party line." });
  }
  const ownIpUncosted = f.uncostedLines - f.uncostedThirdPartyLines;
  if (ownIpUncosted > 0) out.push({ key: "own-ip-costs", label: `Enter the cost on ${plural(ownIpUncosted, "the own-IP line", "N own-IP lines")}`, owner: "PRESALES", action: "ENTER_COSTS", hint: "Own-IP lines take the product's standard cost; presales or an admin sets it." });
  out.push({ key: "prices", label: f.unpricedLines > 0 ? `Set a sales price on ${plural(f.unpricedLines, "the remaining line", "N lines")}` : "Set the sales prices", owner: "SALES", action: "SET_PRICES", done: f.lineCount > 0 && f.unpricedLines === 0, hint: "Add the margin per line; the deal's GM updates as you go." });
  const rules = f.approvalRules.length ? f.approvalRules.join(", ") : "an approval rule";
  if (f.approvalState === "NEEDED" || f.approvalState === "STALE" || f.approvalState === "REJECTED")
    out.push({ key: "approval", label: f.approvalState === "REJECTED" ? "Change the prices and ask for approval again" : f.approvalState === "STALE" ? "Ask for approval again (the lines changed)" : `Ask for approval (${rules})`, owner: "SALES", action: "ASK_APPROVAL", hint: `${f.approvalRules.length ? "This rule applies" : "An approval rule applies"} to these prices: ${rules}.` });
  if (f.approvalState === "PENDING") out.push({ key: "approval", label: "Approve or reject the prices", owner: "APPROVER", action: "DECIDE_APPROVAL" });
  if (f.approvalState === "APPROVED") out.push({ key: "approval", label: "Prices approved", owner: "APPROVER", done: true });
  return out;
}

function closeSteps(f: DealFacts): Draft[] {
  return [
    { key: "po", label: "Attach the customer's PO under Documents", owner: "SALES", action: "ATTACH_PO", done: f.hasPoDocument },
    { key: "won", label: "Close as won (enter the PO number)", owner: "SALES", action: "CLOSE_WON" },
  ];
}

function stageSteps(f: DealFacts): { steps: Draft[]; done?: string; detail?: string } {
  switch (f.stage) {
    case "QUALIFIED": {
      const steps: Draft[] = [{ key: "contact", label: "Set the customer contact", owner: "SALES", action: "SET_CONTACT", done: f.hasPrimaryContact }];
      if (f.closeDatePast) steps.push({ key: "close-date", label: "Set an expected close date in the future", owner: "SALES", action: "FIX_CLOSE_DATE" });
      if (f.needsPresales) {
        steps.push({ key: "document", label: "Attach the customer's requirement (RFP, SoW or similar)", owner: "SALES", action: "ATTACH_DOCUMENT", done: f.presalesDocuments > 0, hint: "Presales works from it." });
        steps.push({ key: "advance", label: "Hand over to presales: Advance to BOQ", owner: "SALES", action: "ADVANCE", hint: "Pick the engineer, a due date and the scope." });
        return { steps, detail: "This deal needs a BOQ from presales before the proposal. Change that under Edit details if it does not." };
      }
      steps.push({ key: "lines", label: "Add the lines (what is being sold)", owner: "SALES", action: "ADD_LINES", done: f.lineCount > 0 });
      if (f.lineCount > 0) steps.push(...priceSteps(f));
      steps.push({ key: "advance", label: "Advance to Proposal Submitted", owner: "SALES", action: "ADVANCE", hint: "Once the proposal has gone to the customer." });
      return { steps, detail: "No presales needed: price the lines and send the proposal. Change that under Edit details if a BOQ is needed." };
    }
    case "BOQ": {
      const steps: Draft[] = [];
      if (f.openPresalesRequest) {
        if (f.presalesRequest === "REQUESTED") steps.push({ key: "start-boq", label: "Start the BOQ", owner: "PRESALES", action: "START_REQUEST" });
        steps.push({ key: "lines", label: f.lineCount === 0 ? "Build the BOQ: add the lines" : "Refine the BOQ lines", owner: "PRESALES", action: "ADD_LINES", done: f.lineCount > 0, hint: "Products, quantities, terms; costs on own-IP lines. Ask purchase for prices if you want them before you submit." });
        steps.push({ key: "submit-boq", label: "Submit the BOQ", owner: "PRESALES", action: "SUBMIT_BOQ", hint: f.lineCount === 0 ? "Needs at least one line." : "Hands the deal back to sales with a short summary." });
      } else if (f.presalesRequest === "SUBMITTED") steps.push({ key: "boq", label: "BOQ submitted by presales", owner: "PRESALES", done: true });
      else steps.push({ key: "ask-presales", label: "Ask presales for the BOQ (or Skip BOQ if none is needed)", owner: "SALES", action: "ASK_PRESALES" });
      if (f.lineCount > 0 || !f.openPresalesRequest) steps.push(...priceSteps(f));
      steps.push({ key: "advance", label: "Advance to Proposal Submitted", owner: "SALES", action: "ADVANCE", hint: "Once the proposal has gone to the customer." });
      return { steps };
    }
    case "PROPOSAL_SUBMITTED":
    case "NEGOTIATION": {
      const steps: Draft[] = [];
      if (f.lineCount === 0) steps.push({ key: "lines", label: "Add the lines (what is being sold)", owner: "SALES", action: "ADD_LINES" });
      const price = priceSteps(f).filter((s) => !s.done || s.key === "approval");
      // After the proposal the price block only shows up when something changed and needs fixing
      if (price.some((s) => !s.done)) steps.push(...price.filter((s) => !s.done));
      steps.push(...closeSteps(f));
      return { steps, detail: f.stage === "PROPOSAL_SUBMITTED" ? "Move to Negotiation while terms are discussed, or straight to won with the PO. Lost and Hold are under More." : "Lost and Hold are under More." };
    }
    case "HOLD":
      return { steps: [{ key: "resume", label: "Resume the deal", owner: "SALES", action: "RESUME", hint: "It returns to the stage it was held from. Lost and Drop are under More." }] };
    case "CLOSED_WON":
      return { steps: [], done: "Won. Nothing left to do on this deal." };
    case "CLOSED_LOST":
    case "DROPPED":
      return { steps: [{ key: "reopen", label: "Reopen the deal", owner: "MANAGER", action: "REOPEN", hint: "Only if the customer comes back." }], detail: f.stage === "CLOSED_LOST" ? "Closed as lost." : "Dropped." };
  }
}

const SALES_SIDE: Party[] = ["SALES", "APPROVER"];

/** Presales and purchase see their own steps; everything sales does (prices, approval, proposal) folds into one line. */
function forSupportRole(drafts: Draft[], stage: Stage): Draft[] {
  const label = stage === "QUALIFIED" ? "Sales to prepare the hand-over" : stage === "HOLD" ? "Sales to resume the deal" : stage === "PROPOSAL_SUBMITTED" || stage === "NEGOTIATION" ? "Sales to close the deal" : "Sales to price the deal and send the proposal";
  const out: Draft[] = [];
  for (const d of drafts) {
    if (!SALES_SIDE.includes(d.owner)) { out.push(d); continue; }
    const last = out[out.length - 1];
    if (last?.key === "sales") last.done = !!last.done && !!d.done;
    else out.push({ key: "sales", label, owner: "SALES", done: !!d.done });
  }
  return out;
}

/** The checklist for the deal's stage, with the viewer's own step called out. */
export function nextActions(f: DealFacts, v: Viewer, people: People): NextActions {
  if (f.deleted) return { headline: "This deal is deleted.", detail: "An administrator can restore it.", steps: [] };
  const support = v.role === "PRESALES" || v.role === "PURCHASE";
  const built = stageSteps(f);
  const drafts = support ? forSupportRole(built.steps, f.stage) : built.steps;
  const done = built.done;
  const detail = support ? undefined : built.detail;
  let currentSeen = false;
  const steps: Step[] = drafts.map((d) => {
    const isDone = !!d.done;
    const current = !isDone && !currentSeen;
    if (current) currentSeen = true;
    return { ...d, done: isDone, current, mine: isMine(v, d.owner) };
  });
  const current = steps.find((s) => s.current);
  if (!current) return { headline: done ?? "Nothing to do right now.", detail, steps };
  if (current.mine) return { headline: `Your next step: ${current.label.charAt(0).toLowerCase()}${current.label.slice(1)}`, detail: current.hint ?? detail, steps };
  const name = current.owner === "SALES" ? people.owner : current.owner === "PRESALES" ? people.presales : current.owner === "PURCHASE" ? people.purchase : null;
  const due = current.owner === "PRESALES" && f.openPresalesRequest ? people.presalesDue : current.owner === "PURCHASE" && f.openPricingRequest ? people.pricingDue : null;
  return {
    headline: `Waiting on ${PARTY_LABEL[current.owner]}${name ? ` (${name})` : ""}: ${current.label.charAt(0).toLowerCase()}${current.label.slice(1)}`,
    detail: current.hint ?? detail,
    waitingOn: { party: current.owner, name, due },
    steps,
  };
}
