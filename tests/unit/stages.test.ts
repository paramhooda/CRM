import { describe, expect, it } from "vitest";
import { allowedMoves, applyMove, findMove, pathFor, proposalBlockers, type DealFacts } from "@/domain/stages";

const facts = (p: Partial<DealFacts> = {}): DealFacts => ({
  stage: "QUALIFIED",
  heldFromStage: null,
  lastOpenStage: null,
  needsPresales: true,
  lineCount: 2,
  unpricedLines: 0,
  openPresalesRequest: false,
  openPricingRequest: false,
  approvalState: "NONE_NEEDED",
  hasPrimaryContact: true,
  closeDatePast: false,
  hasPoDocument: false,
  ...p,
});
const owner = { canEdit: true, isManager: false };
const manager = { canEdit: true, isManager: true };
const viewer = { canEdit: false, isManager: false };
const enabledActions = (f: DealFacts, a = owner) => allowedMoves(f, a).filter((m) => m.enabled).map((m) => m.action);

describe("stage path", () => {
  it("goes through BOQ only when presales is needed", () => {
    expect(pathFor(true)).toEqual(["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "CLOSED_WON"]);
    expect(pathFor(false)).toEqual(["QUALIFIED", "PROPOSAL_SUBMITTED", "NEGOTIATION", "CLOSED_WON"]);
  });

  it("advances one step at a time: Qualified → BOQ needs a contact and a future close date", () => {
    const m = findMove(facts(), owner, "ADVANCE")!;
    expect(m.toStage).toBe("BOQ");
    expect(m.enabled).toBe(true);
    expect(m.needsPresalesRequest).toBe(true);
    expect(findMove(facts({ hasPrimaryContact: false }), owner, "ADVANCE")!.enabled).toBe(false);
    expect(findMove(facts({ closeDatePast: true }), owner, "ADVANCE")!.reason).toMatch(/close date/);
  });

  it("a resale deal goes straight to Proposal Submitted, gated on prices and open requests", () => {
    const m = findMove(facts({ needsPresales: false }), owner, "ADVANCE")!;
    expect(m.toStage).toBe("PROPOSAL_SUBMITTED");
    expect(m.enabled).toBe(true);
    expect(findMove(facts({ needsPresales: false, unpricedLines: 1 }), owner, "ADVANCE")!.enabled).toBe(false);
    expect(findMove(facts({ needsPresales: false, openPricingRequest: true }), owner, "ADVANCE")!.reason).toMatch(/Purchase/);
  });

  it("BOQ → Proposal needs the BOQ submitted and an approval when a rule applies", () => {
    expect(findMove(facts({ stage: "BOQ", openPresalesRequest: true }), owner, "ADVANCE")!.enabled).toBe(false);
    expect(findMove(facts({ stage: "BOQ", approvalState: "NEEDED" }), owner, "ADVANCE")!.reason).toMatch(/approval/);
    expect(findMove(facts({ stage: "BOQ", approvalState: "PENDING" }), owner, "ADVANCE")!.enabled).toBe(false);
    expect(findMove(facts({ stage: "BOQ", approvalState: "APPROVED" }), owner, "ADVANCE")!.enabled).toBe(true);
    expect(proposalBlockers(facts({ lineCount: 0 }))[0]).toMatch(/at least one line/);
  });

  it("Skip BOQ is offered only inside BOQ", () => {
    expect(enabledActions(facts({ stage: "BOQ" }))).toContain("SKIP_BOQ");
    expect(enabledActions(facts({ stage: "QUALIFIED" }))).not.toContain("SKIP_BOQ");
    expect(applyMove(facts({ stage: "BOQ" }), findMove(facts({ stage: "BOQ" }), owner, "SKIP_BOQ")!).needsPresales).toBe(false);
  });

  it("Won only from Proposal or Negotiation, with the PO document", () => {
    expect(findMove(facts({ stage: "BOQ" }), owner, "WON")).toBeUndefined();
    expect(findMove(facts({ stage: "PROPOSAL_SUBMITTED" }), owner, "WON")!.enabled).toBe(false);
    const won = findMove(facts({ stage: "PROPOSAL_SUBMITTED", hasPoDocument: true }), owner, "WON")!;
    expect(won.enabled).toBe(true);
    expect(won.needsPo).toBe(true);
    const adv = findMove(facts({ stage: "NEGOTIATION", hasPoDocument: true }), owner, "ADVANCE")!;
    expect(adv.toStage).toBe("CLOSED_WON");
    expect(adv.label).toBe("Close as won");
  });

  it("Hold from any open stage and Resume returns to the stage it was held from", () => {
    expect(findMove(facts({ stage: "NEGOTIATION" }), owner, "HOLD")!.needsReason).toBe(true);
    const held = applyMove(facts({ stage: "NEGOTIATION" }), findMove(facts({ stage: "NEGOTIATION" }), owner, "HOLD")!);
    expect(held).toMatchObject({ toStage: "HOLD", heldFromStage: "NEGOTIATION" });
    const resume = findMove(facts({ stage: "HOLD", heldFromStage: "NEGOTIATION" }), owner, "RESUME")!;
    expect(resume.toStage).toBe("NEGOTIATION");
    expect(enabledActions(facts({ stage: "HOLD", heldFromStage: "BOQ" }))).toEqual(["RESUME", "LOST", "DROPPED"]);
  });

  it("Lost and Dropped need a reason and are available while the deal is live", () => {
    for (const stage of ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD"] as const) {
      expect(findMove(facts({ stage }), owner, "LOST")!.needsLossReason).toBe(true);
      expect(findMove(facts({ stage }), owner, "DROPPED")!.enabled).toBe(true);
    }
    expect(findMove(facts({ stage: "CLOSED_WON" }), owner, "LOST")).toBeUndefined();
    const lost = applyMove(facts({ stage: "HOLD", heldFromStage: "BOQ" }), findMove(facts({ stage: "HOLD", heldFromStage: "BOQ" }), owner, "LOST")!);
    expect(lost).toMatchObject({ toStage: "CLOSED_LOST", lastOpenStage: "BOQ", closes: true });
  });

  it("Back and Reopen are for managers only", () => {
    expect(findMove(facts({ stage: "BOQ" }), owner, "BACK")!.enabled).toBe(false);
    expect(findMove(facts({ stage: "BOQ" }), manager, "BACK")).toMatchObject({ enabled: true, toStage: "QUALIFIED", needsReason: true });
    expect(findMove(facts({ stage: "QUALIFIED" }), manager, "BACK")).toBeUndefined();
    expect(findMove(facts({ stage: "CLOSED_LOST", lastOpenStage: "NEGOTIATION" }), owner, "REOPEN")!.enabled).toBe(false);
    expect(findMove(facts({ stage: "CLOSED_LOST", lastOpenStage: "NEGOTIATION" }), manager, "REOPEN")!.toStage).toBe("NEGOTIATION");
  });

  it("someone who can't edit the deal gets no enabled moves", () => {
    expect(enabledActions(facts(), viewer)).toEqual([]);
    expect(findMove(facts(), viewer, "ADVANCE")!.reason).toMatch(/can't change/);
  });
});
