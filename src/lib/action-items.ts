// "Needs your action" on the home page (pure, unit-tested): the one thing to do next on each deal that is waiting on
// sales, most urgent first. A deal appears once, for its most urgent item.

export type ActionKind =
  | "ANSWER_PRESALES" | "QUOTE_EXPIRED" | "QUOTE_EXPIRING" | "REVISE_QUOTE" | "RECORD_PO" | "READY_TO_QUOTE"
  | "CLOSE_DATE_PASSED" | "NEXT_STEP_OVERDUE" | "NO_ACTIVITY";

/** Lower is more urgent */
const URGENCY: Record<ActionKind, number> = {
  ANSWER_PRESALES: 0, QUOTE_EXPIRED: 0, RECORD_PO: 1, REVISE_QUOTE: 1, QUOTE_EXPIRING: 1, READY_TO_QUOTE: 2,
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
};

export type ActionItem = { dealId: string; deal: string; account: string; owner: string; kind: ActionKind; label: string; at: Date };

const DAY = 86_400_000;
const short = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Every item a deal has, most urgent first */
function itemsFor(d: ActionDeal, now: Date): Omit<ActionItem, "dealId" | "deal" | "account" | "owner">[] {
  if (["WON", "LOST", "DROPPED", "HOLD"].includes(d.stage)) return [];
  const out: Omit<ActionItem, "dealId" | "deal" | "account" | "owner">[] = [];
  if (d.questionAskedAt) out.push({ kind: "ANSWER_PRESALES", label: "Answer presales' question", at: d.questionAskedAt });
  const q = d.quote;
  if (q?.status === "SUBMITTED") {
    if (q.validTill < now) out.push({ kind: "QUOTE_EXPIRED", label: `Quote expired ${short(q.validTill)}`, at: q.validTill });
    else if (q.validTill.getTime() - now.getTime() <= 3 * DAY) out.push({ kind: "QUOTE_EXPIRING", label: `Quote expires ${short(q.validTill)}`, at: q.validTill });
  }
  if (q?.status === "CHANGES_REQUESTED") out.push({ kind: "REVISE_QUOTE", label: "Customer wants changes: revise the quote", at: q.createdAt });
  if (q?.status === "ACCEPTED") out.push({ kind: "RECORD_PO", label: "Quote accepted: record the PO", at: q.createdAt });
  if (!d.workOpen && d.pricedAt && (!q || q.createdAt < d.pricedAt)) out.push({ kind: "READY_TO_QUOTE", label: "Priced: send the quote", at: d.pricedAt });
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
