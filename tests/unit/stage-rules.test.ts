import { describe, it, expect } from "vitest";
import { checkMove, stageMoves, forecastError, dealFieldErrors, nextStage, pathFor, checkSkip, type StageFacts } from "@/lib/stage-rules";
import type { StageKey } from "@/lib/constants";

const facts = (p: Partial<StageFacts> = {}): StageFacts => ({
  stage: "QUALIFIED", heldFromStage: null, lastOpenStage: null, hasContact: true, closeDatePast: false, realLines: 2,
  openPresales: false, openPricing: false, quoteStatus: null, presalesRequired: true, ...p,
});
const owner = { canEdit: true, isManager: false };
const manager = { canEdit: true, isManager: true };
const allowed = (f: StageFacts, to: StageKey, a = owner) => checkMove(f, a, to).allowed;

describe("stage moves", () => {
  it("nobody without edit rights can move a deal", () => {
    expect(stageMoves(facts(), { canEdit: false, isManager: true }).every((m) => !m.allowed)).toBe(true);
  });

  it("deals move one stage at a time; no clicking straight to Won", () => {
    const f = facts({ stage: "IDENTIFIED" });
    expect(allowed(f, "QUALIFIED")).toBe(true);
    expect(allowed(f, "NEGOTIATION")).toBe(false);
    expect(checkMove(f, owner, "WON").reason).toMatch(/only after the quote is sent/);
    expect(allowed(f, "WON", manager)).toBe(false);
  });

  it("qualifying needs a customer contact and a close date that has not passed", () => {
    expect(checkMove(facts({ stage: "IDENTIFIED", hasContact: false }), owner, "QUALIFIED").reason).toMatch(/customer contact/);
    expect(checkMove(facts({ stage: "IDENTIFIED", closeDatePast: true }), owner, "QUALIFIED").reason).toMatch(/close date/);
  });

  it("BOQ, Pricing and Proposal Submitted are entered only by the workflow", () => {
    expect(checkMove(facts({ stage: "QUALIFIED" }), manager, "BOQ").reason).toMatch(/requests a BOQ/);
    expect(checkMove(facts({ stage: "BOQ" }), manager, "PRICING").reason).toMatch(/submits the BOQ/);
    expect(checkMove(facts({ stage: "PRICING" }), manager, "PROPOSAL").reason).toMatch(/quote is sent/);
  });

  it("negotiation and won need a quote with the customer and nothing open with presales or purchase", () => {
    expect(allowed(facts({ stage: "PROPOSAL", quoteStatus: "SUBMITTED" }), "NEGOTIATION")).toBe(true);
    expect(allowed(facts({ stage: "PROPOSAL", quoteStatus: "SUPERSEDED" }), "NEGOTIATION")).toBe(false);
    const won = checkMove(facts({ stage: "NEGOTIATION", quoteStatus: "ACCEPTED" }), owner, "WON");
    expect(won).toMatchObject({ allowed: true, needs: "po" });
    expect(checkMove(facts({ stage: "NEGOTIATION", quoteStatus: "SUBMITTED", openPresales: true }), owner, "WON").reason).toMatch(/still open/);
  });

  it("moving back is a manager's correction with a reason, never into a workflow stage", () => {
    const f = facts({ stage: "NEGOTIATION", quoteStatus: "SUBMITTED" });
    expect(checkMove(f, owner, "PROPOSAL").reason).toMatch(/Only a sales manager/);
    expect(checkMove(f, manager, "PROPOSAL")).toMatchObject({ allowed: true, needs: "reason", kind: "back" });
    expect(checkMove(f, manager, "QUALIFIED").reason).toMatch(/one stage at a time, to Proposal Submitted/);
    expect(allowed(facts({ stage: "PROPOSAL" }), "PRICING", manager)).toBe(false); // workflow stage
    expect(allowed(facts({ stage: "QUALIFIED", openPricing: true }), "IDENTIFIED", manager)).toBe(false);
  });

  it("hold needs a reason and resumes only to the stage it was held from", () => {
    expect(checkMove(facts({ stage: "PRICING" }), owner, "HOLD")).toMatchObject({ allowed: true, needs: "reason" });
    const held = facts({ stage: "HOLD", heldFromStage: "PRICING" });
    expect(checkMove(held, owner, "PRICING")).toMatchObject({ allowed: true, kind: "resume" });
    expect(allowed(held, "QUALIFIED")).toBe(false);
    expect(allowed(held, "WON")).toBe(false);
    expect(checkMove(held, owner, "LOST")).toMatchObject({ allowed: true, needs: "lossReason" });
  });

  it("closed deals reopen only by a manager, to the stage they were closed from", () => {
    const lost = facts({ stage: "LOST", lastOpenStage: "PROPOSAL" });
    expect(allowed(lost, "PROPOSAL")).toBe(false);
    expect(checkMove(lost, manager, "PROPOSAL")).toMatchObject({ allowed: true, kind: "reopen", needs: "reason" });
    expect(allowed(lost, "NEGOTIATION", manager)).toBe(false);
  });
});

