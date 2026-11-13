import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { api, login, type UserKey } from "./helpers";

// Every main screen per role, saved under docs/screenshots for the look-and-feel check.
const OUT = path.resolve("docs/screenshots");
fs.mkdirSync(OUT, { recursive: true });

async function shoot(page: Page, role: string, screen: string, url: string, opts: { full?: boolean } = {}) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  await page.screenshot({ path: path.join(OUT, `${role}--${screen}.png`), fullPage: opts.full ?? false });
}

type Deal = { id: string; stage: string };
async function dealIn(page: Page, stage: string, extra = ""): Promise<Deal | undefined> {
  const r = await api<{ rows: Deal[] }>(page, "GET", `/deals?stage=${stage}&pageSize=1${extra}`);
  return r.rows[0];
}

test("login", async ({ page }) => {
  await page.goto("/login");
  await page.screenshot({ path: path.join(OUT, "login.png") });
});

test("sales head", async ({ page }) => {
  await login(page, "salesHead");
  await shoot(page, "sales-head", "home", "/home", { full: true });
  await shoot(page, "sales-head", "deals", "/deals");
  await shoot(page, "sales-head", "deals-board", "/deals?view=kanban");
  const neg = await dealIn(page, "NEGOTIATION");
  const boq = await dealIn(page, "BOQ");
  const won = await dealIn(page, "CLOSED_WON");
  if (neg) {
    await shoot(page, "sales-head", "deal-negotiation", `/deals/${neg.id}`, { full: true });
    await shoot(page, "sales-head", "deal-lines", `/deals/${neg.id}?tab=lines`);
    await shoot(page, "sales-head", "deal-history", `/deals/${neg.id}?tab=history`);
  }
  if (boq) await shoot(page, "sales-head", "deal-boq", `/deals/${boq.id}`, { full: true });
  if (won) await shoot(page, "sales-head", "deal-won", `/deals/${won.id}`);
  await shoot(page, "sales-head", "deal-new", "/deals/new");
  await shoot(page, "sales-head", "accounts", "/accounts");
  const acc = (await api<{ rows: { id: string }[] }>(page, "GET", "/accounts?pageSize=1")).rows[0];
  if (acc) await shoot(page, "sales-head", "account", `/accounts/${acc.id}`);
  await shoot(page, "sales-head", "contacts", "/contacts");
  await shoot(page, "sales-head", "leads", "/leads");
  const lead = (await api<{ rows: { id: string }[] }>(page, "GET", "/leads?pageSize=1")).rows[0];
  if (lead) await shoot(page, "sales-head", "lead", `/leads/${lead.id}`);
  await shoot(page, "sales-head", "approvals", "/approvals");
  await shoot(page, "sales-head", "pipeline-review", "/reviews?since=30d");
  await shoot(page, "sales-head", "targets", "/admin/targets");
  await shoot(page, "sales-head", "account-settings", "/account");
});

test("sales person", async ({ page }) => {
  await login(page, "rep");
  await shoot(page, "sales", "home", "/home", { full: true });
  await shoot(page, "sales", "deals", "/deals");
  const d = await dealIn(page, "QUALIFIED");
  if (d) await shoot(page, "sales", "deal", `/deals/${d.id}`, { full: true });
  await shoot(page, "sales", "my-accounts", "/accounts");
});

for (const [key, role] of [["presales", "presales"], ["purchase", "purchase"]] as [UserKey, string][]) {
  test(role, async ({ page }) => {
    await login(page, key);
    await shoot(page, role, "my-work", "/my-work");
    await shoot(page, role, "deals", "/deals");
    const d = (await api<{ rows: Deal[] }>(page, "GET", "/deals?pageSize=1&open=true")).rows[0];
    if (d) {
      await shoot(page, role, "deal", `/deals/${d.id}`, { full: true });
      await shoot(page, role, "deal-lines", `/deals/${d.id}?tab=lines`);
    }
  });
}

test("admin", async ({ page }) => {
  await login(page, "admin");
  await shoot(page, "admin", "users", "/admin/users");
  await shoot(page, "admin", "master-data", "/admin/lookups");
  await shoot(page, "admin", "master-data-oems", "/admin/lookups/oems");
  await shoot(page, "admin", "products", "/admin/products");
  await shoot(page, "admin", "approval-rules", "/admin/approval-rules");
  await shoot(page, "admin", "targets", "/admin/targets");
  await shoot(page, "admin", "audit-log", "/admin/audit");
});

test("dark mode and a narrow screen", async ({ page }) => {
  await login(page, "salesHead");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/deals", { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "sales-head--deals-phone.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/home", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "sales-head--home-dark.png") });
  await page.goto("/deals", { waitUntil: "networkidle" });
  const d = await dealIn(page, "NEGOTIATION");
  if (d) await page.goto(`/deals/${d.id}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "sales-head--deal-dark.png") });
});
