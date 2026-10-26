import { describe, it, expect } from "vitest";
import { deriveWorkflow, specChanged, resumeDueDate, specLock, requestNudge, quoteExpiring, type WorkflowInput, type LineSpec } from "@/lib/workflow";

const DAY = 86_400_000;
const now = new Date("2026-10-26T06:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const ahead = (d: number) => new Date(now.getTime() + d * DAY);

const line = (p: Partial<WorkflowInput["lines"][number]> = {}) => ({ pricingStatus: "QUOTED", unitCost: 100, unitPrice: 130, isEstimate: false, ...p });
const req = (p: Record<string, unknown> = {}) => ({ status: "IN_PROGRESS", dueDate: ahead(3), createdAt: ago(2), assignee: "Rakesh Yadav", ...p }) as WorkflowInput["presales"];
const input = (p: Partial<WorkflowInput> = {}): WorkflowInput => ({ stage: "BOQ", lines: [line()], presales: null, pricing: null, quote: null, now, ...p });

describe("deriveWorkflow", () => {
  it("is an estimate until real BOQ lines exist", () => {
    const w = deriveWorkflow(input({ stage: "QUALIFIED", lines: [line({ isEstimate: true, unitCost: null, pricingStatus: "PENDING" })] }));
    expect(w.state).toBe("ESTIMATE");
    expect(w.waitingOn).toBe("SALES");
  });

  it("an open presales request wins: the deal is with presales, owned and due", () => {
    const w = deriveWorkflow(input({ presales: req(), pricing: req({ status: "QUOTED", quotedAt: ago(5) }) }));
    expect(w.state).toBe("WITH_PRESALES");
    expect(w.owner).toBe("Rakesh Yadav");
    expect(w.due).toEqual(ahead(3));
    expect(w.overdue).toBe(false);
  });

  it("a presales question pauses the request: waiting on sales, no due date, the question is shown", () => {
    const w = deriveWorkflow(input({ presales: req({ status: "NEEDS_INFO", dueDate: ago(1), infoQuestion: "DR at site 2?" }) }));
    expect(w.state).toBe("WAITING_ON_SALES");
    expect(w.due).toBeNull();
    expect(w.overdue).toBe(false);
    expect(w.blockers[0]).toContain("DR at site 2?");
  });

  it("an overdue pricing request is with purchase and overdue", () => {
    const w = deriveWorkflow(input({ presales: req({ status: "BOQ_SUBMITTED", submittedAt: ago(8) }), pricing: req({ status: "REQUESTED", dueDate: ago(1), assignee: "Meera Iyer" }) }));
    expect(w.state).toBe("WITH_PURCHASE");
    expect(w.owner).toBe("Meera Iyer");
    expect(w.overdue).toBe(true);
  });

  it("lines without a current cost need pricing; a send-back explains why", () => {
    const w = deriveWorkflow(input({ lines: [line(), line({ pricingStatus: "PENDING" })], pricing: req({ status: "RETURNED", returnedAt: ago(1), returnReason: "Part is end-of-sale" }) }));
    expect(w.state).toBe("NEEDS_PRICING");
    expect(w.needsCost).toBe(1);
    expect(w.blockers.join(" ")).toContain("Part is end-of-sale");
  });

  it("ready to quote lists what still blocks the quote: estimates and expired supplier pricing", () => {
    const w = deriveWorkflow(input({
      lines: [line(), line({ unitPrice: null }), line({ isEstimate: true, unitCost: null, pricingStatus: "PENDING" })],
      pricing: req({ status: "QUOTED", quotedAt: ago(40), quoteValidTill: ago(5) }),
    }));
    expect(w.state).toBe("READY_TO_QUOTE");
    // Missing sell prices are not a blocker: the quote dialog prices lines from the margin
    expect(w.blockers).toHaveLength(2);
    expect(w.blockers[1]).toMatch(/Supplier pricing expired/);
    expect(w.needsPrice).toBe(1);
  });

  it("a sent quote is with the customer; an expired one is flagged", () => {
    const w = deriveWorkflow(input({ stage: "PROPOSAL", pricing: req({ status: "QUOTED", quotedAt: ago(10) }), quote: { status: "SUBMITTED", version: 1, validTill: ago(1), createdAt: ago(9) } }));
    expect(w.state).toBe("QUOTE_SENT");
    expect(w.waitingOn).toBe("CUSTOMER");
    expect(w.blockers[0]).toMatch(/expired/);
  });

  it("a quote older than the latest BOQ or pricing work no longer counts", () => {
    const w = deriveWorkflow(input({
      stage: "PROPOSAL",
      presales: req({ status: "BOQ_SUBMITTED", submittedAt: ago(1) }),
      quote: { status: "SUBMITTED", version: 1, validTill: ahead(20), createdAt: ago(5) },
    }));
    expect(w.state).toBe("READY_TO_QUOTE");
  });

  it("customer changes and acceptance are their own states; closed deals end the workflow", () => {
    const q = (status: string) => ({ status, version: 2, validTill: ahead(10), createdAt: ago(3) });
    expect(deriveWorkflow(input({ quote: q("CHANGES_REQUESTED") })).state).toBe("CHANGES_REQUESTED");
    expect(deriveWorkflow(input({ quote: q("ACCEPTED") })).state).toBe("ACCEPTED");
    expect(deriveWorkflow(input({ stage: "WON", presales: req() })).state).toBe("ACCEPTED");
    expect(deriveWorkflow(input({ stage: "LOST", presales: req() })).state).toBe("CLOSED");
  });
});

describe("specChanged", () => {
  const a: LineSpec = { productId: "p1", partNumber: "SKU-1", description: "Switch", quantity: 10, billingFrequency: "ONE_TIME", termMonths: null, oemId: "o1", categoryId: "c1" };
  it("ignores whitespace and identical values", () => {
    expect(specChanged(a, { ...a, description: " Switch " })).toBe(false);
    expect(specChanged(a, { ...a, partNumber: "SKU-1" })).toBe(false);
  });
  it("flags product, quantity, term, billing, OEM and category changes", () => {
    expect(specChanged(a, { ...a, quantity: 12 })).toBe(true);
    expect(specChanged(a, { ...a, productId: "p2" })).toBe(true);
    expect(specChanged(a, { ...a, billingFrequency: "ANNUAL", termMonths: 36 })).toBe(true);
    expect(specChanged(a, { ...a, oemId: "o2" })).toBe(true);
    expect(specChanged(a, { ...a, categoryId: "c2" })).toBe(true);
  });
});

describe("resumeDueDate", () => {
  it("moves the due date out by the time presales waited", () => {
    expect(resumeDueDate(ahead(2), ago(3), now)).toEqual(ahead(5));
    expect(resumeDueDate(ahead(2), null, now)).toEqual(ahead(2));
  });
});

describe("specLock", () => {
  const base = { presalesOpen: null, pricingOpen: false, userId: "u1", isManager: false };
  it("is open when nothing is in flight", () => expect(specLock(base)).toBeNull());
  it("locks the spec while purchase is pricing, except for managers", () => {
    expect(specLock({ ...base, pricingOpen: true })).toMatch(/with purchase/);
    expect(specLock({ ...base, pricingOpen: true, isManager: true })).toBeNull();
  });
  it("only the presales assignee edits while presales is working", () => {
    expect(specLock({ ...base, presalesOpen: { assigneeId: "u2" } })).toMatch(/Presales is working/);
    expect(specLock({ ...base, presalesOpen: { assigneeId: "u1" } })).toBeNull();
  });
});

describe("requestNudge", () => {
  const r = (p: Record<string, unknown> = {}) => ({ status: "IN_PROGRESS", dueDate: ahead(0.5), remindedAt: null, escalatedAt: null, infoRequestedAt: null, ...p }) as Parameters<typeof requestNudge>[0];
  it("reminds the assignee once when due within a day", () => {
    expect(requestNudge(r(), now)).toBe("REMIND_DUE");
    expect(requestNudge(r({ remindedAt: ago(0.1) }), now)).toBeNull();
    expect(requestNudge(r({ dueDate: ahead(3) }), now)).toBeNull();
  });
  it("escalates once when overdue", () => {
    expect(requestNudge(r({ dueDate: ago(1) }), now)).toBe("ESCALATE");
    expect(requestNudge(r({ dueDate: ago(1), escalatedAt: ago(0.5) }), now)).toBeNull();
  });
  it("reminds sales of an unanswered question after two days, once per question", () => {
    expect(requestNudge(r({ status: "NEEDS_INFO", infoRequestedAt: ago(1) }), now)).toBeNull();
    expect(requestNudge(r({ status: "NEEDS_INFO", infoRequestedAt: ago(3) }), now)).toBe("REMIND_SALES");
    expect(requestNudge(r({ status: "NEEDS_INFO", infoRequestedAt: ago(3), remindedAt: ago(1) }), now)).toBeNull();
    expect(requestNudge(r({ status: "NEEDS_INFO", infoRequestedAt: ago(3), remindedAt: ago(5) }), now)).toBe("REMIND_SALES");
  });
  it("never nudges closed requests", () => expect(requestNudge(r({ status: "BOQ_SUBMITTED", dueDate: ago(5) }), now)).toBeNull());
});

describe("quoteExpiring", () => {
  it("reminds once within three days of expiry", () => {
    expect(quoteExpiring({ status: "SUBMITTED", validTill: ahead(2), remindedAt: null }, now)).toBe(true);
    expect(quoteExpiring({ status: "SUBMITTED", validTill: ahead(5), remindedAt: null }, now)).toBe(false);
    expect(quoteExpiring({ status: "SUBMITTED", validTill: ahead(2), remindedAt: ago(1) }, now)).toBe(false);
    expect(quoteExpiring({ status: "ACCEPTED", validTill: ahead(2), remindedAt: null }, now)).toBe(false);
  });
});
