// "Needs your action" on the home page (pure, unit-tested): the one thing to do next on each deal that is waiting on
// sales, most urgent first. A deal appears once, for its most urgent item.

export type ActionKind =
  | "ANSWER_PRESALES" | "QUOTE_EXPIRED" | "QUOTE_EXPIRING" | "REVISE_QUOTE" | "RECORD_PO" | "READY_TO_QUOTE"
  | "CLOSE_DATE_PASSED" | "NEXT_STEP_OVERDUE" | "NO_ACTIVITY" | "APPROVE_PRICES" | "PRICES_APPROVED" | "PRICES_REJECTED";

/** Lower is more urgent */
const URGENCY: Record<ActionKind, number> = {
  ANSWER_PRESALES: 0, QUOTE_EXPIRED: 0, RECORD_PO: 1, REVISE_QUOTE: 1, QUOTE_EXPIRING: 1, APPROVE_PRICES: 0, PRICES_APPROVED: 1, PRICES_REJECTED: 1, READY_TO_QUOTE: 2,
  CLOSE_DATE_PASSED: 2, NEXT_STEP_OVERDUE: 3, NO_ACTIVITY: 4,
};

export type ActionDeal = {
  id: string;
  name: string;
  account: string;
  owner: string;
  stage: string;
  expectedCloseDate: Date;
  nextStep: string | null;
  nextStepDate: Date | null;
  healthLabel: string;
  /** Presales asked a question and is waiting (when they asked) */
  questionAskedAt: Date | null;
  /** Latest quote, if any */
  quote: { status: string; validTill: Date; createdAt: Date } | null;
  /** When purchase last completed pricing */
  pricedAt: Date | null;
  /** A BOQ or pricing request is still open */
  workOpen: boolean;
  /** The latest price approval: waiting (on this viewer or someone else), approved or rejected, and when */
  approval?: { status: "PENDING" | "APPROVED" | "REJECTED"; waitingOnMe: boolean; at: Date } | null;
  /** Deal value; 0 when it was created without one (needed before it is qualified) */
  amount?: number;
  /** When the deal was created */
  createdAt?: Date;
};

export type ActionItem = { dealId: string; deal: string; account: string; owner: string; kind: ActionKind; label: string; at: Date };

const DAY = 86_400_000;
const short = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Every item a deal has, most urgent first. The owner prices and sends; approvers approve when a rule applies. */
function itemsFor(d: ActionDeal, now: Date): Omit<ActionItem, "dealId" | "deal" | "account" | "owner">[] {
  if (["WON", "LOST", "DROPPED", "HOLD"].includes(d.stage)) return [];
  const out: Omit<ActionItem, "dealId" | "deal" | "account" | "owner">[] = [];
  if (d.questionAskedAt) out.push({ kind: "ANSWER_PRESALES", label: "Answer presales' question", at: d.questionAskedAt });
  // An approval about prices newer than the latest quote: the approver acts, then the owner
  const ap = d.approval && (!d.quote || d.approval.at > d.quote.createdAt) ? d.approval : null;
  if (ap?.status === "PENDING" && ap.waitingOnMe) out.push({ kind: "APPROVE_PRICES", label: "Approve the prices", at: ap.at });
  if (ap?.status === "APPROVED") out.push({ kind: "PRICES_APPROVED", label: "Prices approved: send the quote", at: ap.at });
  if (ap?.status === "REJECTED") out.push({ kind: "PRICES_REJECTED", label: "Prices not approved: revise them", at: ap.at });
  const ready = !!ap; // prices are with an approval: no "set the prices" nudge on top
  const q = d.quote;
  if (q?.status === "SUBMITTED") {
    if (q.validTill < now) out.push({ kind: "QUOTE_EXPIRED", label: `Quote expired ${short(q.validTill)}`, at: q.validTill });
    else if (q.validTill.getTime() - now.getTime() <= 3 * DAY) out.push({ kind: "QUOTE_EXPIRING", label: `Quote expires ${short(q.validTill)}`, at: q.validTill });
  }
  if (q?.status === "CHANGES_REQUESTED" && !ready) out.push({ kind: "REVISE_QUOTE", label: "Customer wants changes: revise the prices", at: q.createdAt });
  if (q?.status === "ACCEPTED") out.push({ kind: "RECORD_PO", label: "Quote accepted: record the PO", at: q.createdAt });
  if (!ready && !d.workOpen && d.pricedAt && (!q || q.createdAt < d.pricedAt))
    out.push({ kind: "READY_TO_QUOTE", label: q ? "Re-priced: re-check the sales prices" : "Purchase priced it: set the sales prices", at: d.pricedAt });
  if (d.expectedCloseDate < now) out.push({ kind: "CLOSE_DATE_PASSED", label: `Close date passed (${short(d.expectedCloseDate)})`, at: d.expectedCloseDate });
  if (d.nextStepDate && d.nextStepDate < now) out.push({ kind: "NEXT_STEP_OVERDUE", label: `Overdue: ${d.nextStep ?? "next step"}`, at: d.nextStepDate });
  if (d.healthLabel === "DYING") out.push({ kind: "NO_ACTIVITY", label: "Going cold: no recent activity", at: d.expectedCloseDate });
  return out.sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind] || a.at.getTime() - b.at.getTime());
}

/** One item per deal (its most urgent), most urgent deals first, then the oldest. */
export function actionItems(deals: ActionDeal[], now = new Date()): ActionItem[] {
  return deals
    .flatMap((d) => {
      const top = itemsFor(d, now)[0];
      return top ? [{ dealId: d.id, deal: d.name, account: d.account, owner: d.owner, ...top }] : [];
    })
    .sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind] || a.at.getTime() - b.at.getTime());
}
