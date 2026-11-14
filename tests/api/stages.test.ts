import { beforeAll, describe, expect, it } from "vitest";
import { Client, as, expectError, expectOk, isoDate, uniq, uploadDoc } from "./helpers";

type Move = { action: string; enabled: boolean; reason?: string; toStage: string; needsPresalesRequest?: boolean; needsPo?: boolean; needsDocument?: boolean };
type Line = { id: string; lineNo: number; unitSalesPrice: string | null; unitPurchaseCost: string | null; editable: string[]; oem: { isOwnIp: boolean } };
type Next = { headline: string; waitingOn?: { party: string; name: string | null; due: string | null }; steps: { key: string; action?: string; done: boolean; current: boolean; mine: boolean }[] };
type Ability = { enabled: boolean; reason: string | null };
type Deal = { id: string; version: number; stage: string; needsPresales: boolean; moves: Move[]; lines: Line[]; presalesOwnerId: string | null; presalesRequests: Req[]; pricingRequests: Req[]; heldFromStage: string | null; holdReason: string | null; lossReason: { name: string } | null; expectedGmPct: string | null; approvalState: string; next: Next; requestAbility: { presales: Ability; pricing: Ability }; canUpload: boolean };
type Req = { id: string; status: string; assignedToId: string; dueDate: string; overdue?: boolean; deal?: { code: string } };
type Product = { id: string; name: string; oem: { isOwnIp: boolean } };
type Users = { rows: { id: string; email: string }[] };

let rep: Client, head: Client, presales: Client, purchase: Client, admin: Client;
let accountId: string, contactId: string;
let laptop: Product, server: Product, noc: Product;
let presalesId: string, purchaseId: string;
let lossReasons: { id: string; name: string; appliesTo: string }[];

const move = (d: Deal, action: string) => d.moves.find((m) => m.action === action);
const stage = (c: Client, d: Deal, body: Record<string, unknown>) => c.post<Deal>(`/deals/${d.id}/stage`, { version: d.version, ...body });

beforeAll(async () => {
  [rep, head, presales, purchase, admin] = await Promise.all([as("rep"), as("salesHead"), as("presales"), as("purchase"), as("admin")]);
  const users = expectOk(await rep.get<Users>("/users")).rows;
  presalesId = users.find((u) => u.email === "rakesh.yadav@progression.com")!.id;
  purchaseId = users.find((u) => u.email === "meera.iyer@progression.com")!.id;
  const products = expectOk(await rep.get<{ rows: Product[] }>("/products")).rows;
  laptop = products.find((p) => p.name.startsWith("Lenovo Business laptop, Core i5"))!;
  server = products.find((p) => p.name.startsWith("HPE 2U Rack"))!;
  noc = products.find((p) => p.name.includes("NOC monitoring"))!;
  accountId = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Stages Co") })).id;
  contactId = expectOk(await rep.post<{ id: string }>("/contacts", { accountId, firstName: "Kavita", lastName: "Rao" })).id;
  lossReasons = expectOk(await rep.get<{ lossReasons: typeof lossReasons }>("/lookups")).lossReasons;
});

