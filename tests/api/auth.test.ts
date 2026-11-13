import { describe, expect, it } from "vitest";
import { Client, PASSWORD, USERS, anon, as, expectError, expectOk } from "./helpers";

describe("auth", () => {
  it("health is public", async () => {
    const r = await anon().get("/health");
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ status: "ok", db: "up" });
  });

  it("signs in with the right password, rejects the wrong one, and the session identifies the user", async () => {
    const c = new Client();
    expectError(await c.post("/auth/login", { email: USERS.rep, password: "nope-nope-1" }), 401, "BAD_CREDENTIALS");
    expectError(await c.post("/auth/login", { email: "not-an-email", password: "x" }), 400, "VALIDATION");
    const login = expectOk(await c.post<{ ok: boolean }>("/auth/login", { email: USERS.rep.toUpperCase(), password: PASSWORD }));
    expect(login.ok).toBe(true);
    expect(c.cookie).toMatch(/^crm_session=/);
    const me = expectOk(await c.get<{ email: string; role: string }>("/auth/me"));
    expect(me).toMatchObject({ email: USERS.rep, role: "SALES" });
  });

  it("anonymous calls are refused and writes need the request header", async () => {
    expectError(await anon().get("/auth/me"), 401, "UNAUTHORIZED");
    const c = await as("rep");
    expectError(await c.post("/auth/logout", undefined, { csrf: false }), 403, "FORBIDDEN");
  });

  it("logout ends the session", async () => {
    const c = new Client();
    expectOk(await c.post("/auth/login", { email: USERS.rep2, password: PASSWORD }));
    const cookie = c.cookie;
    expectOk(await c.post("/auth/logout"));
    c.cookie = cookie; // reuse the old cookie: the session is revoked server-side
    expectError(await c.get("/auth/me"), 401);
  });

  it("ten wrong passwords lock the account for a while; an admin can unlock it", async () => {
    const c = new Client();
    const email = USERS.purchase2;
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await c.post("/auth/login", { email, password: `wrong-${i}-aaaaa` })).status;
    expect(last).toBe(423);
    expectError(await c.post("/auth/login", { email, password: PASSWORD }), 423, "LOCKED");
    const admin = await as("admin");
    const users = expectOk(await admin.get<{ rows: { id: string; email: string }[] }>("/users?includeInactive=true"));
    const target = users.rows.find((u) => u.email === email)!;
    expectOk(await admin.post(`/admin/users/${target.id}/unlock`));
    expectOk(await c.post("/auth/login", { email, password: PASSWORD }));
  });

  it("change password: needs the current one, enforces the rule, keeps this session and drops others", async () => {
    const a = new Client();
    expectOk(await a.post("/auth/login", { email: USERS.presales2, password: PASSWORD }));
    const b = new Client();
    expectOk(await b.post("/auth/login", { email: USERS.presales2, password: PASSWORD }));
    expectError(await a.post("/auth/change-password", { currentPassword: "wrong-wrong-1", newPassword: "Another-Pass-22" }), 400);
    expectError(await a.post("/auth/change-password", { currentPassword: PASSWORD, newPassword: "short1" }), 400);
    expectOk(await a.post("/auth/change-password", { currentPassword: PASSWORD, newPassword: "Another-Pass-22" }));
    expectOk(await a.get("/auth/me"));
    expectError(await b.get("/auth/me"), 401);
    // put it back for the other tests
    expectOk(await a.post("/auth/change-password", { currentPassword: "Another-Pass-22", newPassword: PASSWORD }));
  });
});
