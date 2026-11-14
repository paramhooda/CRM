import { describe, expect, it } from "vitest";
import { as, expectError, expectOk, uniq } from "./helpers";

type Lookups = { businessUnits: { id: string; name: string }[]; subBusinessUnits: { id: string; name: string; businessUnitId: string }[]; oems: { id: string; name: string; isOwnIp: boolean }[]; stages: { key: string }[]; forecasts: { key: string }[] };

describe("lookups", () => {
  it("everyone signed in gets the active lookups and stage meta", async () => {
    const c = await as("purchase");
    const l = expectOk(await c.get<Lookups>("/lookups"));
    expect(l.businessUnits.map((b) => b.name)).toEqual(["IT Infrastructure", "Cloud", "Services", "Cybersecurity"]);
    expect(l.oems.filter((o) => o.isOwnIp).map((o) => o.name)).toEqual(["Progression", "Neon Cloud"]);
    expect(l.stages.map((s) => s.key)).toContain("PROPOSAL_SUBMITTED");
    expect(l.stages.map((s) => s.key)).not.toContain("IDENTIFIED");
    expect(l.forecasts.map((f) => f.key)).toEqual(["COMMIT", "UPSIDE", "PIPELINE"]);
  });

  it("only an admin edits master data; a new OEM appears in the lookups, a deactivated one disappears", async () => {
    const rep = await as("rep");
    expectError(await rep.post("/admin/lookups/oems", { name: uniq("Palo Alto") }), 403);
    expectError(await rep.get("/admin/lookups/oems"), 403);
    const admin = await as("admin");
    expectError(await admin.get("/admin/lookups/nope"), 404);
    const name = uniq("Palo Alto");
    const created = expectOk(await admin.post<{ id: string; name: string; isOwnIp: boolean }>("/admin/lookups/oems", { name, isOwnIp: false }));
    expect(created.isOwnIp).toBe(false);
    expectError(await admin.post("/admin/lookups/oems", { name }), 409, "DUPLICATE");
    expectError(await admin.post("/admin/lookups/oems", { name: "" }), 400, "VALIDATION");
    let l = expectOk(await (await as("rep")).get<Lookups>("/lookups"));
    expect(l.oems.some((o) => o.id === created.id)).toBe(true);
    expectOk(await admin.patch(`/admin/lookups/oems/${created.id}`, { isActive: false }));
    l = expectOk(await rep.get<Lookups>("/lookups"));
    expect(l.oems.some((o) => o.id === created.id)).toBe(false);
    const all = expectOk(await admin.get<{ rows: { id: string }[] }>("/admin/lookups/oems?includeInactive=true"));
    expect(all.rows.some((o) => o.id === created.id)).toBe(true);
  });

  it("a Sub BU needs a real business unit", async () => {
    const admin = await as("admin");
    const l = expectOk(await admin.get<Lookups>("/lookups"));
    expectError(await admin.post("/admin/lookups/sub-business-units", { name: uniq("Edge"), businessUnitId: "00000000-0000-0000-0000-000000000000" }), 400);
    const row = expectOk(await admin.post<{ id: string; needsPresales: boolean }>("/admin/lookups/sub-business-units", { name: uniq("Edge"), businessUnitId: l.businessUnits[0]!.id, needsPresales: true }));
    expect(row.needsPresales).toBe(true);
    expectOk(await admin.patch(`/admin/lookups/sub-business-units/${row.id}`, { isActive: false }));
  });
});