describe("stage moves", () => {
  it("Qualified → BOQ raises the presales request; presales refines lines and submits; purchase prices; sales prices and advances", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Solution deal"), accountId, expectedCloseDate: isoDate(60), lines: [{ productId: server.id, quantity: 2 }, { productId: noc.id, quantity: 10, revenueModel: "ARR", termMonths: 12 }] }));
    expect(d.needsPresales).toBe(true);
    // no contact yet: Advance is offered but disabled, with the reason
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: false, reason: expect.stringMatching(/contact/) });
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(7) }), 409, "NOT_ALLOWED");
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}`, { version: d.version, primaryContactId: contactId }));
    // the customer's requirement travels with the hand-over; presales is asked through Advance, never by hand in Qualified
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: true, needsDocument: true });
    expect(d.next).toMatchObject({ headline: expect.stringMatching(/^Your next step: attach the customer's requirement/) });
    expect(d.requestAbility.presales).toMatchObject({ enabled: false, reason: expect.stringMatching(/Advance to BOQ/) });
    expectError(await rep.post(`/deals/${d.id}/presales-requests`, { assignedToId: presalesId, dueDate: isoDate(5), scope: "Size it" }), 409, "WRONG_STAGE");
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(7), presalesScope: "Two hosts" }), 409, "NO_DOCUMENT");
    expectOk(await uploadDoc(rep, d.id, "Customer RFP", "RFP.pdf"));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: true, toStage: "BOQ", needsPresalesRequest: true, needsDocument: false });
    expect(d.next.steps.find((s) => s.current)).toMatchObject({ action: "ADVANCE", mine: true });
    expectError(await stage(rep, d, { action: "ADVANCE" }), 400); // who and when
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: purchaseId, presalesDueDate: isoDate(7) }), 400);
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(-1) }), 400);
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(7) }), 400); // scope is required
    d = expectOk(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(7), presalesScope: "Two hosts and NOC for 10 devices" }));
    expect(d.stage).toBe("BOQ");
    expect(d.presalesOwnerId).toBe(presalesId);
    expect(d.presalesRequests[0]).toMatchObject({ status: "REQUESTED", assignedToId: presalesId });
    expect(d.next).toMatchObject({ headline: "Waiting on presales (Rakesh Yadav): submit the BOQ", waitingOn: { party: "PRESALES", due: isoDate(7) } });
    expectError(await stage(rep, d, { action: "ADVANCE" }), 409); // BOQ not submitted
    expectError(await rep.post(`/deals/${d.id}/presales-requests`, { assignedToId: presalesId, dueDate: isoDate(5), scope: "again" }), 409, "ALREADY_OPEN");
    // while presales builds the BOQ the lines are theirs: sales can't change them or ask purchase
    expect(d.lines[0]!.editable).toEqual([]);
    expectError(await rep.patch(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ id: d.lines[0]!.id, quantity: 9 }] }), 403);
    expect(d.requestAbility.pricing).toMatchObject({ enabled: false, reason: expect.stringMatching(/still working on the BOQ/) });
    expectError(await rep.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(5) }), 409, "BOQ_IN_PROGRESS");

    // presales sees the deal (technical side), works the request, edits lines, can't price them
    const mine = expectOk(await presales.get<{ rows: Req[] }>("/presales-requests?mine=true"));
    const req = mine.rows.find((r) => r.id === d.presalesRequests[0]!.id)!;
    expect(req.deal?.code).toBeDefined();
    const pv = expectOk(await presales.get<Deal>(`/deals/${d.id}`));
    expect(pv).not.toHaveProperty("expectedGmPct");
    expect(pv.next.headline).toBe("Your next step: submit the BOQ");
    expect(JSON.stringify(pv.next)).not.toMatch(/sales price|margin|\bGM\b|approv/i);
    expect(pv.requestAbility.pricing.enabled).toBe(true);
    expect(pv.canUpload).toBe(true);
    expect(pv.lines[0]!.editable).toEqual(["spec", "delete"]);
    expect(pv.lines[1]!.editable).toEqual(["spec", "delete", "cost"]); // own IP: presales may cost it
    expectError(await presales.patch(`/deals/${d.id}/lines`, { version: pv.version, upserts: [{ id: pv.lines[0]!.id, unitSalesPrice: "1" }] }), 403);
    expectError(await purchase.get(`/deals/${d.id}`), 404); // no pricing request yet
    expectError(await rep.patch(`/presales-requests/${req.id}`, { action: "START" }), 403);
    expectError(await presales.patch(`/presales-requests/${req.id}`, { action: "SUBMIT" }), 400); // summary
    expectOk(await presales.patch(`/presales-requests/${req.id}`, { action: "START" }));
    const pv2 = expectOk(await presales.patch<Deal>(`/deals/${d.id}/lines`, { version: pv.version, upserts: [{ id: pv.lines[0]!.id, quantity: 3 }, { productId: laptop.id, quantity: 4 }] }));
    expect(pv2.lines.length).toBe(3);
    // presales asks purchase for pricing
    expectError(await presales.post(`/deals/${d.id}/pricing-requests`, { assignedToId: presalesId, dueDate: isoDate(5) }), 400);
    const pr = expectOk(await presales.post<Req>(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(5), notes: "Best price for HPE" }));
    // while purchase prices the lines, what is sold is frozen (own-IP costs and sales prices still move)
    const pv3 = expectOk(await presales.get<Deal>(`/deals/${d.id}`));
    expect(pv3.lines[0]!.editable).toEqual([]);
    expectError(await presales.patch(`/deals/${d.id}/lines`, { version: pv3.version, upserts: [{ id: pv3.lines[0]!.id, quantity: 7 }] }), 403);
    expectOk(await presales.patch(`/presales-requests/${req.id}`, { action: "SUBMIT", summary: "Three hosts, four laptops, NOC on 10 devices" }));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(d.presalesRequests[0]!.status).toBe("SUBMITTED");
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: false, reason: expect.stringMatching(/Purchase/) });
    expect(d.next.headline).toMatch(/^Waiting on purchase \(Meera Iyer\): enter the purchase cost/);
    expect(d.lines[0]!.editable).toEqual(["price"]);
    // presales handed over: they still see the deal but no longer change it or ask purchase
    const after = expectOk(await presales.get<Deal>(`/deals/${d.id}`));
    expect(after.lines[0]!.editable).toEqual([]);
    expect(after.requestAbility.pricing.enabled).toBe(false);
    expect(after.canUpload).toBe(false);

    // purchase: sees the deal, costs every third-party line, can't see or set prices
    const bv = expectOk(await purchase.get<Deal>(`/deals/${d.id}`));
    expect(bv).not.toHaveProperty("dealValue");
    expect(bv.lines.every((l) => l.editable.join() === "cost")).toBe(true);
    expectError(await purchase.patch(`/deals/${d.id}/lines`, { version: bv.version, upserts: [{ id: bv.lines[0]!.id, quantity: 5 }] }), 403);
    expectError(await purchase.patch(`/pricing-requests/${pr.id}`, { action: "COMPLETE" }), 409, "LINES_UNCOSTED");
    const costed = expectOk(await purchase.patch<Deal>(`/deals/${d.id}/lines`, { version: bv.version, upserts: bv.lines.filter((l) => !l.oem.isOwnIp).map((l) => ({ id: l.id, unitPurchaseCost: l.id === bv.lines[0]!.id ? "900000" : "60000" })) }));
    expect(costed.lines.filter((l) => !l.oem.isOwnIp).every((l) => l.unitPurchaseCost !== null)).toBe(true);
    expectOk(await purchase.patch(`/pricing-requests/${pr.id}`, { action: "START" }));
    expectOk(await purchase.patch(`/pricing-requests/${pr.id}`, { action: "COMPLETE", completionNotes: "Ingram, valid 30 days" }));

    // sales prices every line (no rule matches: GM 20%, value under 1 Cr) and advances
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: false, reason: expect.stringMatching(/sales price/) });
    expect(d.next.headline).toBe("Your next step: set a sales price on 3 lines");
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: d.lines.map((l) => ({ id: l.id, unitSalesPrice: l.unitPurchaseCost ? String(Math.round(Number(l.unitPurchaseCost) / 0.8)) : "20000" })) }));
    expect(d.approvalState).toBe("NONE_NEEDED");
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: true, toStage: "PROPOSAL_SUBMITTED" });
    expect(d.next.headline).toBe("Your next step: advance to Proposal Submitted");
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expect(d.stage).toBe("PROPOSAL_SUBMITTED");
    expect(move(d, "WON")).toMatchObject({ enabled: false, reason: expect.stringMatching(/PO document/) });
    expect(d.requestAbility.presales).toMatchObject({ enabled: false, reason: expect.stringMatching(/BOQ stage only/) });
    expect(d.requestAbility.pricing.enabled).toBe(true); // a re-quote is allowed in any open stage
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expect(d.stage).toBe("NEGOTIATION");
    expect(move(d, "ADVANCE")).toMatchObject({ toStage: "CLOSED_WON", needsPo: true, enabled: false });
    expectError(await stage(rep, d, { action: "ADVANCE", poNumber: "PO-1" }), 409);
    // a line that loses its price in Negotiation blocks Won until it is priced again
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ id: d.lines[0]!.id, unitSalesPrice: null }] }));
    expect(move(d, "ADVANCE")!.reason).toMatch(/sales price/);
    expect(d.next.steps.find((s) => s.current)).toMatchObject({ action: "SET_PRICES" });
    const h = expectOk(await rep.get<{ stages: { fromStage: string | null; toStage: string; daysInPreviousStage: string | null }[] }>(`/deals/${d.id}/history`));
    expect(h.stages.map((s) => s.toStage)).toEqual(["NEGOTIATION", "PROPOSAL_SUBMITTED", "BOQ", "QUALIFIED"]);
    expect(h.stages[0]!.daysInPreviousStage).not.toBeNull();
    // a stale version is refused
    expectError(await rep.post(`/deals/${d.id}/stage`, { version: 1, action: "HOLD", reason: "x" }), 409, "STALE");
  });

  it("a resale deal skips BOQ; Skip BOQ from inside BOQ turns a deal into a resale deal", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Laptops"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptop.id, quantity: 20, unitSalesPrice: "70000", unitPurchaseCost: "60000" }] }));
    expect(d.needsPresales).toBe(false);
    expect(move(d, "ADVANCE")).toMatchObject({ toStage: "PROPOSAL_SUBMITTED", enabled: true });
    expect(move(d, "SKIP_BOQ")).toBeUndefined();
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}`, { version: d.version, needsPresales: true }));
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(3), presalesScope: "Check the spec" }), 409, "NO_DOCUMENT"); // no requirement attached
    expectOk(await uploadDoc(rep, d.id, "Customer RFP"));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    d = expectOk(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(3), presalesScope: "Check the spec" }));
    expect(d.stage).toBe("BOQ");
    d = expectOk(await stage(rep, d, { action: "SKIP_BOQ" }));
    expect(d).toMatchObject({ stage: "PROPOSAL_SUBMITTED", needsPresales: false });
    expect(d.presalesRequests[0]!.status).toBe("CANCELLED");
  });

  it("Hold needs a reason and resumes where it was; Lost needs a matching reason; a manager reopens", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Hold deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptop.id, quantity: 1, unitSalesPrice: "70000", unitPurchaseCost: "60000" }] }));
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expectError(await stage(rep, d, { action: "HOLD" }), 400);
    d = expectOk(await stage(rep, d, { action: "HOLD", reason: "Budget review in Q4" }));
    expect(d).toMatchObject({ stage: "HOLD", heldFromStage: "PROPOSAL_SUBMITTED", holdReason: "Budget review in Q4" });
    expect(d.moves.filter((m) => m.enabled).map((m) => m.action)).toEqual(["RESUME", "LOST", "DROPPED"]);
    expect(d.next.headline).toBe("Your next step: resume the deal");
    expect(d.requestAbility.pricing).toMatchObject({ enabled: false, reason: expect.stringMatching(/on hold/) });
    d = expectOk(await stage(rep, d, { action: "RESUME" }));
    expect(d).toMatchObject({ stage: "PROPOSAL_SUBMITTED", heldFromStage: null, holdReason: null });
    const dropOnly = lossReasons.find((r) => r.appliesTo === "DROPPED")!;
    const lostOk = lossReasons.find((r) => r.appliesTo === "LOST")!;
    expectError(await stage(rep, d, { action: "LOST" }), 400);
    expectError(await stage(rep, d, { action: "LOST", lossReasonId: dropOnly.id }), 400);
    d = expectOk(await stage(rep, d, { action: "LOST", lossReasonId: lostOk.id, lossNotes: "Went with the incumbent" }));
    expect(d).toMatchObject({ stage: "CLOSED_LOST", lossReason: { name: lostOk.name } });
    expect(d.moves.map((m) => [m.action, m.enabled])).toEqual([["REOPEN", true]]); // the owner may reopen their own deal
    expectError(await stage(rep, d, { action: "REOPEN" }), 400); // with a reason
    expectError(await rep.patch(`/deals/${d.id}`, { version: d.version, name: "Closed edit" }), 409, "CLOSED");
    expectError(await (await as("rep2")).post(`/deals/${d.id}/stage`, { version: d.version, action: "REOPEN", reason: "x" }), 404);
    d = expectOk(await stage(rep, d, { action: "REOPEN", reason: "Customer came back" }));
    expect(d).toMatchObject({ stage: "PROPOSAL_SUBMITTED", lossReason: null });
    // Dropped with a reason that applies to both
    const both = lossReasons.find((r) => r.appliesTo === "BOTH")!;
    d = expectOk(await stage(rep, d, { action: "DROPPED", lossReasonId: both.id }));
    expect(d.stage).toBe("DROPPED");
  });

  it("Back is for the owner and their managers, one step at a time, with a reason", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Back deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptop.id, quantity: 1, unitSalesPrice: "70000", unitPurchaseCost: "60000" }] }));
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expect(d.stage).toBe("NEGOTIATION");
    expect(move(d, "BACK")).toMatchObject({ enabled: true, toStage: "PROPOSAL_SUBMITTED" });
    expectError(await stage(rep, d, { action: "BACK" }), 400);
    d = expectOk(await stage(rep, d, { action: "BACK", reason: "Terms changed" }));
    expect(d.stage).toBe("PROPOSAL_SUBMITTED");
    expectError(await stage(head, d, { action: "BACK" }), 400);
    d = expectOk(await stage(head, d, { action: "BACK", reason: "Proposal needs rework" }));
    expect(d.stage).toBe("QUALIFIED");
    expectError(await (await as("regionalHead")).post(`/deals/${d.id}/stage`, { version: d.version, action: "BACK", reason: "x" }), 404);
    expectError(await presales.post(`/deals/${d.id}/stage`, { version: d.version, action: "HOLD", reason: "x" }), 403);
  });

  it("a pricing request needs lines with a third-party OEM; nothing is worked while the deal is on hold", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Empty deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), needsPresales: false }));
    expect(d.requestAbility.pricing).toMatchObject({ enabled: false, reason: expect.stringMatching(/Add the lines/) });
    expectError(await rep.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(5) }), 409, "NO_LINES");
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ productId: noc.id, quantity: 5, revenueModel: "ARR", termMonths: 12 }], deleteIds: [] }));
    expectError(await rep.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(5) }), 409, "NO_THIRD_PARTY_LINES");
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ productId: laptop.id, quantity: 5 }], deleteIds: [] }));
    const pr = expectOk(await rep.post<Req>(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(5) }));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    // the assigned buyer sees the deal but never gets a brief (it carries prices); nobody gets one without a key
    expectError(await purchase.post(`/deals/${d.id}/ai`, { kind: "brief" }), 403);
    expectError(await purchase.post(`/deals/${d.id}/ai`, { kind: "scope" }), 403);
    // sales keeps the price while purchase prices; the spec is frozen
    expect(d.lines[1]!.editable).toEqual(["price"]);
    expectError(await rep.patch(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ id: d.lines[1]!.id, quantity: 6 }] }), 403);
    d = expectOk(await stage(rep, d, { action: "HOLD", reason: "Customer paused the project" }));
    expectError(await purchase.patch(`/pricing-requests/${pr.id}`, { action: "START" }), 409, "ON_HOLD");
    const bv = expectOk(await purchase.get<Deal>(`/deals/${d.id}`));
    expect(bv.next.headline).toBe("Waiting on sales (Rakesh Pawar): sales to resume the deal");
    d = expectOk(await stage(rep, d, { action: "RESUME" }));
    expectOk(await purchase.patch(`/pricing-requests/${pr.id}`, { action: "START" }));
    const q = expectOk(await purchase.get<{ rows: Req[] }>("/pricing-requests?mine=true"));
    expect(q.rows.find((r) => r.id === pr.id)!.status).toBe("IN_PROGRESS");
  });

  it("submitting a BOQ with uncosted third-party lines hands the deal to purchase; opening the deal starts the request", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Handoff deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: server.id, quantity: 1 }] }));
    expectOk(await uploadDoc(rep, d.id, "Customer RFP"));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    d = expectOk(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(4), presalesScope: "Spec it" }));
    const req = d.presalesRequests[0]!;
    expect(req.status).toBe("REQUESTED");
    // the panel starts the request when the assignee opens the deal
    expectOk(await presales.patch(`/presales-requests/${req.id}`, { action: "START" }));
    // the buyer is required when third-party lines still need a cost and nobody has been asked
    expectError(await presales.patch(`/presales-requests/${req.id}`, { action: "SUBMIT", summary: "One host" }), 400);
    expectError(await presales.patch(`/presales-requests/${req.id}`, { action: "SUBMIT", summary: "One host", pricingAssigneeId: presalesId, pricingDueDate: isoDate(3) }), 400);
    expectOk(await presales.patch(`/presales-requests/${req.id}`, { action: "SUBMIT", summary: "One host", pricingAssigneeId: purchaseId, pricingDueDate: isoDate(3), pricingNotes: "Best price" }));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(d.presalesRequests[0]!.status).toBe("SUBMITTED");
    expect(d.pricingRequests[0]).toMatchObject({ status: "REQUESTED", assignedToId: purchaseId });
    expect(d.next.headline).toMatch(/^Waiting on purchase \(Meera Iyer\)/);
    // it shows up as the buyer's work, with the step and the due date, and in the owner's "waiting on team" view
    const mine = expectOk(await purchase.get<{ rows: { id: string; step: string; due: string | null }[]; count: number }>("/metrics/my-actions"));
    expect(mine.rows.find((r) => r.id === d.id)).toMatchObject({ step: expect.stringMatching(/purchase cost/), due: isoDate(3) });
    const reps = expectOk(await rep.get<{ rows: { id: string }[] }>("/metrics/my-actions"));
    expect(reps.rows.find((r) => r.id === d.id)).toBeUndefined(); // waiting on purchase, not on the rep
    const heads = expectOk(await head.get<{ team: number }>("/metrics/my-actions"));
    expect(heads.team).toBeGreaterThanOrEqual(0);
  });

  it("request lifecycle: cancel, reassign, re-request in BOQ, overdue flag, and the queues each role sees", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Requests deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: server.id, quantity: 1 }] }));
    expectOk(await uploadDoc(rep, d.id, "SoW"));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    d = expectOk(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(0), presalesScope: "Size it" }));
    const r1 = d.presalesRequests[0]!;
    expect(r1.status).toBe("REQUESTED");
    expectError(await presales.patch(`/presales-requests/${r1.id}`, { action: "CANCEL" }), 403);
    const users = expectOk(await rep.get<Users>("/users")).rows;
    const presales2 = users.find((u) => u.email === "amit.rampal@progression.com")!.id;
    expectOk(await rep.patch(`/presales-requests/${r1.id}`, { action: "REASSIGN", assignedToId: presales2 }));
    expectError(await presales.get(`/deals/${d.id}`), 404); // reassigned away
    expectOk(await (await as("presales2")).get(`/deals/${d.id}`));
    expectOk(await rep.patch(`/presales-requests/${r1.id}`, { action: "CANCEL" }));
    expectError(await rep.patch(`/presales-requests/${r1.id}`, { action: "START" }), 403);
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(d.presalesRequests[0]!.status).toBe("CANCELLED");
    expect(d.next.steps.find((s) => s.current)).toMatchObject({ action: "ASK_PRESALES", mine: true });
    // in BOQ with nothing open, sales may ask presales again by hand
    expect(d.requestAbility.presales.enabled).toBe(true);
    const r2 = expectOk(await rep.post<Req>(`/deals/${d.id}/presales-requests`, { assignedToId: presalesId, dueDate: isoDate(4), scope: "Second look" }));
    const all = expectOk(await head.get<{ rows: Req[] }>(`/presales-requests?deal_id=${d.id}`));
    expect(all.rows.length).toBe(2);
    expect(expectOk(await (await as("rep2")).get<{ rows: Req[] }>(`/presales-requests?deal_id=${d.id}`)).rows).toEqual([]);
    // the open BOQ keeps sales from asking purchase; an admin may
    expectError(await rep.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(2) }), 409, "BOQ_IN_PROGRESS");
    expectError(await admin.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(-3) }), 400);
    expectOk(await admin.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(2) }));
    void r2;
    const q = expectOk(await purchase.get<{ rows: Req[] }>("/pricing-requests"));
    expect(q.rows.some((r) => r.deal?.code && r.overdue === false)).toBe(true);
  });
});
