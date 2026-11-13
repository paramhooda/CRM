import { describe, it, expect } from "vitest";
import { canSeeDocument, checkUpload, contentDisposition, uploadKinds, visibleKinds, MAX_DOCUMENT_BYTES } from "@/lib/documents";
import { can, isSupportRole, opportunityScope, accountScope } from "@/lib/authz";

describe("who adds which documents", () => {
  it("each role adds the papers of its own job; managers add any kind; nobody uploads a BOQ (it is the line items)", () => {
    expect(uploadKinds("PRESALES")).toEqual(expect.arrayContaining(["SOW", "SOLUTION_DOC"]));
    for (const role of ["SALES", "PRESALES", "PURCHASE", "SALES_HEAD", "ADMIN"]) expect(uploadKinds(role)).not.toContain("BOQ_SHEET");
    expect(uploadKinds("PRESALES")).not.toContain("SUPPLIER_QUOTE");
    expect(uploadKinds("PURCHASE")).toEqual(["SUPPLIER_QUOTE", "OEM_QUOTE", "OTHER"]);
    expect(uploadKinds("SALES")).toContain("CUSTOMER_PO");
    expect(uploadKinds("SALES_HEAD")).toHaveLength(9);
  });
});

describe("who sees which documents", () => {
  const doc = (kind: string, uploadedById = "someone") => ({ kind, uploadedById });
  it("sales sees everything on its deals", () => {
    expect(visibleKinds("SALES")).toBeNull();
    expect(canSeeDocument({ id: "s1", role: "SALES" }, doc("SUPPLIER_QUOTE"))).toBe(true);
  });
  it("purchase sees what it buys against and supplier pricing, never the customer's PO", () => {
    const buyer = { id: "b1", role: "PURCHASE" };
    expect(canSeeDocument(buyer, doc("SOW"))).toBe(true);
    expect(canSeeDocument(buyer, doc("OEM_QUOTE"))).toBe(true);
    expect(canSeeDocument(buyer, doc("CUSTOMER_PO"))).toBe(false);
    expect(canSeeDocument(buyer, doc("PRESENTATION"))).toBe(false);
  });
  it("presales sees the requirement, design papers and supplier pricing, not the PO", () => {
    const eng = { id: "p1", role: "PRESALES" };
    expect(canSeeDocument(eng, doc("CUSTOMER_RFP"))).toBe(true);
    expect(canSeeDocument(eng, doc("SUPPLIER_QUOTE"))).toBe(true);
    expect(canSeeDocument(eng, doc("CUSTOMER_PO"))).toBe(false);
  });
  it("everyone sees what they added themselves", () => {
    expect(canSeeDocument({ id: "b1", role: "PURCHASE" }, doc("OTHER", "b1"))).toBe(true);
    expect(canSeeDocument({ id: "b1", role: "PURCHASE" }, doc("OTHER", "b2"))).toBe(false);
  });
});

describe("accepted files", () => {
  it("takes office files, PDFs, images and mail by extension, and cleans the name", () => {
    expect(checkUpload({ name: "C:\\quotes\\Ingram \"Q4\".PDF", size: 1000 })).toEqual({ ok: true, fileName: "Ingram Q4.PDF", mimeType: "application/pdf" });
    expect(checkUpload({ name: "BOQ.xlsx", size: 10 })).toMatchObject({ ok: true, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  });
  it("refuses anything a browser could run, empty files and files over the limit", () => {
    expect(checkUpload({ name: "page.html", size: 10 }).ok).toBe(false);
    expect(checkUpload({ name: "logo.svg", size: 10 }).ok).toBe(false);
    expect(checkUpload({ name: "noext", size: 10 }).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: 0 }).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: MAX_DOCUMENT_BYTES + 1 })).toMatchObject({ ok: false, error: expect.stringMatching(/limit is 15 MB/) });
  });
  it("opens PDFs and images in the browser only when asked; everything else downloads", () => {
    expect(contentDisposition("Q.pdf", "application/pdf", true)).toMatch(/^inline;/);
    expect(contentDisposition("Q.docx", "application/msword", true)).toMatch(/^attachment;/);
    expect(contentDisposition("Coût.pdf", "application/pdf", false)).toBe(`attachment; filename="Co_t.pdf"; filename*=UTF-8''Co%C3%BBt.pdf`);
  });
});

describe("presales and purchase see only their own deals and no sell side", () => {
  it("scopes deals to the ones they are or were assigned to", () => {
    expect(opportunityScope({ id: "p1", role: "PRESALES" })).toEqual({
      deletedAt: null, OR: [{ presalesOwnerId: "p1" }, { presalesRequests: { some: { assignedToId: "p1" } } }],
    });
    expect(opportunityScope({ id: "b1", role: "PURCHASE" })).toEqual({
      deletedAt: null, OR: [{ purchaseOwnerId: "b1" }, { pricingRequests: { some: { assignedToId: "b1" } } }],
    });
    expect(opportunityScope({ id: "h", role: "SALES_HEAD" })).toEqual({ deletedAt: null });
    expect(accountScope({ id: "b1", role: "PURCHASE" })).toMatchObject({ opportunities: { some: expect.anything() } });
  });
  it("hides the sell side from them; they add documents only while the deal is open", () => {
    expect(isSupportRole({ id: "b1", role: "PURCHASE" })).toBe(true);
    expect(can.viewSales({ id: "b1", role: "PURCHASE" })).toBe(false);
    expect(can.viewSales({ id: "s1", role: "SALES" })).toBe(true);
    const opp = { salesOwnerId: "s1", presalesOwnerId: "p1", purchaseOwnerId: "b1" };
    expect(can.addDocument({ id: "p1", role: "PRESALES" }, { ...opp, closed: false })).toBe(true);
    expect(can.addDocument({ id: "p1", role: "PRESALES" }, { ...opp, closed: true })).toBe(false);
    expect(can.addDocument({ id: "s1", role: "SALES" }, { ...opp, closed: true })).toBe(true);
    expect(can.addDocument({ id: "s2", role: "SALES" }, { ...opp, closed: false })).toBe(false);
  });
});