describe("products", () => {
  it("the catalogue is readable by everyone; only an admin changes it; soft delete and restore", async () => {
    const presales = await as("presales");
    const list = expectOk(await presales.get<{ rows: { id: string; code: string; oemId: string; businessUnitId: string; subBusinessUnitId: string }[] }>("/products?q=rack"));
    expect(list.rows.length).toBeGreaterThan(0);
    expect(list.rows[0]!.code).toMatch(/^PRD-\d{4}$/);
    const sample = list.rows[0]!;
    expectError(await presales.post("/admin/products", { name: "x", businessUnitId: sample.businessUnitId, subBusinessUnitId: sample.subBusinessUnitId, oemId: sample.oemId }), 403);

    const admin = await as("admin");
    const name = uniq("Test switch");
    const created = expectOk(await admin.post<{ id: string; code: string; listPrice: string | null }>("/admin/products", { name, businessUnitId: sample.businessUnitId, subBusinessUnitId: sample.subBusinessUnitId, oemId: sample.oemId, unit: "Nos", listPrice: 12345.5 }));
    expect(created.code).toMatch(/^PRD-\d{4}$/);
    expect(created.listPrice).toBe("12345.5");
    expectError(await admin.post("/admin/products", { name, businessUnitId: sample.businessUnitId, subBusinessUnitId: sample.subBusinessUnitId, oemId: sample.oemId }), 409);
    expectError(await admin.post("/admin/products", { name: uniq("ARR no term"), businessUnitId: sample.businessUnitId, subBusinessUnitId: sample.subBusinessUnitId, oemId: sample.oemId, revenueModel: "ARR", defaultTermMonths: null }), 400);

    const updated = expectOk(await admin.patch<{ name: string }>(`/admin/products/${created.id}`, { name: name + " v2" }));
    expect(updated.name).toBe(name + " v2");
    expectOk(await admin.del(`/admin/products/${created.id}`));
    expect(expectOk(await presales.get<{ rows: { id: string }[] }>(`/products?q=${encodeURIComponent(name)}`)).rows).toEqual([]);
    expect(expectOk(await admin.get<{ rows: { id: string }[] }>(`/products?q=${encodeURIComponent(name)}&includeDeleted=true`)).rows.map((r) => r.id)).toContain(created.id);
    expectOk(await admin.post(`/admin/products/${created.id}/restore`));
    expect(expectOk(await presales.get<{ rows: { id: string }[] }>(`/products?q=${encodeURIComponent(name)}`)).rows.map((r) => r.id)).toContain(created.id);
    expectOk(await admin.del(`/admin/products/${created.id}`));
  });
});

describe("users", () => {
  it("the directory is visible to all; creating, editing, resetting and deactivating is admin only", async () => {
    const rep = await as("rep");
    const dir = expectOk(await rep.get<{ rows: { id: string; email: string; role: string; lockedUntil?: unknown }[] }>("/users"));
    expect(dir.rows.length).toBeGreaterThan(20);
    expect(dir.rows[0]).not.toHaveProperty("lockedUntil");
    expectError(await rep.post("/admin/users", { fullName: "X Y", email: "x@progression.com", role: "SALES", temporaryPassword: "Temp-Pass-1234" }), 403);

    const admin = await as("admin");
    const head = dir.rows.find((u) => u.email === "vivek.malhotra@progression.com")!;
    const email = `${uniq("new.rep").replace(/\s+/g, ".").toLowerCase()}@progression.com`;
    expectError(await admin.post("/admin/users", { fullName: "New Rep", email, role: "SALES", managerId: head.id, temporaryPassword: "short" }), 400);
    const u = expectOk(await admin.post<{ id: string; email: string }>("/admin/users", { fullName: "New Rep", email, role: "SALES", managerId: head.id, temporaryPassword: "Temp-Pass-1234" }));
    expectError(await admin.post("/admin/users", { fullName: "New Rep", email, role: "SALES", temporaryPassword: "Temp-Pass-1234" }), 409, "DUPLICATE_EMAIL");
    expectError(await admin.patch(`/admin/users/${u.id}`, { managerId: u.id }), 400);
    expectError(await admin.patch(`/admin/users/${u.id}`, { managerId: dir.rows.find((x) => x.role === "SALES")!.id }), 400); // a rep can't be a manager
    expectOk(await admin.patch(`/admin/users/${u.id}`, { title: "Account Manager", role: "PRESALES" }));
    expectOk(await admin.post(`/admin/users/${u.id}/reset-password`, { temporaryPassword: "Another-Temp-99" }));
    expectOk(await admin.patch(`/admin/users/${u.id}`, { isActive: false }));
    const after = expectOk(await admin.get<{ rows: { id: string; isActive: boolean }[] }>("/users?includeInactive=true"));
    expect(after.rows.find((x) => x.id === u.id)?.isActive).toBe(false);
    expect(expectOk(await rep.get<{ rows: { id: string }[] }>("/users")).rows.some((x) => x.id === u.id)).toBe(false);
  });
});

