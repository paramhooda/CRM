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
  });
  it("priced deals already quoted since, or with work still open, are not 'ready to quote'", () => {
    expect(actionItems([deal({ pricedAt: days(-5), quote: { status: "SUBMITTED", validTill: days(20), createdAt: days(-2) } })], now)).toEqual([]);
    expect(actionItems([deal({ pricedAt: days(-5), workOpen: true })], now)).toEqual([]);
  });
  it("once the owner sets the prices, a manager sends the quote and the owner has nothing to do", () => {
    const priced = deal({ pricedAt: days(-3), pricesReadyAt: days(-1) });
    expect(actionItems([priced], now)).toEqual([]);
    expect(actionItems([priced], now, true)[0].kind).toBe("SEND_QUOTE");
    // A customer change after the quote: the owner revises the prices again, then a manager sends it
    const changes = { quote: { status: "CHANGES_REQUESTED", validTill: days(10), createdAt: days(-5) } };
    expect(actionItems([deal({ ...changes, pricesReadyAt: days(-6) })], now, true)[0].kind).toBe("REVISE_QUOTE");
    expect(actionItems([deal({ ...changes, pricesReadyAt: days(-1) })], now, true)[0].kind).toBe("SEND_QUOTE");
    // Prices set before purchase re-priced the deal are stale
    expect(actionItems([deal({ pricedAt: days(-1), pricesReadyAt: days(-3) })], now, true)[0].kind).toBe("READY_TO_QUOTE");
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
