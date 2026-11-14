import { describe, expect, it } from "vitest";
import type { DealFacts } from "@/domain/stages";
import { canUploadDocument, nextActions, requestBlockers, type People, type Viewer } from "@/domain/workflow";

const facts = (p: Partial<DealFacts> = {}): DealFacts => ({
  stage: "QUALIFIED", heldFromStage: null, lastOpenStage: null, needsPresales: true, deleted: false,
  lineCount: 0, unpricedLines: 0, uncostedLines: 0, thirdPartyLines: 0, uncostedThirdPartyLines: 0, presalesDocuments: 0,
  presalesRequest: null, pricingRequest: null, openPresalesRequest: false, openPricingRequest: false,
  approvalState: "NONE_NEEDED", approvalRules: [], hasPrimaryContact: true, closeDatePast: false, hasPoDocument: false, ...p,
});
const viewer = (p: Partial<Viewer> = {}): Viewer => ({ role: "SALES", canEdit: true, isManager: false, isAssignedPresales: false, isAssignedPurchase: false, isApprover: false, ...p });
const rep = viewer();
const head = viewer({ role: "SALES_HEAD", isManager: true });
const presales = viewer({ role: "PRESALES", canEdit: false, isAssignedPresales: true });
const presalesDone = viewer({ role: "PRESALES", canEdit: false });
const purchase = viewer({ role: "PURCHASE", canEdit: false, isAssignedPurchase: true });
const people: People = { owner: "Rakesh Pawar", presales: "Rakesh Yadav", purchase: "Meera Iyer", presalesDue: "2026-11-21", pricingDue: "2026-11-25" };
const current = (f: DealFacts, v: Viewer) => nextActions(f, v, people).steps.find((s) => s.current);

describe("request rules", () => {
  it("presales is asked through Advance to BOQ in Qualified, and by hand only in BOQ with a document and no open request", () => {
    expect(requestBlockers("presales", facts(), rep)[0]).toMatch(/Advance to BOQ/);
    expect(requestBlockers("presales", facts({ stage: "BOQ", presalesDocuments: 1 }), rep)).toEqual([]);
    expect(requestBlockers("presales", facts({ stage: "BOQ" }), rep)[0]).toMatch(/requirement/);
    expect(requestBlockers("presales", facts({ stage: "BOQ", presalesDocuments: 1, openPresalesRequest: true }), rep)[0]).toMatch(/already an open/);
    expect(requestBlockers("presales", facts({ stage: "BOQ", presalesDocuments: 1 }), presales)[0]).toMatch(/owner or a manager/);
    expect(requestBlockers("presales", facts({ stage: "PROPOSAL_SUBMITTED", presalesDocuments: 1 }), rep)[0]).toMatch(/BOQ stage only/);
    expect(requestBlockers("presales", facts({ stage: "HOLD" }), rep)[0]).toMatch(/on hold/);
  });

  it("pricing needs lines with a third-party OEM, no open pricing request, and waits for presales while the BOQ is being built", () => {
    expect(requestBlockers("pricing", facts(), rep)[0]).toMatch(/Add the lines/);
    expect(requestBlockers("pricing", facts({ lineCount: 2 }), rep)[0]).toMatch(/own IP/);
    expect(requestBlockers("pricing", facts({ lineCount: 2, thirdPartyLines: 1 }), rep)).toEqual([]);
    expect(requestBlockers("pricing", facts({ stage: "NEGOTIATION", lineCount: 2, thirdPartyLines: 1 }), rep)).toEqual([]);
    expect(requestBlockers("pricing", facts({ lineCount: 2, thirdPartyLines: 1, openPricingRequest: true }), rep)[0]).toMatch(/already an open/);
    const boq = facts({ stage: "BOQ", lineCount: 2, thirdPartyLines: 1, openPresalesRequest: true, presalesRequest: "IN_PROGRESS" });
    expect(requestBlockers("pricing", boq, rep)[0]).toMatch(/still working on the BOQ/);
    expect(requestBlockers("pricing", boq, presales)).toEqual([]);
    expect(requestBlockers("pricing", boq, viewer({ role: "ADMIN" }))).toEqual([]);
    expect(requestBlockers("pricing", facts({ stage: "BOQ", lineCount: 2, thirdPartyLines: 1 }), presalesDone)[0]).toMatch(/assigned presales/);
    expect(requestBlockers("pricing", facts({ stage: "CLOSED_WON", lineCount: 2, thirdPartyLines: 1 }), rep)[0]).toMatch(/closed/);
  });

  it("uploads: anyone working a live deal, admins always, nobody on a closed or deleted deal", () => {
    expect(canUploadDocument(rep, "NEGOTIATION", false)).toBe(true);
    expect(canUploadDocument(rep, "HOLD", false)).toBe(true);
    expect(canUploadDocument(presales, "BOQ", false)).toBe(true);
    expect(canUploadDocument(presalesDone, "BOQ", false)).toBe(false);
    expect(canUploadDocument(purchase, "PROPOSAL_SUBMITTED", false)).toBe(true);
    expect(canUploadDocument(rep, "CLOSED_WON", false)).toBe(false);
    expect(canUploadDocument(viewer({ role: "ADMIN" }), "CLOSED_WON", false)).toBe(true);
    expect(canUploadDocument(viewer({ role: "ADMIN" }), "BOQ", true)).toBe(false);
  });
});

