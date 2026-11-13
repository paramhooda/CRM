import { describe, expect, it } from "vitest";
import { BASE, as, expectError, expectOk, uniq } from "./helpers";

type Account = { id: string; code: string; name: string; gstin: string | null; owner: { id: string; fullName: string }; deletedAt: string | null };
type Contact = { id: string; firstName: string; lastName: string; email: string | null; isPrimary: boolean; account: { id: string } };

const gstinFor = (n: number) => `27AAACK${String(1000 + (n % 9000)).padStart(4, "0")}X1Z${(n % 10).toString()}`;

describe("accounts", () => {
  it("a rep creates an account they own, with a unique name and GSTIN; codes are sequential", async () => {
    const rep = await as("rep");
    const name = uniq("Zenith Capital");
    const g = gstinFor(Date.now() % 9000);
    const a = expectOk(await rep.post<Account>("/accounts", { name, gstin: g.toLowerCase(), city: "Mumbai", pincode: "400051" }));
    expect(a.code).toMatch(/^ACC-\d{4}$/);
    expect(a.gstin).toBe(g);
    expect(a.owner.fullName).toBe("Rakesh Pawar");
    expectError(await rep.post("/accounts", { name: name.toUpperCase() }), 409, "DUPLICATE_NAME");
    expectError(await rep.post("/accounts", { name: uniq("Other"), gstin: g }), 409, "DUPLICATE_GSTIN");
    const bad = expectError(await rep.post("/accounts", { name: "X", gstin: "nope", pincode: "12" }), 400, "VALIDATION");
    expect(Object.keys(bad.fields ?? {}).sort()).toEqual(["gstin", "name", "pincode"]);
    const list = expectOk(await rep.get<{ rows: Account[]; total: number }>(`/accounts?q=${encodeURIComponent(name)}`));
    expect(list.rows.map((r) => r.id)).toEqual([a.id]);
  });

  it("scope: a rep sees only their accounts; another rep gets 404 by id; their manager and the admin see it", async () => {
    const rep = await as("rep");
    const a = expectOk(await rep.post<Account>("/accounts", { name: uniq("Scoped Co") }));
    const rep2 = await as("rep2");
    expectError(await rep2.get(`/accounts/${a.id}`), 404);
    expectError(await rep2.patch(`/accounts/${a.id}`, { city: "Pune" }), 404);
    expect(expectOk(await rep2.get<{ rows: Account[] }>(`/accounts?q=${encodeURIComponent(a.name)}`)).rows).toEqual([]);
    const west = await as("regionalHead");
    expectError(await west.get(`/accounts/${a.id}`), 404); // Rakesh reports to Vivek, not Anita
    expectOk(await (await as("salesHead")).get(`/accounts/${a.id}`));
    expectOk(await (await as("admin")).get(`/accounts/${a.id}`));
    // a manager may assign the account to someone in their team; a rep may not reassign at all
    const users = expectOk(await rep.get<{ rows: { id: string; email: string }[] }>("/users")).rows;
    const rep2Id = users.find((u) => u.email === "naresh.kumar@progression.com")!.id;
    expectError(await rep.patch(`/accounts/${a.id}`, { ownerId: rep2Id }), 403);
    const repWestId = users.find((u) => u.email === "chirag.kapoor@progression.com")!.id;
    expectOk(await (await as("salesHead")).patch(`/accounts/${a.id}`, { ownerId: repWestId })); // Chirag is under Anita who is under Vivek
    expectError(await west.patch(`/accounts/${a.id}`, { ownerId: a.owner.id }), 403); // Rakesh is outside Anita's team
  });

  it("support roles see accounts only through assigned deals, read-only", async () => {
    const a = expectOk(await (await as("rep")).post<Account>("/accounts", { name: uniq("Unassigned Co") }));
    const presales = await as("presales");
    expect(expectOk(await presales.get<{ rows: Account[] }>(`/accounts?q=${encodeURIComponent(a.name)}`)).rows).toEqual([]);
    expectError(await presales.get(`/accounts/${a.id}`), 404);
    expectError(await presales.post("/accounts", { name: "Nope" }), 403);
  });

  it("soft delete needs a manager, refuses an account with deals, and an admin restores it", async () => {
    const rep = await as("rep");
    const a = expectOk(await rep.post<Account>("/accounts", { name: uniq("Deletable") }));
    expectError(await rep.del(`/accounts/${a.id}`), 403);
    const head = await as("salesHead");
    expectOk(await head.del(`/accounts/${a.id}`));
    expectError(await rep.get(`/accounts/${a.id}`), 404);
    expect(expectOk(await rep.get<{ rows: Account[] }>(`/accounts?q=${encodeURIComponent(a.name)}`)).rows).toEqual([]);
    const admin = await as("admin");
    expect(expectOk(await admin.get<{ rows: Account[] }>(`/accounts?q=${encodeURIComponent(a.name)}&includeDeleted=true`)).rows[0]?.deletedAt).not.toBeNull();
    expectError(await head.post(`/accounts/${a.id}/restore`), 403);
    expectOk(await admin.post(`/accounts/${a.id}/restore`));
    expect(expectOk(await rep.get<Account>(`/accounts/${a.id}`)).deletedAt).toBeNull();
  });

  it("changes are audited with old and new values", async () => {
    const rep = await as("rep");
    const a = expectOk(await rep.post<Account>("/accounts", { name: uniq("Audited"), city: "Delhi" }));
    expectOk(await rep.patch(`/accounts/${a.id}`, { city: "Gurugram", website: "https://example.com" }));
    const admin = await as("admin");
    const log = expectOk(await admin.get<{ rows: { field: string | null; oldValue: string | null; newValue: string | null; action: string }[] }>(`/audit?entity_type=account&entity_id=${a.id}`));
    expect(log.rows.map((r) => [r.action, r.field, r.oldValue, r.newValue])).toEqual(expect.arrayContaining([["UPDATE", "city", "Delhi", "Gurugram"], ["UPDATE", "website", null, "https://example.com"], ["CREATE", null, null, expect.stringMatching(/^ACC-/)]]));
  });
});

