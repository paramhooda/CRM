import { describe, it, expect } from "vitest";
import { quoteFingerprint, quoteMatchesLines, firstDifference, maxQuoteValidity, quotedLine, type QuotedLine } from "@/lib/quote";
import { checkMove, type StageFacts } from "@/lib/stage-rules";
import { deriveWorkflow, type WorkflowInput } from "@/lib/workflow";
import { endOfDayIST, startOfTodayIST } from "@/lib/format";
import { canSeeDocument } from "@/lib/documents";

const line = (p: Partial<QuotedLine> = {}): QuotedLine => ({
  lineNo: 1, partNumber: "LNV-NBK-01", description: "Lenovo ThinkPad", quantity: 40, unit: "Nos", billingFrequency: "ONE_TIME",
  termMonths: null, unitPrice: 59090.91, gstRatePct: 18, ...p,
});

describe("does the quote still describe the deal", () => {
  it("matches the same lines in any order, ignoring spacing and float noise", () => {
    const quoted = [line(), line({ lineNo: 2, description: "Dock" })];
    const now = [line({ lineNo: 2, description: "  Dock " }), line({ unitPrice: 59090.9100001 })];
    expect(quoteMatchesLines(quoted, now)).toBe(true);
    expect(quoteFingerprint(quoted)).toBe(quoteFingerprint(now));
  });
  it("any change the customer would see breaks the match, and says which line", () => {
    expect(quoteMatchesLines([line()], [line({ quantity: 45 })])).toBe(false);
    expect(quoteMatchesLines([line()], [line({ unitPrice: 60000 })])).toBe(false);
    expect(quoteMatchesLines([line()], [line({ gstRatePct: 28 })])).toBe(false);
    expect(firstDifference([line()], [line({ quantity: 45 })])).toBe("line 1 changed");
    expect(firstDifference([line()], [line(), line({ lineNo: 2 })])).toBe("line 2 was added");
    expect(firstDifference([line(), line({ lineNo: 2 })], [line()])).toBe("line 2 was removed");
  });
  it("a term on a one-time line doesn't matter; GST is ignored for quotes that never recorded it", () => {
    expect(quoteMatchesLines([line()], [line({ termMonths: 12 })])).toBe(true);
    const old = [{ ...line(), gstRatePct: undefined }];
    expect(quoteMatchesLines(old, [line({ gstRatePct: 28 })])).toBe(true);
  });
  it("a quote with no recorded lines can't be compared (null), so callers keep the older rule", () => {
    expect(quoteMatchesLines([], [line()])).toBeNull();
    expect(quoteMatchesLines(null, [line()])).toBeNull();
  });
  it("reads database rows, taking GST from the product when the line has none", () => {
    const row = { lineNo: 1, partNumber: "X", description: "Y", quantity: "2", unit: "Nos", billingFrequency: "ONE_TIME", termMonths: null, unitPrice: "100.50", gstRatePct: null, product: { gstRatePct: "18" } };
    expect(quotedLine(row)).toMatchObject({ quantity: 2, unitPrice: 100.5, gstRatePct: 18 });
  });
  it("a quote can't outlive the earliest supplier price", () => {
    const a = new Date("2026-12-01"), b = new Date("2026-11-20");
    expect(maxQuoteValidity([a, null, b])).toEqual(b);
    expect(maxQuoteValidity([null])).toBeNull();
  });
});