describe("targets", () => {
  it("a rep reads their own target, a sales head sets their team's, nobody sets outside their team", async () => {
    const rep = await as("rep");
    const mine = expectOk(await rep.get<{ rows: { userId: string; quarter: number; targetValue: string }[] }>("/targets"));
    expect(mine.rows.length).toBe(4);
    const me = mine.rows[0]!.userId;
    expectError(await rep.put("/targets", { rows: [{ userId: me, fiscalYear: 2027, quarter: 1, targetValue: 1 }] }), 403);
    const west = await as("regionalHead");
    expectError(await west.put("/targets", { rows: [{ userId: me, fiscalYear: 2027, quarter: 1, targetValue: 1 }] }), 404); // Rakesh is not in Anita's team
    const westRows = expectOk(await west.get<{ rows: { userId: string }[] }>("/targets"));
    expect(westRows.rows.some((r) => r.userId === me)).toBe(false);
    const head = await as("salesHead");
    expectOk(await head.put("/targets", { rows: [{ userId: me, fiscalYear: 2027, quarter: 1, targetValue: "9999999.00" }] }));
    expect(expectOk(await rep.get<{ rows: { quarter: number; targetValue: string }[] }>("/targets?fiscal_year=2027")).rows.find((r) => r.quarter === 1)?.targetValue).toBe("9999999");
    expectError(await (await as("presales")).get("/targets"), 403);
  });

  it("settings are admin-only, secrets never come back, and alerts switch the review flags on", async () => {
    const admin = await as("admin");
    const head = await as("salesHead");
    expectError(await head.get("/admin/settings/alerts"), 403);
    expectError(await admin.get("/admin/settings/nonsense"), 404);
    const alerts = expectOk(await admin.get<Record<string, unknown>>("/admin/settings/alerts"));
    expect(alerts).toMatchObject({ gmAmberBelowPct: null, quietDays: null, stuck: false, closeDatePassed: false });
    expectError(await admin.put("/admin/settings/alerts", { gmAmberBelowPct: 150 }), 400);
    expect(expectOk(await admin.put<Record<string, unknown>>("/admin/settings/alerts", { gmAmberBelowPct: 12.5, quietDays: 30, closeDatePassed: true })).gmAmberBelowPct).toBe(12.5);
    // mail: the password is stored but never returned; no host means mail is off
    const mail = expectOk(await admin.put<Record<string, unknown>>("/admin/settings/mail", { host: "", port: 587, user: "x", password: "secret" }));
    expect(mail.passwordSet).toBe(true);
    expect(mail).not.toHaveProperty("password");
    expectError(await admin.post("/admin/settings/mail/test"), 409, "MAIL_OFF");
    expectError(await admin.post("/admin/settings/ai/test"), 404, "AI_OFF");
    const company = expectOk(await admin.put<Record<string, unknown>>("/admin/settings/company", { name: "Progression Infonet", gstin: "27AAACK4019X1Z2", city: "Pune" }));
    expect(company).toMatchObject({ name: "Progression Infonet", city: "Pune" });
    expectError(await admin.put("/admin/settings/company", { name: "X", gstin: "bad" }), 400);
    // back to the defaults so the rest of the suite sees alerts off
    expectOk(await admin.put("/admin/settings/alerts", { gmAmberBelowPct: null, quietDays: null, closeDatePassed: false }));
    expectOk(await admin.put("/admin/settings/mail", { host: "", user: "", password: "" }));
  });
});
