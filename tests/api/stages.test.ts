import { beforeAll, describe, expect, it } from "vitest";
import { Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Move = { action: string; enabled: boolean; reason?: string; toStage: string; needsPresalesRequest?: boolean; needsPo?: boolean };
type Line = { id: string; lineNo: number; unitSalesPrice: string | null; unitPurchaseCost: string | null; editable: string[]; oem: { isOwnIp: boolean } };
type Deal = { id: string; version: number; stage: string; needsPresales: boolean; moves: Move[]; lines: Line[]; presalesOwnerId: string | null; presalesRequests: Req[]; pricingRequests: Req[]; heldFromStage: string | null; holdReason: string | null; lossReason: { name: string } | null; expectedGmPct: string | null; approvalState: string };
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
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: true, toStage: "BOQ", needsPresalesRequest: true });
    expectError(await stage(rep, d, { action: "ADVANCE" }), 400); // who and when
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: purchaseId, presalesDueDate: isoDate(7) }), 400);
    expectError(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(-1) }), 400);
    d = expectOk(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(7), presalesScope: "Two hosts and NOC for 10 devices" }));
    expect(d.stage).toBe("BOQ");
    expect(d.presalesOwnerId).toBe(presalesId);
    expect(d.presalesRequests[0]).toMatchObject({ status: "REQUESTED", assignedToId: presalesId });
    expectError(await stage(rep, d, { action: "ADVANCE" }), 409); // BOQ not submitted
    expectError(await rep.post(`/deals/${d.id}/presales-requests`, { assignedToId: presalesId, dueDate: isoDate(5), scope: "again" }), 409, "ALREADY_OPEN");

    // presales sees the deal (technical side), works the request, edits lines, can't price them
    const mine = expectOk(await presales.get<{ rows: Req[] }>("/presales-requests?mine=true"));
    const req = mine.rows.find((r) => r.id === d.presalesRequests[0]!.id)!;
    expect(req.deal?.code).toBeDefined();
    const pv = expectOk(await presales.get<Deal>(`/deals/${d.id}`));
    expect(pv).not.toHaveProperty("expectedGmPct");
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
    expectOk(await presales.patch(`/presales-requests/${req.id}`, { action: "SUBMIT", summary: "Three hosts, four laptops, NOC on 10 devices" }));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(d.presalesRequests[0]!.status).toBe("SUBMITTED");
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: false, reason: expect.stringMatching(/Purchase/) });

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
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: d.lines.map((l) => ({ id: l.id, unitSalesPrice: l.unitPurchaseCost ? String(Math.round(Number(l.unitPurchaseCost) / 0.8)) : "20000" })) }));
    expect(d.approvalState).toBe("NONE_NEEDED");
    expect(move(d, "ADVANCE")).toMatchObject({ enabled: true, toStage: "PROPOSAL_SUBMITTED" });
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expect(d.stage).toBe("PROPOSAL_SUBMITTED");
    expect(move(d, "WON")).toMatchObject({ enabled: false, reason: expect.stringMatching(/PO document/) });
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expect(d.stage).toBe("NEGOTIATION");
    expect(move(d, "ADVANCE")).toMatchObject({ toStage: "CLOSED_WON", needsPo: true, enabled: false });
    expectError(await stage(rep, d, { action: "ADVANCE", poNumber: "PO-1" }), 409);
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
    d = expectOk(await stage(rep, d, { action: "ADVANCE", presalesAssigneeId: presalesId, presalesDueDate: isoDate(3) }));
    expect(d.stage).toBe("BOQ");
    d = expectOk(await stage(rep, d, { action: "SKIP_BOQ" }));
    expect(d).toMatchObject({ stage: "PROPOSAL_SUBMITTED", needsPresales: false });
    expect(d.presalesRequests[0]!.status).toBe("CANCELLED");
  });

  it("Hold needs a reason and resumes where it was; Lost needs a matching reason; a manager reopens", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Hold deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptop.id, quantity: 1, unitSalesPrice: "70000" }] }));
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expectError(await stage(rep, d, { action: "HOLD" }), 400);
    d = expectOk(await stage(rep, d, { action: "HOLD", reason: "Budget review in Q4" }));
    expect(d).toMatchObject({ stage: "HOLD", heldFromStage: "PROPOSAL_SUBMITTED", holdReason: "Budget review in Q4" });
    expect(d.moves.filter((m) => m.enabled).map((m) => m.action)).toEqual(["RESUME", "LOST", "DROPPED"]);
    d = expectOk(await stage(rep, d, { action: "RESUME" }));
    expect(d).toMatchObject({ stage: "PROPOSAL_SUBMITTED", heldFromStage: null, holdReason: null });
    const dropOnly = lossReasons.find((r) => r.appliesTo === "DROPPED")!;
    const lostOk = lossReasons.find((r) => r.appliesTo === "LOST")!;
    expectError(await stage(rep, d, { action: "LOST" }), 400);
    expectError(await stage(rep, d, { action: "LOST", lossReasonId: dropOnly.id }), 400);
    d = expectOk(await stage(rep, d, { action: "LOST", lossReasonId: lostOk.id, lossNotes: "Went with the incumbent" }));
    expect(d).toMatchObject({ stage: "CLOSED_LOST", lossReason: { name: lostOk.name } });
    expect(d.moves.map((m) => [m.action, m.enabled])).toEqual([["REOPEN", false]]);
    expectError(await stage(rep, d, { action: "REOPEN", reason: "oops" }), 409);
    expectError(await rep.patch(`/deals/${d.id}`, { version: d.version, name: "Closed edit" }), 409, "CLOSED");
    d = expectOk(await stage(head, d, { action: "REOPEN", reason: "Customer came back" }));
    expect(d).toMatchObject({ stage: "PROPOSAL_SUBMITTED", lossReason: null });
    // Dropped with a reason that applies to both
    const both = lossReasons.find((r) => r.appliesTo === "BOTH")!;
    d = expectOk(await stage(rep, d, { action: "DROPPED", lossReasonId: both.id }));
    expect(d.stage).toBe("DROPPED");
  });

  it("Back is for managers, one step at a time, with a reason", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Back deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptop.id, quantity: 1, unitSalesPrice: "70000" }] }));
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expect(d.stage).toBe("NEGOTIATION");
    expect(move(d, "BACK")).toMatchObject({ enabled: false, toStage: "PROPOSAL_SUBMITTED" });
    expectError(await stage(rep, d, { action: "BACK", reason: "x" }), 409);
    expectError(await stage(head, d, { action: "BACK" }), 400);
    d = expectOk(await stage(head, d, { action: "BACK", reason: "Proposal needs rework" }));
    expect(d.stage).toBe("PROPOSAL_SUBMITTED");
    expectError(await (await as("regionalHead")).post(`/deals/${d.id}/stage`, { version: d.version, action: "BACK", reason: "x" }), 404);
    expectError(await presales.post(`/deals/${d.id}/stage`, { version: d.version, action: "HOLD", reason: "x" }), 403);
  });

  it("request lifecycle: cancel, reassign, overdue flag, and the queues each role sees", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Requests deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: server.id, quantity: 1 }] }));
    const r1 = expectOk(await rep.post<Req>(`/deals/${d.id}/presales-requests`, { assignedToId: presalesId, dueDate: isoDate(0), scope: "Size it" }));
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
    const all = expectOk(await head.get<{ rows: Req[] }>(`/presales-requests?deal_id=${d.id}`));
    expect(all.rows.length).toBe(1);
    expect(expectOk(await (await as("rep2")).get<{ rows: Req[] }>(`/presales-requests?deal_id=${d.id}`)).rows).toEqual([]);
    expectError(await rep.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(-3) }), 400);
    expectOk(await admin.post(`/deals/${d.id}/pricing-requests`, { assignedToId: purchaseId, dueDate: isoDate(2) }));
    const q = expectOk(await purchase.get<{ rows: Req[] }>("/pricing-requests"));
    expect(q.rows.some((r) => r.deal?.code && r.overdue === false)).toBe(true);
  });
});