describe("closing as won", () => {
  const facts = (p: Partial<StageFacts> = {}): StageFacts => ({
    stage: "NEGOTIATION", heldFromStage: null, lastOpenStage: null, hasContact: true, closeDatePast: false, realLines: 2,
    openPresales: false, openPricing: false, quoteStatus: "SUBMITTED", quoteVersion: 2, presalesRequired: false,
    quoteCurrent: true, quoteExpired: false, billingIssues: [], ...p,
  });
  const owner = { canEdit: true, isManager: false };
  it("needs the PO when the quote with the customer still matches the deal", () => {
    expect(checkMove(facts(), owner, "WON")).toMatchObject({ allowed: true, needs: "po" });
    expect(checkMove(facts({ quoteStatus: "ACCEPTED" }), owner, "WON").allowed).toBe(true);
  });
  it("refuses a quote the customer asked to change, one the deal no longer matches, or one that expired", () => {
    expect(checkMove(facts({ quoteStatus: "CHANGES_REQUESTED" }), owner, "WON").reason).toMatch(/asked for changes to quote v2/);
    expect(checkMove(facts({ quoteCurrent: false }), owner, "WON").reason).toMatch(/lines changed after quote v2/);
    expect(checkMove(facts({ quoteExpired: true }), owner, "WON").reason).toMatch(/expired.*Extend its validity/);
  });
  it("refuses lines that can't be billed", () => {
    expect(checkMove(facts({ billingIssues: ["Add HSN/SAC on line 3"] }), owner, "WON").reason).toBe("Add HSN/SAC on line 3");
  });
  it("older callers that don't load the quote checks keep working", () => {
    const legacy: StageFacts = facts();
    delete legacy.quoteCurrent; delete legacy.quoteExpired; delete legacy.billingIssues;
    expect(checkMove(legacy, owner, "WON").allowed).toBe(true);
  });
});

describe("workflow state against the latest quote", () => {
  const now = new Date("2026-11-13T06:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const ahead = (d: number) => new Date(now.getTime() + d * 86_400_000);
  const base = (p: Partial<WorkflowInput> = {}): WorkflowInput => ({
    stage: "PROPOSAL", now, presales: null, pricing: null,
    lines: [{ lineNo: 1, pricingStatus: "QUOTED", unitCost: 50, unitPrice: 60, isEstimate: false, costSource: "PURCHASE", costValidTill: ahead(20) }],
    quote: { status: "SUBMITTED", version: 1, validTill: ahead(10), createdAt: ago(3), matchesLines: true },
    ...p,
  });
  it("a quote that still matches is with the customer", () => {
    expect(deriveWorkflow(base()).state).toBe("QUOTE_SENT");
  });
  it("a quote the deal no longer matches stops counting, and says to send a revised one", () => {
    const w = deriveWorkflow(base({ quote: { status: "SUBMITTED", version: 1, validTill: ahead(10), createdAt: ago(3), matchesLines: false } }));
    expect(w.state).toBe("READY_TO_QUOTE");
    expect(w.blockers.join(" ")).toMatch(/lines changed after quote v1/);
  });
  it("a cancelled revision no longer revives an old quote when lines changed", () => {
    const w = deriveWorkflow(base({
      presales: { status: "CANCELLED", dueDate: ahead(2), createdAt: ago(1), assignee: "P", submittedAt: null },
      quote: { status: "SUBMITTED", version: 1, validTill: ahead(10), createdAt: ago(5), matchesLines: false },
    }));
    expect(w.state).not.toBe("QUOTE_SENT");
  });
  it("an accepted quote that expired says to extend it before closing", () => {
    const w = deriveWorkflow(base({ quote: { status: "ACCEPTED", version: 1, validTill: ago(1), createdAt: ago(20), matchesLines: true } }));
    expect(w.state).toBe("ACCEPTED");
    expect(w.blockers.join(" ")).toMatch(/Extend its validity/);
  });
  it("a held deal says so", () => {
    expect(deriveWorkflow(base({ stage: "HOLD" })).blockers.join(" ")).toMatch(/on hold/);
  });
});

describe("dates picked in forms", () => {
  it("mean the end of that day in India", () => {
    const d = endOfDayIST("2026-11-15");
    expect(d.toISOString()).toBe("2026-11-15T18:29:59.999Z");
    expect(endOfDayIST(new Date("2026-11-15T00:00:00Z")).toISOString()).toBe("2026-11-15T18:29:59.999Z");
  });
  it("today starts at midnight in India", () => {
    expect(startOfTodayIST(new Date("2026-11-15T20:00:00Z")).toISOString()).toBe("2026-11-15T18:30:00.000Z");
  });
});

describe("documents at hand-overs", () => {
  it("purchase sees the customer's RFP (specs) but never the PO", () => {
    const buyer = { id: "u1", role: "PURCHASE" };
    expect(canSeeDocument(buyer, { kind: "CUSTOMER_RFP", uploadedById: "x" })).toBe(true);
    expect(canSeeDocument(buyer, { kind: "CUSTOMER_PO", uploadedById: "x" })).toBe(false);
  });
});