describe("paths and skipping", () => {
  it("resale deals have no BOQ stage; solution deals do", () => {
    expect(pathFor(facts({ presalesRequired: false }))).not.toContain("BOQ");
    expect(nextStage(facts({ stage: "QUALIFIED", presalesRequired: false }))).toBe("PRICING");
    expect(nextStage(facts({ stage: "QUALIFIED", presalesRequired: true }))).toBe("BOQ");
    expect(nextStage(facts({ stage: "NEGOTIATION" }))).toBeNull();
    expect(checkMove(facts({ stage: "QUALIFIED", presalesRequired: false }), owner, "BOQ").allowed).toBe(false);
  });

  it("a stage is skipped only from inside it: BOQ can be skipped once the deal is in BOQ", () => {
    expect(checkSkip(facts({ stage: "QUALIFIED" }), owner).allowed).toBe(false);
    expect(checkSkip(facts({ stage: "BOQ" }), owner)).toMatchObject({ allowed: true, to: "PRICING" });
    expect(checkSkip(facts({ stage: "BOQ" }), { canEdit: false, isManager: false }).allowed).toBe(false);
    expect(checkSkip(facts({ stage: "PRICING" }), manager).allowed).toBe(false);
  });
});

describe("forecast and date rules", () => {
  it("commit needs a quote with the customer; closed and held deals are omitted", () => {
    expect(forecastError("QUALIFIED", "COMMIT")).toMatch(/Commit/);
    expect(forecastError("NEGOTIATION", "COMMIT")).toBeNull();
    expect(forecastError("HOLD", "PIPELINE")).toMatch(/omitted/);
    expect(forecastError("BOQ", "UPSIDE")).toBeNull();
  });

  it("only changed fields are checked, and changed dates cannot be in the past", () => {
    const now = new Date("2026-10-26T06:00:00Z");
    const past = new Date("2026-10-01T00:00:00Z");
    const later = new Date("2026-12-01T00:00:00Z");
    const before = { forecastCategory: "COMMIT", expectedCloseDate: past, nextStepDate: null };
    expect(dealFieldErrors("QUALIFIED", before, before, now)).toEqual({}); // old data never blocks an unrelated edit
    expect(dealFieldErrors("QUALIFIED", before, { ...before, expectedCloseDate: new Date("2026-10-10T00:00:00Z") }, now)).toHaveProperty("expectedCloseDate");
    expect(dealFieldErrors("QUALIFIED", { ...before, forecastCategory: "PIPELINE" }, { ...before, expectedCloseDate: later }, now)).toHaveProperty("forecastCategory");
    expect(dealFieldErrors("PROPOSAL", { ...before, forecastCategory: "PIPELINE" }, { ...before, expectedCloseDate: later }, now)).toEqual({});
  });
});
