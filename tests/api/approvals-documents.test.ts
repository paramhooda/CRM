import { beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Deal = { id: string; version: number; stage: string; approvalState: string; approvalReasons: string[]; moves: { action: string; enabled: boolean; reason?: string }[]; lines: { id: string; unitPurchaseCost: string | null }[]; expectedGmPct: string | null; poNumber: string | null; documents: { id: string; kind: { name: string } }[] };
type Approval = { id: string; status: string; currentStep: number; reasons: string[]; steps: { stepNo: number; label: string; approvers: { id: string }[]; decision: string | null; autoPassed: boolean; current: boolean }[] };
type Doc = { id: string; fileName: string; kind: { name: string }; uploadedBy: { id: string } };
type Kinds = { documentKinds: { id: string; name: string; restrictedToSales: boolean; requiredAtWon: boolean }[] };

let rep: Client, head: Client, west: Client, admin: Client, presales: Client, purchase: Client;
let accountId: string, contactId: string, laptopId: string;
let kinds: Kinds["documentKinds"];

const upload = async (c: Client, dealId: string, kindName: string, fileName = "file.pdf", content = "%PDF-1.4 test", mime = "application/pdf") => {
  const form = new FormData();
  form.set("documentKindId", kinds.find((k) => k.name === kindName)!.id);
  form.set("description", "test upload");
  form.set("file", new File([content], fileName, { type: mime }));
  return c.post<Doc>(`/deals/${dealId}/documents`, undefined, { raw: form });
};
const stage = (c: Client, d: Deal, body: Record<string, unknown>) => c.post<Deal>(`/deals/${d.id}/stage`, { version: d.version, ...body });

beforeAll(async () => {
  [rep, head, west, admin, presales, purchase] = await Promise.all([as("rep"), as("salesHead"), as("regionalHead"), as("admin"), as("presales"), as("purchase")]);
  kinds = expectOk(await rep.get<Kinds>("/lookups")).documentKinds;
  laptopId = expectOk(await rep.get<{ rows: { id: string; name: string }[] }>("/products?q=Lenovo%20Business%20laptop,%20Core%20i5")).rows[0]!.id;
  accountId = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Approvals Co") })).id;
  contactId = expectOk(await rep.post<{ id: string }>("/contacts", { accountId, firstName: "Rohit", lastName: "Iyer" })).id;
});

describe("documents", () => {
  it("upload, list, download and delete follow role and kind visibility; the PO file is required at Won", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Doc deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 2, unitSalesPrice: "70000", unitPurchaseCost: "60000" }] }));
    expectError(await upload(rep, d.id, "Customer RFP", "page.html", "<b>x</b>", "text/html"), 400);
    expectError(await upload(rep, d.id, "Customer RFP", "empty.pdf", ""), 400);
    const rfp = expectOk(await upload(rep, d.id, "Customer RFP", "RFP.pdf"));
    expect(rfp.kind.name).toBe("Customer RFP");
    // presales is not on this deal: nothing
    expectError(await presales.get(`/deals/${d.id}/documents`), 404);
    expectError(await presales.get(`/documents/${rfp.id}/download`), 404);
    // bring presales in and let them attach a solution document, but not a proposal
    const presalesId = expectOk(await rep.get<{ rows: { id: string; email: string }[] }>("/users")).rows.find((u) => u.email === "rakesh.yadav@progression.com")!.id;
    expectOk(await rep.post(`/deals/${d.id}/presales-requests`, { assignedToId: presalesId, dueDate: isoDate(5), scope: "Spec the laptops" }));
    expectOk(await upload(presales, d.id, "Solution document", "Solution.docx", "PK..", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    expectError(await upload(presales, d.id, "Proposal", "Proposal.pdf"), 403);
    const dl = await fetch(`${BASE}/api/v1/documents/${rfp.id}/download`, { headers: { cookie: presales.cookie } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/RFP.pdf/);
    expect(await dl.text()).toBe("%PDF-1.4 test");
    const proposal = expectOk(await upload(rep, d.id, "Proposal", "Proposal.pdf"));
    expect(expectOk(await presales.get<{ rows: Doc[] }>(`/deals/${d.id}/documents`)).rows.map((r) => r.kind.name).sort()).toEqual(["Customer RFP", "Solution document"]);
    expectError(await presales.get(`/documents/${proposal.id}/download`), 404);
    expect(expectOk(await rep.get<{ rows: Doc[] }>(`/deals/${d.id}/documents`)).rows.length).toBe(3);
    // presales may remove their own upload; not the rep's
    const sol = expectOk(await presales.get<{ rows: Doc[] }>(`/deals/${d.id}/documents`)).rows.find((r) => r.kind.name === "Solution document")!;
    expectError(await presales.del(`/documents/${rfp.id}`), 403);
    expectOk(await presales.del(`/documents/${sol.id}`));

    // to Won: the PO number and the PO document
    const reqs = expectOk(await rep.get<{ rows: { id: string }[] }>(`/presales-requests?deal_id=${d.id}`)).rows;
    expectOk(await rep.patch(`/presales-requests/${reqs[0]!.id}`, { action: "CANCEL" }));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}`, { version: d.version, needsPresales: false })); // laptops after all
    d = expectOk(await stage(rep, d, { action: "ADVANCE" }));
    expect(d.stage).toBe("PROPOSAL_SUBMITTED");
    expect(d.moves.find((m) => m.action === "WON")).toMatchObject({ enabled: false, reason: expect.stringMatching(/PO document/) });
    expectError(await stage(rep, d, { action: "WON", poNumber: "PO/2026/001" }), 409);
    expectOk(await upload(rep, d.id, "Customer PO", "PO.pdf"));
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expectError(await stage(rep, d, { action: "WON" }), 400); // PO number
    d = expectOk(await stage(rep, d, { action: "WON", poNumber: "PO/2026/001" }));
    expect(d).toMatchObject({ stage: "CLOSED_WON", poNumber: "PO/2026/001" });
    // purchase never sees the PO, even when assigned
    expectError(await purchase.get(`/deals/${d.id}`), 404);
    const po = d.documents.find((x) => x.kind.name === "Customer PO")!;
    expectError(await rep.del(`/documents/${po.id}`), 409, "LOCKED");
    expectOk(await head.del(`/documents/${po.id}`));
  });
});

describe("approvals", () => {
  it("a low-margin deal needs approval: owner's manager, then any Sales Head; prices changing afterwards lapse it", async () => {
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Thin margin"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 10, unitSalesPrice: "62000", unitPurchaseCost: "60000" }] }));
    expect(Number(d.expectedGmPct)).toBeCloseTo(3.23, 1);
    expect(d.approvalState).toBe("NEEDED");
    expect(d.approvalReasons[0]).toMatch(/GM 3.2% is below 12.0%/);
    expect(d.moves.find((m) => m.action === "ADVANCE")).toMatchObject({ enabled: false, reason: expect.stringMatching(/approval/) });
    expectError(await stage(rep, d, { action: "ADVANCE" }), 409);
    expectError(await (await as("rep2")).post(`/deals/${d.id}/approvals`), 404);
    const r = expectOk(await rep.post<{ approval: Approval; deal: Deal }>(`/deals/${d.id}/approvals`));
    expect(r.approval.status).toBe("PENDING");
    expect(r.approval.steps.map((s) => [s.label, s.current])).toEqual([["Vivek Malhotra (manager)", true], ["Any Sales Head", false]]);
    expect(r.deal.approvalState).toBe("PENDING");
    expectError(await rep.post(`/deals/${d.id}/approvals`), 409, "ALREADY_PENDING");
    // the requester can't decide; a sales head outside the deal's scope gets 404; the manager approves step 1
    expectError(await rep.post(`/approvals/${r.approval.id}/decide`, { decision: "APPROVED" }), 403);
    expectError(await west.post(`/approvals/${r.approval.id}/decide`, { decision: "APPROVED" }), 404);
    expect(expectOk(await head.get<{ rows: Approval[] }>("/approvals")).rows.map((a) => a.id)).toContain(r.approval.id);
    expect(expectOk(await rep.get<{ rows: Approval[] }>("/approvals")).rows.map((a) => a.id)).not.toContain(r.approval.id);
    expectError(await head.post(`/approvals/${r.approval.id}/decide`, { decision: "REJECTED" }), 400); // note needed
    let a = expectOk(await head.post<Approval>(`/approvals/${r.approval.id}/decide`, { decision: "APPROVED", note: "Strategic account" }));
    expect(a).toMatchObject({ status: "PENDING", currentStep: 2 });
    // step 2 is any Sales Head: Vivek again (he is one) or Anita; Anita can't see the deal (404), so Vivek decides
    a = expectOk(await head.post<Approval>(`/approvals/${r.approval.id}/decide`, { decision: "APPROVED" }));
    expect(a.status).toBe("APPROVED");
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(d.approvalState).toBe("APPROVED");
    expect(d.moves.find((m) => m.action === "ADVANCE")!.enabled).toBe(true);
    // a price change lapses the approval
    d = expectOk(await rep.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ id: d.lines[0]!.id, unitSalesPrice: "61000" }] }));
    expect(d.approvalState).toBe("NEEDED");
    expect(expectOk(await rep.get<{ rows: Approval[] }>(`/deals/${d.id}/approvals`)).rows[0]!.status).toBe("SUPERSEDED");
    expect(d.moves.find((m) => m.action === "ADVANCE")!.enabled).toBe(false);
    // rejection path
    const r2 = expectOk(await rep.post<{ approval: Approval }>(`/deals/${d.id}/approvals`));
    const rejected = expectOk(await head.post<Approval>(`/approvals/${r2.approval.id}/decide`, { decision: "REJECTED", note: "Too thin" }));
    expect(rejected.status).toBe("REJECTED");
    expect(expectOk(await rep.get<Deal>(`/deals/${d.id}`)).approvalState).toBe("REJECTED");
  });

  it("the top Sales Head's own deal: no manager, so an admin stands in; the Sales Head step skips the requester; no rule → not needed", async () => {
    const headDeal = expectOk(await head.post<Deal>("/deals", { name: uniq("Head deal"), accountId: expectOk(await head.post<{ id: string }>("/accounts", { name: uniq("Head Co") })).id, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 1, unitSalesPrice: "61000", unitPurchaseCost: "60000" }] }));
    const r = expectOk(await head.post<{ approval: Approval }>(`/deals/${headDeal.id}/approvals`));
    expect(r.approval.steps.map((s) => [s.label, s.autoPassed, s.decision])).toEqual([["Owner's manager (no one available: Admin)", false, null], ["Any Sales Head", false, null]]);
    expect(r.approval.steps[1]!.approvers.map((a) => a.id)).not.toContain(expectOk(await head.get<{ id: string }>("/auth/me")).id);
    expect(r.approval.currentStep).toBe(1);
    expectError(await head.post(`/approvals/${r.approval.id}/decide`, { decision: "APPROVED" }), 403);
    expectOk(await admin.post(`/approvals/${r.approval.id}/decide`, { decision: "APPROVED" }));
    const ok = expectOk(await rep.post<Deal>("/deals", { name: uniq("Healthy"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 1, unitSalesPrice: "80000", unitPurchaseCost: "60000" }] }));
    expect(ok.approvalState).toBe("NONE_NEEDED");
    expectError(await rep.post(`/deals/${ok.id}/approvals`), 409, "NOT_NEEDED");
  });

  it("admins manage the rules; a rule needs a condition and an approver; a new rule applies at once", async () => {
    expectError(await head.get("/admin/approval-rules"), 403);
    const rules = expectOk(await admin.get<{ rows: { id: string; name: string }[] }>("/admin/approval-rules"));
    expect(rules.rows.map((r) => r.name)).toContain("Low margin: GM below 12%");
    expectError(await admin.post("/admin/approval-rules", { name: uniq("No condition"), steps: [{ approverKind: "ROLE", approverRole: "ADMIN" }] }), 400);
    expectError(await admin.post("/admin/approval-rules", { name: uniq("No role"), gmBelowPct: 50, steps: [{ approverKind: "ROLE" }] }), 400);
    const bu = expectOk(await admin.get<{ businessUnits: { id: string; name: string }[] }>("/lookups")).businessUnits.find((b) => b.name === "IT Infrastructure")!;
    const ruleName = uniq("ITI over 5L");
    const rule = expectOk(await admin.post<{ id: string }>("/admin/approval-rules", { name: ruleName, dealValueAtLeast: "500000", businessUnitId: bu.id, steps: [{ approverKind: "ROLE", approverRole: "ADMIN" }] }));
    expectError(await admin.post("/admin/approval-rules", { name: ruleName, dealValueAtLeast: "1", steps: [{ approverKind: "ROLE", approverRole: "ADMIN" }] }), 409, "DUPLICATE");
    const d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Big ITI"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 10, unitSalesPrice: "80000", unitPurchaseCost: "60000" }] }));
    expect(d.approvalState).toBe("NEEDED");
    expect(d.approvalReasons.join(" ")).toMatch(/Business unit matches/);
    expectOk(await admin.patch(`/admin/approval-rules/${rule.id}`, { name: `${ruleName} (off)`, isActive: false, dealValueAtLeast: "500000", businessUnitId: bu.id, steps: [{ approverKind: "ROLE", approverRole: "ADMIN" }] }));
    expect(expectOk(await rep.get<Deal>(`/deals/${d.id}`)).approvalState).toBe("NONE_NEEDED");
    expectOk(await admin.del(`/admin/approval-rules/${rule.id}`));
  });
});
