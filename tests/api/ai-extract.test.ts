import { beforeAll, describe, it } from "vitest";
import { Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Deal = { id: string; version: number; lines: { id: string }[] };

let rep: Client, admin: Client;
let dealId: string;

const upload = (c: Client, kind: string, files: File[]) => {
  const form = new FormData();
  if (kind) form.set("kind", kind);
  for (const f of files) form.append("files", f);
  return c.post(`/deals/${dealId}/ai/extract`, undefined, { raw: form });
};
const sheet = () => new File(["Item,Qty\nLaptop,10"], "boq.csv", { type: "text/csv" });

beforeAll(async () => {
  [rep, admin] = await Promise.all([as("rep"), as("admin")]);
  const laptopId = expectOk(await rep.get<{ rows: { id: string }[] }>("/products?q=Lenovo%20Business%20laptop,%20Core%20i5")).rows[0]!.id;
  const accountId = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Extract Co"), city: "Pune", state: "Maharashtra" })).id;
  const contactId = expectOk(await rep.post<{ id: string }>("/contacts", { accountId, firstName: "Ravi", lastName: "Nair", email: `ravi.${Date.now()}@example.com` })).id;
  dealId = expectOk(await rep.post<Deal>("/deals", { name: uniq("Extract deal"), accountId, primaryContactId: contactId, expectedCloseDate: isoDate(30), lines: [{ productId: laptopId, quantity: 10 }] })).id;
  // the test server has no assistant key: every well-formed call ends in AI_OFF, after the checks below
  expectOk(await admin.put("/admin/settings/ai", { apiKey: "", model: "" }));
});

describe("reading documents into the BOQ or the costs", () => {
  it("checks the request before it ever reaches the assistant", async () => {
    expectError(await upload(rep, "", [sheet()]), 400); // which kind?
    expectError(await upload(rep, "boq", []), 400); // no file
    expectError(await upload(rep, "boq", [new File([""], "empty.csv", { type: "text/csv" })]), 404, "AI_OFF"); // permission and count pass; the key is checked before the contents
    expectError(await rep.post(`/deals/${dealId}/ai/extract`, { kind: "boq" }), 400); // JSON is not a form upload
  });
  it("only the assigned buyer reads vendor quotes; the owner or assigned presales builds the BOQ", async () => {
    expectError(await upload(rep, "prices", [sheet()]), 403); // the owner is not purchase
    expectError(await upload(await as("rep2"), "boq", [sheet()]), 404); // not their deal: not even visible
    expectError(await upload(await as("purchase"), "prices", [sheet()]), 404); // no open pricing request: no access
    expectError(await upload(rep, "boq", [sheet()]), 404, "AI_OFF"); // allowed, but no key on this server
    expectError(await upload(admin, "prices", [sheet()]), 404, "AI_OFF");
  });
});
