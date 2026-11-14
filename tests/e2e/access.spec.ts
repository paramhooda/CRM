import { test, expect } from "@playwright/test";
import { go, api, createDeal, isoDay, lookups, signedIn, status, pdf } from "./helpers";

test("a sales person cannot see or change another rep's deal through the screens or the API", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  const deal = await createDeal(rep.page);
  await rep.context.close();

  const other = await signedIn(browser, "rep2");
  await go(other.page, `/deals?q=${deal.code}`);
  await expect(other.page.getByText("No deals match")).toBeVisible();
  await go(other.page, `/deals/${deal.id}`);
  await expect(other.page.getByText("Nothing here")).toBeVisible();
  await go(other.page, `/deals/${deal.id}/edit`);
  await expect(other.page.getByText("Nothing here")).toBeVisible();
  expect(await status(other.page, "GET", `/deals/${deal.id}`)).toBe(404);
  expect(await status(other.page, "PATCH", `/deals/${deal.id}`, { version: 1, name: "Hijacked deal name" })).toBe(404);
  expect(await status(other.page, "POST", `/deals/${deal.id}/stage`, { action: "HOLD", version: 1, reason: "nope" })).toBe(404);
  expect([403, 404]).toContain(await status(other.page, "DELETE", `/deals/${deal.id}`)); // deleting is a manager permission, and the deal is out of scope anyway
  // Nor the account behind it
  expect(await status(other.page, "GET", `/accounts/${deal.accountId}`)).toBe(404);
  await other.context.close();

  // The manager of both can
  const head = await signedIn(browser, "salesHead");
  await go(head.page, `/deals/${deal.id}`);
  await expect(head.page.getByRole("heading", { name: new RegExp(deal.name) })).toBeVisible();
  await head.context.close();
});

test("a regional head sees only their own team", async ({ browser }) => {
  const rep = await signedIn(browser, "rep"); // reports to Vivek, not Anita
  const deal = await createDeal(rep.page);
  await rep.context.close();
  const anita = await signedIn(browser, "regionalHead");
  expect(await status(anita.page, "GET", `/deals/${deal.id}`)).toBe(404);
  await go(anita.page, `/deals/${deal.id}`);
  await expect(anita.page.getByText("Nothing here")).toBeVisible();
  await anita.context.close();
});

test("presales and purchase see only their assigned deals, never prices, and never the customer PO", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  const L = await lookups(rep.page);
  const assigned = await createDeal(rep.page, { needsPresales: true });
  const unassigned = await createDeal(rep.page);
  const presalesUser = (await api<{ rows: { id: string; email: string }[] }>(rep.page, "GET", "/users")).rows.find((u) => u.email === "rakesh.yadav@progression.com")!;
  const buyer = (await api<{ rows: { id: string; email: string }[] }>(rep.page, "GET", "/users")).rows.find((u) => u.email === "meera.iyer@progression.com")!;
  const po = L.documentKinds.find((k) => k.name === "Customer PO")!;
  const proposal = L.documentKinds.find((k) => k.name === "Solution document")!;
  const rfp = L.documentKinds.find((k) => k.name === "Customer RFP")!;
  const upload = async (kindId: string, name: string) => {
    const res = await rep.page.request.post(`/api/v1/deals/${assigned.id}/documents`, { headers: { "x-requested-with": "fetch" }, multipart: { documentKindId: kindId, file: pdf(name) } });
    expect(res.status()).toBe(200);
    return (await res.json()).data as { id: string };
  };
  // Purchase is asked while the deal is still sales'; presales comes in through the hand-over, which needs the requirement on file
  await api(rep.page, "POST", `/deals/${assigned.id}/pricing-requests`, { assignedToId: buyer.id, dueDate: isoDay(7), notes: "Best price" });
  await upload(rfp.id, "rfp.pdf");
  const fresh = await api<{ version: number }>(rep.page, "GET", `/deals/${assigned.id}`);
  await api(rep.page, "POST", `/deals/${assigned.id}/stage`, { version: fresh.version, action: "ADVANCE", presalesAssigneeId: presalesUser.id, presalesDueDate: isoDay(7), presalesScope: "Size the BOQ" });
  const poDoc = await upload(po.id, "po.pdf");
  const solDoc = await upload(proposal.id, "solution.pdf");
  await rep.context.close();

  for (const key of ["presales", "purchase"] as const) {
    const s = await signedIn(browser, key);
    // Only the assigned deal
    await go(s.page, "/deals");
    await expect(s.page.getByRole("link", { name: assigned.name })).toBeVisible();
    await expect(s.page.getByRole("link", { name: unassigned.name })).toHaveCount(0);
    expect(await status(s.page, "GET", `/deals/${unassigned.id}`)).toBe(404);
    // No sales-side fields anywhere
    const view = await api<Record<string, unknown> & { lines: Record<string, unknown>[]; documents: { id: string }[] }>(s.page, "GET", `/deals/${assigned.id}`);
    for (const f of ["dealValue", "expectedGmPct", "forecastCategory", "approvals"]) expect(view, f).not.toHaveProperty(f);
    for (const f of ["unitSalesPrice", "lineValue", "expectedGmPct"]) expect(view.lines[0], f).not.toHaveProperty(f);
    await go(s.page, `/deals/${assigned.id}?tab=lines`);
    await expect(s.page.locator("table thead tr").first()).not.toContainText("Sales price");
    await expect(s.page.getByText("Expected GM")).toHaveCount(0);
    // The customer PO is sales-only; the solution document is not
    expect(view.documents.map((d) => d.id)).not.toContain(poDoc.id);
    expect(view.documents.map((d) => d.id)).toContain(solDoc.id);
    expect((await s.page.request.get(`/api/v1/documents/${poDoc.id}/download`)).status()).toBe(404);
    expect((await s.page.request.get(`/api/v1/documents/${solDoc.id}/download`)).status()).toBe(200);
    // Sales-only screens and exports are refused
    const exp = await s.page.request.get("/api/v1/exports/deals");
    expect(exp.status()).toBe(200);
    expect((await exp.text()).split("\n")[0]).not.toMatch(/value|GM|Forecast/i);
    expect(await status(s.page, "GET", "/metrics/home")).toBe(403);
    expect(await status(s.page, "POST", `/deals/${assigned.id}/stage`, { action: "HOLD", version: 1, reason: "no" })).toBe(403);
    await s.context.close();
  }
});

test("every write needs the request header, so a plain form post from another site is refused", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  const res = await rep.page.request.post("/api/v1/accounts", { headers: { "content-type": "application/json" }, data: JSON.stringify({ name: "Forged account" }) });
  expect(res.status()).toBe(403);
  await rep.context.close();
});
