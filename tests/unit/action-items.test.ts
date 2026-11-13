import { describe, it, expect } from "vitest";
import { actionItems, type ActionDeal } from "@/lib/action-items";

const now = new Date("2026-11-13T06:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const deal = (p: Partial<ActionDeal> = {}): ActionDeal => ({
  id: "d1", name: "Acme SD-WAN", account: "Acme", owner: "Rakesh", stage: "PROPOSAL", expectedCloseDate: days(30),
  nextStep: null, nextStepDate: null, healthLabel: "HEALTHY", questionAskedAt: null, quote: null, pricedAt: null, workOpen: false, ...p,
});

describe("needs your action", () => {
  it("nothing for a healthy deal with nothing waiting on sales", () => {
    expect(actionItems([deal()], now)).toEqual([]);
  });
  it("names each thing waiting on sales", () => {
    const kind = (p: Partial<ActionDeal>) => actionItems([deal(p)], now)[0]?.kind;
    expect(kind({ questionAskedAt: days(-1) })).toBe("ANSWER_PRESALES");
    expect(kind({ quote: { status: "SUBMITTED", validTill: days(-1), createdAt: days(-20) } })).toBe("QUOTE_EXPIRED");
    expect(kind({ quote: { status: "SUBMITTED", validTill: days(2), createdAt: days(-20) } })).toBe("QUOTE_EXPIRING");
    expect(kind({ quote: { status: "SUBMITTED", validTill: days(10), createdAt: days(-20) } })).toBeUndefined();
    expect(kind({ quote: { status: "CHANGES_REQUESTED", validTill: days(10), createdAt: days(-5) } })).toBe("REVISE_QUOTE");
    expect(kind({ quote: { status: "ACCEPTED", validTill: days(10), createdAt: days(-5) } })).toBe("RECORD_PO");
    expect(kind({ pricedAt: days(-2) })).toBe("READY_TO_QUOTE");
    expect(actionItems([deal({ pricedAt: days(-2) })], now)[0].label).toBe("Purchase priced it: set the sales prices");
    expect(kind({ expectedCloseDate: days(-3) })).toBe("CLOSE_DATE_PASSED");
    expect(kind({ nextStep: "Call", nextStepDate: days(-1) })).toBe("NEXT_STEP_OVERDUE");
    expect(kind({ healthLabel: "DYING" })).toBe("NO_ACTIVITY");
    expect(kind({ amount: 0 })).toBeUndefined(); // the value comes at pricing
  });
  it("priced deals already quoted since, or with work still open, are not 'ready to quote'", () => {
    expect(actionItems([deal({ pricedAt: days(-5), quote: { status: "SUBMITTED", validTill: days(20), createdAt: days(-2) } })], now)).toEqual([]);
    expect(actionItems([deal({ pricedAt: days(-5), workOpen: true })], now)).toEqual([]);
  });
  it("price approvals: the approver approves, then the owner sends (or revises)", () => {
    const at = days(-1);
    const kinds = (approval: ActionDeal["approval"]) => actionItems([deal({ pricedAt: days(-3), approval })], now)[0]?.kind;
    expect(kinds({ status: "PENDING", waitingOnMe: true, at })).toBe("APPROVE_PRICES");
    expect(kinds({ status: "PENDING", waitingOnMe: false, at })).toBeUndefined(); // the owner waits
    expect(kinds({ status: "APPROVED", waitingOnMe: false, at })).toBe("PRICES_APPROVED");
    expect(kinds({ status: "REJECTED", waitingOnMe: false, at })).toBe("PRICES_REJECTED");
    // An approval older than the latest quote is history
    const quote = { status: "SUBMITTED", validTill: days(20), createdAt: days(-1) };
    expect(actionItems([deal({ quote, approval: { status: "APPROVED", waitingOnMe: false, at: days(-2) } })], now)).toEqual([]);
  });

  it("after a revision is re-priced, the owner re-checks the prices", () => {
    expect(actionItems([deal({ pricedAt: days(-1), quote: { status: "SUBMITTED", validTill: days(20), createdAt: days(-5) } })], now)[0]?.label).toBe("Re-priced: re-check the sales prices");
  });

  it("held and closed deals are left alone", () => {
    for (const stage of ["HOLD", "WON", "LOST", "DROPPED"]) expect(actionItems([deal({ stage, expectedCloseDate: days(-3) })], now)).toEqual([]);
  });
  it("one line per deal, its most urgent item, and the most urgent deals first", () => {
    const items = actionItems([
      deal({ id: "a", healthLabel: "DYING", expectedCloseDate: days(-3) }),
      deal({ id: "b", questionAskedAt: days(-1), healthLabel: "DYING" }),
      deal({ id: "c", nextStep: "Demo", nextStepDate: days(-2) }),
    ], now);
    expect(items.map((i) => [i.dealId, i.kind])).toEqual([["b", "ANSWER_PRESALES"], ["a", "CLOSE_DATE_PASSED"], ["c", "NEXT_STEP_OVERDUE"]]);
  });
});
