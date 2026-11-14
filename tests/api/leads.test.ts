import { beforeAll, describe, expect, it } from "vitest";
import { Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Lead = { id: string; code: string; status: string; companyName: string; ownerId: string; canEdit?: boolean; convertedDealId: string | null; disqualifyReason: string | null };
let rep: Client;
let sourceId: string;

beforeAll(async () => {
  rep = await as("rep");
  sourceId = expectOk(await rep.get<{ leadSources: { id: string }[] }>("/lookups")).leadSources[0]!.id;
});

const newLead = (p: Record<string, unknown> = {}) => rep.post<Lead>("/leads", { companyName: uniq("Northstar Cement"), contactName: "Harsh Vardhan", contactEmail: `${uniq("harsh").replace(/\s/g, ".").toLowerCase()}@example.com`, leadSourceId: sourceId, estimatedValue: "1800000", ...p });

describe("leads", () => {
  it("capture, qualify, and the owner scope", async () => {
    const l = expectOk(await newLead());
    expect(l.code).toMatch(/^LEAD-\d{4}$/);
    expect(l.status).toBe("NEW");
    expectError(await rep.post("/leads", { companyName: "x" }), 400);
    const u = expectOk(await rep.patch<Lead>(`/leads/${l.id}`, { status: "QUALIFIED" }));
    expect(u.status).toBe("QUALIFIED");
    expectError(await rep.patch(`/leads/${l.id}`, { status: "CONVERTED" }), 400);
    const rep2 = await as("rep2");
    expectError(await rep2.get(`/leads/${l.id}`), 404);
    expect(expectOk(await rep2.get<{ rows: Lead[] }>(`/leads?q=${encodeURIComponent(l.companyName)}`)).rows).toEqual([]);
    expectOk(await (await as("salesHead")).get(`/leads/${l.id}`));
    expectError(await (await as("presales")).get("/leads"), 403);
    expectError(await (await as("purchase")).post("/leads", {}), 403);
  });

  it("disqualify needs a reason and closes the lead", async () => {
    const l = expectOk(await newLead());
    expectError(await rep.post(`/leads/${l.id}/disqualify`, { reason: "" }), 400);
    const d = expectOk(await rep.post<Lead>(`/leads/${l.id}/disqualify`, { reason: "No budget this year" }));
    expect(d).toMatchObject({ status: "DISQUALIFIED", disqualifyReason: "No budget this year" });
    expectError(await rep.patch(`/leads/${l.id}`, { contactName: "x y" }), 409, "CLOSED");
    expectError(await rep.post(`/leads/${l.id}/convert`, { account: { create: { name: uniq("X") } }, contact: { create: { firstName: "A", lastName: "B" } }, deal: { name: "Deal", expectedCloseDate: isoDate(30) } }), 409, "CLOSED");
  });

  it("converts once into a new account, contact and deal at Qualified, with the lead source carried over", async () => {
    const l = expectOk(await newLead());
    const r = expectOk(await rep.post<{ lead: Lead; accountId: string; contactId: string; dealId: string }>(`/leads/${l.id}/convert`, {
      account: { create: { name: l.companyName, city: "Nagpur" } },
      contact: { create: { firstName: "Harsh", lastName: "Vardhan", email: `${uniq("hv").replace(/\s/g, ".").toLowerCase()}@example.com`, designation: "Head IT" } },
      deal: { name: `${l.companyName} server refresh`, expectedCloseDate: isoDate(90), forecastCategory: "UPSIDE" },
    }));
    expect(r.lead.status).toBe("CONVERTED");
    expect(r.lead.convertedDealId).toBe(r.dealId);
    const deal = expectOk(await rep.get<{ stage: string; primaryContactId: string; leadSource: { id: string } | null; account: { id: string }; forecastCategory: string }>(`/deals/${r.dealId}`));
    expect(deal).toMatchObject({ stage: "QUALIFIED", primaryContactId: r.contactId, account: { id: r.accountId }, forecastCategory: "UPSIDE" });
    expect(deal.leadSource?.id).toBe(sourceId);
    const account = expectOk(await rep.get<{ contacts: { id: string; isPrimary: boolean }[] }>(`/accounts/${r.accountId}`));
    expect(account.contacts).toEqual([expect.objectContaining({ id: r.contactId, isPrimary: true })]);
    expectError(await rep.post(`/leads/${l.id}/convert`, { account: { existingId: r.accountId }, contact: { existingId: r.contactId }, deal: { name: "Again", expectedCloseDate: isoDate(30) } }), 409, "ALREADY_CONVERTED");
    expect(expectOk(await rep.get<Lead>(`/leads/${l.id}`)).canEdit).toBe(false);
  });

  it("converts into an existing account and contact; a duplicate account name is refused and nothing is written", async () => {
    const existing = expectOk(await rep.post<{ id: string; name: string }>("/accounts", { name: uniq("Existing Customer") }));
    const contact = expectOk(await rep.post<{ id: string }>("/contacts", { accountId: existing.id, firstName: "Meena", lastName: "K" }));
    const l = expectOk(await newLead());
    expectError(await rep.post(`/leads/${l.id}/convert`, { account: { create: { name: existing.name.toLowerCase() } }, contact: { create: { firstName: "A", lastName: "B" } }, deal: { name: "Dup", expectedCloseDate: isoDate(30) } }), 409, "DUPLICATE_NAME");
    expect(expectOk(await rep.get<Lead>(`/leads/${l.id}`)).status).toBe("NEW");
    const other = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Other Account") }));
    expectError(await rep.post(`/leads/${l.id}/convert`, { account: { existingId: other.id }, contact: { existingId: contact.id }, deal: { name: "Wrong contact", expectedCloseDate: isoDate(30) } }), 400);
    const r = expectOk(await rep.post<{ dealId: string; accountId: string }>(`/leads/${l.id}/convert`, { account: { existingId: existing.id }, contact: { existingId: contact.id }, deal: { name: "Renewal", expectedCloseDate: isoDate(30) } }));
    expect(r.accountId).toBe(existing.id);
    expectOk(await rep.get(`/deals/${r.dealId}`));
  });

  it("a manager deletes, an admin restores", async () => {
    const l = expectOk(await newLead());
    expectError(await rep.del(`/leads/${l.id}`), 403);
    expectOk(await (await as("salesHead")).del(`/leads/${l.id}`));
    expectError(await rep.get(`/leads/${l.id}`), 404);
    expectOk(await (await as("admin")).post(`/leads/${l.id}/restore`));
    expectOk(await rep.get(`/leads/${l.id}`));
  });
});
