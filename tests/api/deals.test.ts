import { beforeAll, describe, expect, it } from "vitest";
import { Client, as, expectError, expectOk, isoDate, uniq } from "./helpers";

type Lookups = { businessUnits: { id: string; name: string }[]; subBusinessUnits: { id: string; name: string; businessUnitId: string; needsPresales: boolean }[]; oems: { id: string; name: string; isOwnIp: boolean }[]; salesMethods: { id: string; name: string }[] };
type Product = { id: string; code: string; name: string; oemId: string; businessUnitId: string; subBusinessUnitId: string; revenueModel: string; listPrice: string | null; businessUnit: { name: string }; oem: { isOwnIp: boolean } };
type Line = { id: string; lineNo: number; description: string; quantity: string; unitSalesPrice: string | null; unitPurchaseCost: string | null; lineValue: string | null; expectedGmPct: string | null; revenueModel: string; termMonths: number | null; editable: string[]; oem: { isOwnIp: boolean } };
type Deal = {
  id: string; code: string; name: string; stage: string; version: number; dealValue: string; annualRecurringValue: string; expectedGmPct: string | null; totalCost: string | null; needsPresales: boolean;
  primaryBusinessUnit: { name: string } | null; primaryOem: { name: string } | null; lines: Line[]; moves: { action: string; enabled: boolean; reason?: string; toStage: string }[]; canEdit: boolean; owner: { id: string }; forecastCategory?: string;
  next: { headline: string; steps: { action?: string; done: boolean }[] };
};

let L: Lookups;
let server: Product, laptop: Product, noc: Product;
let accountId: string, contactId: string;
let rep: Client;

beforeAll(async () => {
  rep = await as("rep");
  L = expectOk(await rep.get<Lookups>("/lookups"));
  const products = expectOk(await rep.get<{ rows: Product[] }>("/products")).rows;
  server = products.find((p) => p.name.startsWith("HPE 2U Rack"))!;
  laptop = products.find((p) => p.name.startsWith("Lenovo Business laptop, Core i5"))!;
  noc = products.find((p) => p.name.includes("NOC monitoring"))!;
  const a = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Deals Co") }));
  accountId = a.id;
  contactId = expectOk(await rep.post<{ id: string }>("/contacts", { accountId, firstName: "Priya", lastName: "Nair", isPrimary: true })).id;
});

const sub = (bu: string, name: string) => L.subBusinessUnits.find((s) => s.name === name && L.businessUnits.find((b) => b.id === s.businessUnitId)!.name === bu)!;
const oem = (name: string) => L.oems.find((o) => o.name === name)!;