describe("contacts", () => {
  it("belong to an account the actor can edit; email is unique; only one primary per account", async () => {
    const rep = await as("rep");
    const a = expectOk(await rep.post<Account>("/accounts", { name: uniq("Contacts Co") }));
    const email = `${uniq("rekha").replace(/\s+/g, ".").toLowerCase()}@example.com`;
    const c1 = expectOk(await rep.post<Contact>("/contacts", { accountId: a.id, firstName: "Rekha", lastName: "Menon", email: email.toUpperCase(), isPrimary: true }));
    expect(c1.email).toBe(email);
    expectError(await rep.post("/contacts", { accountId: a.id, firstName: "Dup", lastName: "Email", email }), 409, "DUPLICATE_EMAIL");
    const c2 = expectOk(await rep.post<Contact>("/contacts", { accountId: a.id, firstName: "Arun", lastName: "Shah", isPrimary: true }));
    expect(c2.isPrimary).toBe(true);
    expect(expectOk(await rep.get<Contact>(`/contacts/${c1.id}`)).isPrimary).toBe(false);
    const rep2 = await as("rep2");
    expectError(await rep2.post("/contacts", { accountId: a.id, firstName: "No", lastName: "Access" }), 404);
    expectError(await rep2.get(`/contacts/${c1.id}`), 404);
    const list = expectOk(await rep.get<{ rows: Contact[]; total: number }>(`/contacts?account_id=${a.id}`));
    expect(list.total).toBe(2);
    expectOk(await rep.del(`/contacts/${c2.id}`));
    expect(expectOk(await rep.get<{ rows: Contact[]; total: number }>(`/contacts?account_id=${a.id}`)).total).toBe(1);
    expectOk(await (await as("admin")).post(`/contacts/${c2.id}/restore`));
    expect(expectOk(await rep.get<{ rows: Contact[]; total: number }>(`/contacts?account_id=${a.id}`)).total).toBe(2);
  });
});

describe("exports", () => {
  it("accounts export has the same rows as the list, as CSV with a BOM", async () => {
    const rep = await as("rep");
    const list = expectOk(await rep.get<{ rows: Account[]; total: number }>("/accounts?pageSize=200"));
    const r = await rep.get("/exports/accounts");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    expect(r.headers.get("content-disposition")).toMatch(/attachment; filename="accounts-/);
    expect(r.raw.startsWith("Code,Account,GSTIN")).toBe(true); // text() strips the byte-order mark
    const bytes = new Uint8Array(await (await fetch(`${BASE}/api/v1/exports/accounts`, { headers: { cookie: rep.cookie } })).arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = r.raw.trim().split("\r\n");
    expect(lines.length - 1).toBe(list.total);
    expectError(await rep.get("/exports/nope"), 404);
  });
});
