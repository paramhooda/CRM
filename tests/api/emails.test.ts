import { beforeAll, describe, expect, it } from "vitest";
import { Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Deal = { id: string; version: number; stage: string; lines: { id: string }[]; emails: { status: string }[] };

let rep: Client, presales: Client, admin: Client;
let accountId: string, contactId: string, laptopId: string;

beforeAll(async () => {
  [rep, presales, admin] = await Promise.all([as("rep"), as("presales"), as("admin")]);
  laptopId = expectOk(await rep.get<{ rows: { id: string }[] }>("/products?q=Lenovo%20Business%20laptop,%20Core%20i5")).rows[0]!.id;
  accountId = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Mail Co") })).id;
  contactId = expectOk(await rep.post<{ id: string }>("/contacts", { accountId, firstName: "Kavita", lastName: "Rao", email: `kavita.${Date.now()}@example.com` })).id;
});

describe("emails and the proposal", () => {
  it("without a mail server nothing is sent and the deal stays put; the manual advance still works; a refused message is kept as failed", async () => {
    expect(expectOk(await rep.get<{ enabled: boolean }>("/emails")).enabled).toBe(false);
    let d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Mailed deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 2, unitSalesPrice: "72000", unitPurchaseCost: "60000" }] }));
    const mail = { to: ["kavita@example.com"], cc: ["boss@example.com"], subject: "Proposal", body: "Please find the quotation attached.", documentIds: [] as string[] };
    expectError(await rep.post(`/deals/${d.id}/emails`, { ...mail, to: [] }), 400);
    expectError(await rep.post(`/deals/${d.id}/emails`, { ...mail, to: ["not-an-address"] }), 400);
    expectError(await rep.post(`/deals/${d.id}/emails`, mail), 409, "MAIL_OFF");
    expectError(await rep.post(`/deals/${d.id}/send-proposal`, { ...mail, version: d.version }), 409, "MAIL_OFF");
    expectError(await presales.post(`/deals/${d.id}/emails`, mail), 403);
    expectError(await (await as("rep2")).post(`/deals/${d.id}/emails`, mail), 404);
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(d.stage).toBe("QUALIFIED");
    expect(expectOk(await rep.get<{ rows: unknown[] }>(`/deals/${d.id}/emails`)).rows).toEqual([]);

    // a server that refuses: the attempt is kept on the deal as failed and nothing moves
    expectOk(await admin.put("/admin/settings/mail", { host: "127.0.0.1", port: 2525, secure: false, user: "", password: "" }));
    expect(expectOk(await rep.get<{ enabled: boolean }>("/emails")).enabled).toBe(true);
    expectError(await rep.post(`/deals/${d.id}/send-proposal`, { ...mail, version: d.version }), 502, "MAIL_FAILED");
    d = expectOk(await rep.get<Deal>(`/deals/${d.id}`));
    expect(d.stage).toBe("QUALIFIED");
    expect(d.emails.map((e) => e.status)).toEqual(["FAILED"]);
    expectOk(await admin.put("/admin/settings/mail", { host: "", port: 587, secure: false, user: "", password: "" }));

    // sent from Outlook instead: the plain advance
    d = expectOk(await rep.post<Deal>(`/deals/${d.id}/stage`, { version: d.version, action: "ADVANCE" }));
    expect(d.stage).toBe("PROPOSAL_SUBMITTED");
    // the attachment must belong to the deal
    expectError(await rep.post(`/deals/${d.id}/emails`, { ...mail, documentIds: ["00000000-0000-4000-8000-000000000000"] }), 409, "MAIL_OFF");
  });
});