describe("deals", () => {
  it("a rep creates a deal with a product line, a custom line and an ARR line; values roll up", async () => {
    const d = expectOk(
      await rep.post<Deal>("/deals", {
        name: uniq("DC refresh"),
        accountId, primaryContactId: contactId, expectedCloseDate: isoDate(60),
        lines: [
          { productId: server.id, quantity: 4, unitSalesPrice: "1000000", unitPurchaseCost: "800000" },
          { description: "Installation services", businessUnitId: sub("Services", "Professional Services").businessUnitId, subBusinessUnitId: sub("Services", "Professional Services").id, oemId: oem("Progression").id, quantity: 10, unit: "Days", unitSalesPrice: "25000" },
          { productId: noc.id, quantity: 20, revenueModel: "ARR", termMonths: 36, unitSalesPrice: "24000", unitPurchaseCost: "12000" },
        ],
      }),
    );
    expect(d.code).toMatch(/^OPP-FY\d{2}-\d{4}$/);
    expect(d.stage).toBe("QUALIFIED");
    expect(d.needsPresales).toBe(true); // Server and NOC need presales
    expect(d.lines.map((l) => l.lineNo)).toEqual([1, 2, 3]);
    // 4 × 10,00,000 + 10 × 25,000 + 20 × 24,000 × 3 years
    expect(d.dealValue).toBe("5690000");
    expect(d.annualRecurringValue).toBe("480000");
    expect(d.totalCost).toBeNull(); // the custom line has no cost yet
    expect(d.primaryBusinessUnit?.name).toBe("IT Infrastructure");
    expect(d.primaryOem?.name).toBe("HPE");
    expect(d.lines[2]!.lineValue).toBe("1440000");
    expect(d.lines[0]!.expectedGmPct).toBe("20");
    expect(d.lines[0]!.editable).toEqual(["spec", "price", "delete"]);
    const adv = d.moves.find((m) => m.action === "ADVANCE")!;
    expect(adv).toMatchObject({ toStage: "BOQ", enabled: false, reason: expect.stringMatching(/requirement/) }); // the hand-over needs the customer's document
    expect(d.next.headline).toMatch(/^Your next step: attach the customer's requirement/);
    expect(d.next.steps.map((s) => [s.action, s.done])).toEqual([["SET_CONTACT", true], ["ATTACH_DOCUMENT", false], ["ADVANCE", false]]);
  });

  it("validation: name, contact at the account, Sub BU inside the BU, ARR term", async () => {
    const other = expectOk(await rep.post<{ id: string }>("/accounts", { name: uniq("Other Co") }));
    expectError(await rep.post("/deals", { name: "ab", accountId, expectedCloseDate: isoDate(10) }), 400, "VALIDATION");
    expectError(await rep.post("/deals", { name: "Wrong contact", accountId: other.id, primaryContactId: contactId, expectedCloseDate: isoDate(10) }), 400);
    const r = expectError(await rep.post("/deals", { name: "Bad sub BU", accountId, expectedCloseDate: isoDate(10), lines: [{ description: "x", businessUnitId: sub("Cloud", "Hosting").businessUnitId, subBusinessUnitId: sub("Services", "NOC").id, oemId: oem("Neon Cloud").id }] }), 400);
    expect(r.fields?.["lines.0.subBusinessUnitId"]).toBeDefined();
    expectError(await rep.post("/deals", { name: "ARR no term", accountId, expectedCloseDate: isoDate(10), lines: [{ productId: laptop.id, revenueModel: "ARR", termMonths: null }] }), 400);
  });

  it("scope: another rep gets 404, the manager up the chain sees it, a different team's head does not", async () => {
    const d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Scoped deal"), accountId, expectedCloseDate: isoDate(30), lines: [{ productId: laptop.id, quantity: 5 }] }));
    const rep2 = await as("rep2");
    expectError(await rep2.get(`/deals/${d.id}`), 404);
    expectError(await rep2.patch(`/deals/${d.id}`, { version: d.version, name: "Hijack" }), 404);
    expectError(await rep2.patch(`/deals/${d.id}/lines`, { version: d.version, upserts: [] }), 404);
    expect(expectOk(await rep2.get<{ rows: Deal[] }>(`/deals?q=${encodeURIComponent(d.name)}`)).rows).toEqual([]);
    expectError(await (await as("regionalHead")).get(`/deals/${d.id}`), 404);
    expectError(await (await as("presales")).get(`/deals/${d.id}`), 404);
    expect(expectOk(await (await as("salesHead")).get<Deal>(`/deals/${d.id}`)).canEdit).toBe(true);
    expect(expectOk(await (await as("admin")).get<Deal>(`/deals/${d.id}`)).canEdit).toBe(true);
  });

  it("header edits need the current version and are audited with old and new values", async () => {
    const d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Edited deal"), accountId, expectedCloseDate: isoDate(30), forecastCategory: "PIPELINE" }));
    const u = expectOk(await rep.patch<Deal>(`/deals/${d.id}`, { version: d.version, expectedCloseDate: isoDate(45), forecastCategory: "UPSIDE", nextStep: "Demo on site" }));
    expect(u.version).toBe(d.version + 1);
    expectError(await rep.patch(`/deals/${d.id}`, { version: d.version, name: "Stale" }), 409, "STALE");
    const h = expectOk(await rep.get<{ audit: { field: string | null; oldValue: string | null; newValue: string | null }[]; stages: { toStage: string; fromStage: string | null }[] }>(`/deals/${d.id}/history`));
    expect(h.stages).toEqual([expect.objectContaining({ fromStage: null, toStage: "QUALIFIED" })]);
    expect(h.audit.map((a) => [a.field, a.oldValue, a.newValue])).toEqual(expect.arrayContaining([["expectedCloseDate", isoDate(30), isoDate(45)], ["forecastCategory", "PIPELINE", "UPSIDE"], ["nextStep", null, "Demo on site"]]));
  });

  it("lines editor: a rep changes spec and price but not cost; lines are renumbered after a delete; approvals lapse on price change", async () => {
    const d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Lines deal"), accountId, expectedCloseDate: isoDate(30), lines: [{ productId: laptop.id, quantity: 10, unitSalesPrice: "70000" }, { productId: server.id, quantity: 1 }] }));
    expectError(await rep.patch(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ id: d.lines[0]!.id, unitPurchaseCost: "60000" }] }), 403);
    const u = expectOk(await rep.patch<Deal>(`/deals/${d.id}/lines`, { version: d.version, upserts: [{ id: d.lines[0]!.id, quantity: 12, unitSalesPrice: "72000" }, { description: "Cabling", businessUnitId: sub("IT Infrastructure", "Others").businessUnitId, subBusinessUnitId: sub("IT Infrastructure", "Others").id, oemId: oem("Dell").id, salesMethodId: L.salesMethods[0]!.id, quantity: 1, unitSalesPrice: "15000" }], deleteIds: [d.lines[1]!.id] }));
    expect(u.lines.map((l) => [l.lineNo, l.description.slice(0, 7), l.lineValue])).toEqual([[1, "Lenovo ", "864000"], [2, "Cabling", "15000"]]);
    expect(u.dealValue).toBe("879000");
    const h = expectOk(await rep.get<{ audit: { entityType: string; field: string | null; oldValue: string | null; newValue: string | null; action: string }[] }>(`/deals/${d.id}/history`));
    expect(h.audit.map((a) => [a.entityType, a.action, a.field, a.oldValue, a.newValue])).toEqual(expect.arrayContaining([["deal_line", "UPDATE", "quantity", "10", "12"], ["deal_line", "UPDATE", "unitSalesPrice", "70000", "72000"], ["deal_line", "DELETE", null, expect.stringMatching(/^Line 2/), null], ["deal", "UPDATE", "dealValue", "700000", "879000"]]));
    expect(h.audit.filter((a) => a.field === "annualRecurringValue")).toEqual([]); // unchanged values are not logged
    // own-IP lines never carry a sales method, whatever was sent
    const v = expectOk(await rep.patch<Deal & { lines: (Line & { salesMethodId: string | null })[] }>(`/deals/${d.id}/lines`, { version: u.version, upserts: [{ productId: noc.id, salesMethodId: L.salesMethods[0]!.id }] }));
    expect(v.lines[2]!.salesMethodId).toBeNull();
    expect(v.lines[2]!.oem.isOwnIp).toBe(true);
  });

  it("list filters by BU, OEM, stage and search, with totals for sales roles", async () => {
    const d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Filterable"), accountId, expectedCloseDate: isoDate(20), lines: [{ productId: laptop.id, quantity: 2, unitSalesPrice: "70000" }] }));
    const byOem = expectOk(await rep.get<{ rows: Deal[]; totals: { dealValue: string } | null }>(`/deals?oem=${laptop.oemId}&q=${encodeURIComponent(d.name)}`));
    expect(byOem.rows.map((r) => r.id)).toEqual([d.id]);
    expect(Number(byOem.totals?.dealValue)).toBe(140000);
    expect(expectOk(await rep.get<{ rows: Deal[] }>(`/deals?oem=${oem("Cisco").id}&q=${encodeURIComponent(d.name)}`)).rows).toEqual([]);
    expect(expectOk(await rep.get<{ rows: Deal[] }>(`/deals?bu=${laptop.businessUnitId}&stage=QUALIFIED&q=${encodeURIComponent(d.name)}`)).rows.length).toBe(1);
    expect(expectOk(await rep.get<{ rows: Deal[] }>(`/deals?stage[]=CLOSED_WON&stage[]=HOLD&q=${encodeURIComponent(d.name)}`)).rows).toEqual([]);
    expectError(await rep.get("/deals?stage=NOPE"), 400);
  });

  it("delete needs a manager in scope; an admin restores; a rep can't change the owner but the head can", async () => {
    const d = expectOk(await rep.post<Deal>("/deals", { name: uniq("Deletable deal"), accountId, expectedCloseDate: isoDate(20) }));
    expectError(await rep.del(`/deals/${d.id}`), 403);
    expectError(await (await as("regionalHead")).del(`/deals/${d.id}`), 404);
    const head = await as("salesHead");
    expectOk(await head.del(`/deals/${d.id}`));
    expectError(await rep.get(`/deals/${d.id}`), 404);
    const admin = await as("admin");
    expectOk(await admin.post(`/deals/${d.id}/restore`));
    expectOk(await rep.get(`/deals/${d.id}`));
    const users = expectOk(await rep.get<{ rows: { id: string; email: string; role: string }[] }>("/users")).rows;
    const naresh = users.find((u) => u.email === "naresh.kumar@progression.com")!;
    const presales = users.find((u) => u.email === "rakesh.yadav@progression.com")!;
    expectError(await rep.post(`/deals/${d.id}/reassign`, { ownerId: naresh.id }), 403);
    expectError(await head.post(`/deals/${d.id}/reassign`, { presalesOwnerId: naresh.id }), 400);
    const r = expectOk(await head.post<Deal>(`/deals/${d.id}/reassign`, { ownerId: naresh.id, presalesOwnerId: presales.id }));
    expect(r.owner.id).toBe(naresh.id);
    expectError(await rep.get(`/deals/${d.id}`), 404); // no longer Rakesh's
    expectOk(await (await as("rep2")).get(`/deals/${d.id}`));
    // the presales owner now sees it, technical side only
    const p = expectOk(await (await as("presales")).get<Deal>(`/deals/${d.id}`));
    expect(p).not.toHaveProperty("dealValue");
    expect(p).not.toHaveProperty("forecastCategory");
    expect(p.moves).toEqual([]);
  });
});
