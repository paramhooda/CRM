import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const PASSWORD = "Progression@123";
export const USERS = {
  admin: { email: "admin@progression.com", name: "System Administrator", home: "/home" },
  salesHead: { email: "vivek.malhotra@progression.com", name: "Vivek Malhotra", home: "/home" },
  regionalHead: { email: "anita.deshmukh@progression.com", name: "Anita Deshmukh", home: "/home" },
  rep: { email: "rakesh.pawar@progression.com", name: "Rakesh Pawar", home: "/home" },
  rep2: { email: "naresh.kumar@progression.com", name: "Naresh Kumar", home: "/home" },
  presales: { email: "rakesh.yadav@progression.com", name: "Rakesh Yadav", home: "/my-work" },
  purchase: { email: "meera.iyer@progression.com", name: "Meera Iyer", home: "/my-work" },
} as const;
export type UserKey = keyof typeof USERS;

/** A short unique suffix so repeated runs never collide on unique names. */
export const uid = () => `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Navigates and waits for the page to settle so typing lands after hydration. */
export const go = (page: Page, url: string) => page.goto(url, { waitUntil: "networkidle" });

export async function login(page: Page, key: UserKey) {
  await go(page, "/login");
  await page.fill("#email", USERS[key].email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A fresh browser context signed in as the person: tests mix roles without sharing cookies. */
export async function signedIn(browser: Browser, key: UserKey): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, key);
  return { context, page };
}

type Json = Record<string, unknown>;

/** Calls the API with the page's session (for fixtures the test is not about). Fails loudly on a non-2xx. */
export async function api<T = Json>(page: Page, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown, opts: { expect?: number } = {}): Promise<T> {
  const res = await page.request.fetch(`/api/v1${path}`, { method, headers: { "x-requested-with": "fetch", ...(body !== undefined ? { "content-type": "application/json" } : {}) }, data: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as { data?: T; error?: { message: string } }) : {};
  if (opts.expect !== undefined) {
    expect(res.status(), `${method} ${path}: ${text.slice(0, 200)}`).toBe(opts.expect);
    return (json.data ?? json) as T;
  }
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${text.slice(0, 300)}`);
  return json.data as T;
}

export async function status(page: Page, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<number> {
  const res = await page.request.fetch(`/api/v1${path}`, { method, headers: { "x-requested-with": "fetch", ...(body !== undefined ? { "content-type": "application/json" } : {}) }, data: body !== undefined ? JSON.stringify(body) : undefined });
  return res.status();
}

export type Lookups = { businessUnits: { id: string; name: string }[]; subBusinessUnits: { id: string; name: string; businessUnitId: string }[]; oems: { id: string; name: string; isOwnIp: boolean }[]; lossReasons: { id: string; name: string; appliesTo: string }[]; documentKinds: { id: string; name: string; requiredAtWon: boolean; restrictedToSales: boolean }[]; leadSources: { id: string; name: string }[] };
export const lookups = (page: Page) => api<Lookups>(page, "GET", "/lookups");

export async function createAccount(page: Page, name = `Acme ${uid()}`) {
  const a = await api<{ id: string; name: string; code: string }>(page, "POST", "/accounts", { name, city: "Pune", state: "Maharashtra" });
  const c = await api<{ id: string }>(page, "POST", "/contacts", { accountId: a.id, firstName: "Test", lastName: "Contact", email: `${uid()}@example.com`, designation: "CIO", isPrimary: true });
  return { ...a, contactId: c.id };
}

/** A yyyy-mm-dd some days from now, on the business day in India (the app counts "today" in IST). */
export const isoDay = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10);

/** A deal with one third-party line (priced) owned by the signed-in rep; add `needsPresales` for the BOQ path. */
export async function createDeal(page: Page, opts: { name?: string; needsPresales?: boolean; lines?: Json[]; accountId?: string; contactId?: string } = {}) {
  const L = await lookups(page);
  const acc = opts.accountId ? { id: opts.accountId, contactId: opts.contactId! } : await createAccount(page);
  const bu = L.businessUnits.find((b) => b.name === "IT Infrastructure")!;
  const sub = L.subBusinessUnits.find((s) => s.businessUnitId === bu.id && s.name === "Server")!;
  const oem = L.oems.find((o) => o.name === "Dell")!;
  const lines = opts.lines ?? [{ description: "Rack server", businessUnitId: bu.id, subBusinessUnitId: sub.id, oemId: oem.id, quantity: "2", unit: "Nos", revenueModel: "ONE_TIME", unitSalesPrice: "500000", unitPurchaseCost: "400000" }];
  const deal = await api<{ id: string; code: string; name: string; version: number; stage: string }>(page, "POST", "/deals", { name: opts.name ?? `Deal ${uid()}`, accountId: acc.id, primaryContactId: acc.contactId, expectedCloseDate: isoDay(60), forecastCategory: "PIPELINE", needsPresales: opts.needsPresales ?? false, lines });
  return { ...deal, accountId: acc.id, contactId: acc.contactId };
}

/** Picks a value in a shadcn Select by its label text. */
export async function pickSelect(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}

/** Picks a value in the searchable Combobox: opens it, types, chooses the option. */
export async function pickCombobox(page: Page, trigger: ReturnType<Page["locator"]>, query: string, option: string | RegExp) {
  await trigger.click();
  await page.locator("[cmdk-input]").fill(query);
  await page.getByRole("option", { name: option }).first().click();
}

export const pdf = (name = "po.pdf") => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF") });