describe("what's next", () => {
  it("Qualified, presales deal: contact, requirement document, then hand over", () => {
    expect(current(facts({ hasPrimaryContact: false }), rep)).toMatchObject({ action: "SET_CONTACT", mine: true });
    expect(nextActions(facts({ hasPrimaryContact: false }), rep, people).headline).toBe("Your next step: set the customer contact");
    expect(current(facts(), rep)).toMatchObject({ action: "ATTACH_DOCUMENT" });
    expect(current(facts({ presalesDocuments: 1 }), rep)).toMatchObject({ action: "ADVANCE", label: expect.stringMatching(/Advance to BOQ/) });
    expect(current(facts({ closeDatePast: true, presalesDocuments: 1 }), rep)).toMatchObject({ action: "FIX_CLOSE_DATE" });
    // the manager sees the same step as the rep's, by name
    const n = nextActions(facts(), head, people);
    expect(n.steps.find((s) => s.current)!.mine).toBe(true);
  });

  it("Qualified, resale deal: lines, costs from purchase, prices, approval, proposal", () => {
    const f = facts({ needsPresales: false });
    expect(current(f, rep)).toMatchObject({ action: "ADD_LINES" });
    expect(current({ ...f, lineCount: 2, thirdPartyLines: 2, uncostedLines: 2, uncostedThirdPartyLines: 2, unpricedLines: 2 }, rep)).toMatchObject({ action: "ASK_PRICING" });
    const asked = { ...f, lineCount: 2, thirdPartyLines: 2, uncostedLines: 2, uncostedThirdPartyLines: 2, unpricedLines: 2, openPricingRequest: true, pricingRequest: "REQUESTED" as const };
    expect(nextActions(asked, rep, people)).toMatchObject({ headline: "Waiting on purchase (Meera Iyer): start pricing", waitingOn: { party: "PURCHASE", due: "2026-11-25" } });
    expect(nextActions(asked, purchase, people).headline).toBe("Your next step: start pricing");
    expect(current({ ...asked, pricingRequest: "IN_PROGRESS" }, purchase)).toMatchObject({ action: "ENTER_COSTS", label: "Enter the purchase cost on 2 lines and complete pricing" });
    expect(current({ ...asked, pricingRequest: "IN_PROGRESS", uncostedLines: 0, uncostedThirdPartyLines: 0 }, purchase)).toMatchObject({ action: "COMPLETE_PRICING" });
    const costed = { ...f, lineCount: 2, thirdPartyLines: 2, unpricedLines: 2, pricingRequest: "COMPLETED" as const };
    expect(current(costed, rep)).toMatchObject({ action: "SET_PRICES", label: "Set a sales price on 2 lines" });
    expect(current({ ...costed, unpricedLines: 0, approvalState: "NEEDED" }, rep)).toMatchObject({ action: "ASK_APPROVAL" });
    expect(nextActions({ ...costed, unpricedLines: 0, approvalState: "PENDING" }, rep, people).headline).toMatch(/Waiting on the approvers/);
    expect(current({ ...costed, unpricedLines: 0, approvalState: "PENDING" }, viewer({ role: "SALES_HEAD", isApprover: true }))).toMatchObject({ action: "DECIDE_APPROVAL", mine: true });
    expect(current({ ...costed, unpricedLines: 0, approvalState: "APPROVED" }, rep)).toMatchObject({ action: "ADVANCE" });
    expect(current({ ...costed, unpricedLines: 0 }, rep)).toMatchObject({ action: "ADVANCE", label: "Advance to Proposal Submitted" });
  });

  it("BOQ: presales starts, builds and submits; sales waits, then prices and advances", () => {
    const open = facts({ stage: "BOQ", presalesDocuments: 1, openPresalesRequest: true, presalesRequest: "REQUESTED" });
    expect(nextActions(open, rep, people)).toMatchObject({ headline: "Waiting on presales (Rakesh Yadav): start the BOQ", waitingOn: { due: "2026-11-21" } });
    expect(nextActions(open, presales, people).headline).toBe("Your next step: start the BOQ");
    expect(current({ ...open, presalesRequest: "IN_PROGRESS" }, presales)).toMatchObject({ action: "ADD_LINES", label: "Build the BOQ: add the lines" });
    expect(current({ ...open, presalesRequest: "IN_PROGRESS", lineCount: 3, thirdPartyLines: 2, uncostedLines: 2, uncostedThirdPartyLines: 2, unpricedLines: 3 }, presales)).toMatchObject({ action: "SUBMIT_BOQ" });
    const submitted = facts({ stage: "BOQ", presalesDocuments: 1, presalesRequest: "SUBMITTED", lineCount: 3, thirdPartyLines: 2, uncostedLines: 2, uncostedThirdPartyLines: 2, unpricedLines: 3 });
    expect(nextActions(submitted, rep, people).headline).toBe("Your next step: ask purchase for prices");
    expect(nextActions(submitted, presalesDone, people).headline).toMatch(/Waiting on sales \(Rakesh Pawar\)/);
    expect(current(facts({ stage: "BOQ", presalesDocuments: 1, presalesRequest: "CANCELLED" }), rep)).toMatchObject({ action: "ASK_PRESALES" });
  });

  it("presales and purchase see their own steps and one line for everything sales does, never prices", () => {
    const boq = facts({ stage: "BOQ", presalesDocuments: 1, openPresalesRequest: true, presalesRequest: "IN_PROGRESS", lineCount: 2, thirdPartyLines: 2, uncostedLines: 2, uncostedThirdPartyLines: 2, unpricedLines: 2 });
    const n = nextActions(boq, presales, people);
    expect(n.steps.map((s) => [s.key, s.owner])).toEqual([["lines", "PRESALES"], ["submit-boq", "PRESALES"], ["sales", "SALES"]]);
    expect(JSON.stringify(n)).not.toMatch(/sales price|margin|\bGM\b|approv/i);
    const pricing = { ...facts({ stage: "BOQ", presalesDocuments: 1, presalesRequest: "SUBMITTED", lineCount: 2, thirdPartyLines: 2, uncostedLines: 1, uncostedThirdPartyLines: 1, unpricedLines: 2, approvalState: "NEEDED" }), openPricingRequest: true, pricingRequest: "IN_PROGRESS" as const };
    const p = nextActions(pricing, purchase, people);
    expect(p.headline).toBe("Your next step: enter the purchase cost on the remaining line and complete pricing");
    expect(p.steps.map((s) => s.key)).toEqual(["boq", "costs", "sales"]); // the submitted BOQ shows as done
    expect(JSON.stringify(p)).not.toMatch(/sales price|margin|GM|approv/i);
    expect(nextActions(facts({ stage: "QUALIFIED" }), presalesDone, people)).toMatchObject({ headline: "Waiting on sales (Rakesh Pawar): sales to prepare the hand-over", detail: undefined });
  });

  it("Proposal and Negotiation: PO then won, with the price block only when something lapsed", () => {
    const f = facts({ stage: "NEGOTIATION", lineCount: 2, thirdPartyLines: 2 });
    expect(current(f, rep)).toMatchObject({ action: "ATTACH_PO" });
    expect(current({ ...f, hasPoDocument: true }, rep)).toMatchObject({ action: "CLOSE_WON" });
    expect(current({ ...f, approvalState: "STALE" }, rep)).toMatchObject({ action: "ASK_APPROVAL" });
    expect(current({ ...f, unpricedLines: 1 }, rep)).toMatchObject({ action: "SET_PRICES" });
    expect(nextActions({ ...f, stage: "PROPOSAL_SUBMITTED" }, rep, people).detail).toMatch(/Negotiation/);
  });

  it("Hold, closed and deleted deals", () => {
    expect(nextActions(facts({ stage: "HOLD" }), rep, people).headline).toBe("Your next step: resume the deal");
    expect(nextActions(facts({ stage: "HOLD" }), presales, people).headline).toMatch(/Waiting on sales/);
    expect(nextActions(facts({ stage: "CLOSED_WON" }), rep, people)).toMatchObject({ headline: expect.stringMatching(/^Won/), steps: [] });
    expect(nextActions(facts({ stage: "CLOSED_LOST" }), rep, people).headline).toMatch(/Waiting on a manager: reopen/);
    expect(nextActions(facts({ stage: "CLOSED_LOST" }), head, people).headline).toBe("Your next step: reopen the deal");
    expect(nextActions(facts({ deleted: true }), head, people).steps).toEqual([]);
  });
});
