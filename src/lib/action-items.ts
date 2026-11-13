// "Needs your action" on the home page (pure, unit-tested): the one thing to do next on each deal that is waiting on
// sales, most urgent first. A deal appears once, for its most urgent item.

export type ActionKind =
  | "ANSWER_PRESALES" | "QUOTE_EXPIRED" | "QUOTE_EXPIRING" | "REVISE_QUOTE" | "RECORD_PO" | "READY_TO_QUOTE"
  | "CLOSE_DATE_PASSED" | "NEXT_STEP_OVERDUE" | "NO_ACTIVITY" | "SEND_QUOTE" | "ADD_VALUE";

/** Lower is more urgent */
const URGENCY: Record<ActionKind, number> = {
  ANSWER_PRESALES: 0, QUOTE_EXPIRED: 0, RECORD_PO: 1, REVISE_QUOTE: 1, QUOTE_EXPIRING: 1, SEND_QUOTE: 1, READY_TO_QUOTE: 2,
  CLOSE_DATE_PASSED: 2, NEXT_STEP_OVERDUE: 3, ADD_VALUE: 3, NO_ACTIVITY: 4,
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
  /** When the deal owner set the sales prices and asked a sales manager to send the quote */
  pricesReadyAt?: Date | null;
  /** Deal value; 0 when it was created without one (needed before it is qualified) */
  amount?: number;
  /** When the deal was created */
  createdAt?: Date;
};

export type ActionItem = { dealId: string; deal: string; account: string; owner: string; kind: ActionKind; label: string; at: Date };

const DAY = 86_400_000;
const short = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/**
 * Sales prices are set and waiting for a sales manager to send the quote: set after purchase last priced the deal and
 * after the latest quote, with no BOQ or pricing work open.
 */
export function pricesReady(d: Pick<ActionDeal, "pricesReadyAt" | "pricedAt" | "quote" | "workOpen">): boolean {
  const at = d.pricesReadyAt;
  return !!at && !d.workOpen && (!d.pricedAt || at > d.pricedAt) && (!d.quote || at > d.quote.createdAt);
}

/** Every item a deal has, most urgent first. Managers send quotes; the deal owner sets the sales prices. */
function itemsFor(d: ActionDeal, now: Date, manager: boolean): Omit<ActionItem, "dealId" | "deal" | "account" | "owner">[] {
  if (["WON", "LOST", "DROPPED", "HOLD"].includes(d.stage)) return [];
  const out: Omit<ActionItem, "dealId" | "deal" | "account" | "owner">[] = [];
  if (d.questionAskedAt) out.push({ kind: "ANSWER_PRESALES", label: "Answer presales' question", at: d.questionAskedAt });
  const ready = pricesReady(d);
  if (ready && manager) out.push({ kind: "SEND_QUOTE", label: "Prices set: review and send the quote", at: d.pricesReadyAt! });
  const q = d.quote;
  if (q?.status === "SUBMITTED") {
    if (q.validTill < now) out.push({ kind: "QUOTE_EXPIRED", label: `Quote expired ${short(q.validTill)}`, at: q.validTill });
    else if (q.validTill.getTime() - now.getTime() <= 3 * DAY) out.push({ kind: "QUOTE_EXPIRING", label: `Quote expires ${short(q.validTill)}`, at: q.validTill });
  }
  if (q?.status === "CHANGES_REQUESTED" && !ready) out.push({ kind: "REVISE_QUOTE", label: "Customer wants changes: revise the prices", at: q.createdAt });
  if (q?.status === "ACCEPTED") out.push({ kind: "RECORD_PO", label: "Quote accepted: record the PO", at: q.createdAt });
  if (!ready && !d.workOpen && d.pricedAt && (!q || q.createdAt < d.pricedAt)) out.push({ kind: "READY_TO_QUOTE", label: "Purchase priced it: set the sales prices", at: d.pricedAt });
  if (d.expectedCloseDate < now) out.push({ kind: "CLOSE_DATE_PASSED", label: `Close date passed (${short(d.expectedCloseDate)})`, at: d.expectedCloseDate });
  if (d.amount === 0) out.push({ kind: "ADD_VALUE", label: "Add the estimated value", at: d.createdAt ?? d.expectedCloseDate });
  if (d.nextStepDate && d.nextStepDate < now) out.push({ kind: "NEXT_STEP_OVERDUE", label: `Overdue: ${d.nextStep ?? "next step"}`, at: d.nextStepDate });
  if (d.healthLabel === "DYING") out.push({ kind: "NO_ACTIVITY", label: "Going cold: no recent activity", at: d.expectedCloseDate });
  return out.sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind] || a.at.getTime() - b.at.getTime());
}

/** One item per deal (its most urgent), most urgent deals first, then the oldest. `manager`: the viewer sends quotes. */
export function actionItems(deals: ActionDeal[], now = new Date(), manager = false): ActionItem[] {
  return deals
    .flatMap((d) => {
      const top = itemsFor(d, now, manager)[0];
      return top ? [{ dealId: d.id, deal: d.name, account: d.account, owner: d.owner, ...top }] : [];
    })
    .sort((a, b) => URGENCY[a.kind] - URGENCY[b.kind] || a.at.getTime() - b.at.getTime());
}
