import { beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Deal = { id: string; version: number; quotes: Quote[]; lines: { id: string }[] };
type Quote = { id: string; quoteNo: string; revision: number; validUntil: string; subtotal: string; documentId: string; document?: { fileName: string } };

let rep: Client, presales: Client, purchase: Client, admin: Client;
let accountId: string, contactId: string, laptopId: string;

beforeAll(async () => {
  [rep, presales, purchase, admin] = await Promise.all([as("rep"), as("presales"), as("purchase"), as("admin")]);
  laptopId = expectOk(await rep.get<{ rows: { id: string }[] }>("/products?q=Lenovo%20Business%20laptop,%20Core%20i5")).rows[0]!.id;
  accountId = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Quote Co"), gstin: `27AAACK${String(Date.now() % 10000).padStart(4, "0")}X1Z2`, city: "Pune", state: "Maharashtra" })).id;
  contactId = expectOk(await rep.post<{ id: string }>("/contacts", { accountId, firstName: "Kavita", lastName: "Rao", email: `kavita.${Date.now()}@example.com` })).id;
  expectOk(await admin.put("/admin/settings/company", { name: "Progression Infonet", addressLine: "Plot 1, Hinjewadi", city: "Pune", state: "Maharashtra", pincode: "411057", gstin: "27AAACK4019X1Z2", quoteTerms: "Payment 30 days from invoice." }));
});

describe("quotes", () => {
  it("a quote is generated only from final prices, numbered per fiscal year, stored as a PDF document, and revised", async () => {
    const d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Quoted deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 10, unitSalesPrice: "72000" }] }));
    expectError(await rep.post(`/deals/${d.id}/quotes`, {}), 409, "QUOTE_BLOCKED"); // no cost yet
    expectOk(await admin.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ id: d.lines[0]!.id, unitPurchaseCost: "60000" }], deleteIds: [] })); // purchase's job, done by an admin here
    // purchase has no deal access and the route is for sales roles; presales too
    expectError(await purchase.post(`/deals/${d.id}/quotes`, {}), 403);
    expectError(await presales.get(`/deals/${d.id}/quotes`), 403);
    expectError(await (await as("rep2")).post(`/deals/${d.id}/quotes`, {}), 404);
    const q = expectOk(await rep.post<Quote>(`/deals/${d.id}/quotes`, { validityDays: 15, notes: "Delivery in 4 weeks." }));
    expect(q.quoteNo).toMatch(/^QT-FY\d{2}-\d{4}$/);
    expect(q).toMatchObject({ revision: 1, subtotal: "720000", validUntil: isoDate(15) });
    expect(q.document?.fileName).toMatch(/^QT-FY\d{2}-\d{4}-Quoted-deal/);
    const dl = await fetch(`${BASE}/api/v1/documents/${q.documentId}/download`, { headers: { cookie: rep.cookie } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await dl.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(2000);
    // the quote is a sales-only document: presales never sees it, the rep sees it under Documents
    const view = expectOk(await rep.get<Deal & { documents: { kind: { name: string } }[] }>(`/deals/${d.id}`));
    expect(view.quotes[0]!.quoteNo).toBe(q.quoteNo);
    expect(view.documents.some((x) => x.kind.name === "Quotation")).toBe(true);
    const q2 = expectOk(await rep.post<Quote>(`/deals/${d.id}/quotes`, {}));
    expect(q2.revision).toBe(2);
    expect(q2.quoteNo).not.toBe(q.quoteNo);
    expect(expectOk(await rep.get<{ rows: Quote[] }>(`/deals/${d.id}/quotes`)).rows.map((r) => r.revision)).toEqual([2, 1]);
    expectError(await rep.post(`/deals/${d.id}/quotes`, { validityDays: 0 }), 400);
  });
});
