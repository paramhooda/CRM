import { test, expect, type Page } from "@playwright/test";
import { go, login } from "./helpers";

/** Parses the CSV the export produces (BOM, CRLF, quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* CRLF */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0]);
}

export async function csv(page: Page, path: string) {
  const res = await page.request.get(path);
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const [header, ...body] = parseCsv(text);
  return { header: header!, body };
}

/** The app's ₹ L / Cr rounding, so a sum can be compared with what the screen shows. */
const inr = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`);

test("the manager's pipeline total and open-deal count match the records behind them", async ({ page }) => {
  await login(page, "salesHead");
  // Home tile
  await go(page, "/home");
  const tile = page.locator("section[aria-label='Numbers'] a", { hasText: "Open pipeline" });
  const tileValue = (await tile.locator("[data-slot=stat-value]").innerText()).trim();
  const tileCount = Number(/([\d,]+) deals/.exec(await tile.locator("[data-slot=stat-note]").innerText())![1]!.replace(/\D/g, ""));

  // Deals list, open deals only, shows the same total in its footer
  const OPEN = "stage=QUALIFIED&stage=BOQ&stage=PROPOSAL_SUBMITTED&stage=NEGOTIATION";
  await go(page, `/deals?${OPEN}&pageSize=10`);
  const footer = await page.getByText(/deals · ₹/).innerText();
  expect(footer).toContain(`${tileCount.toLocaleString("en-IN")} deals`);
  expect(footer).toContain(`${tileValue} total`);

  // The export of the same query sums to the same figure, row by row
  const { header, body } = await csv(page, `/api/v1/exports/deals?${OPEN}`);
  const vi = header.findIndex((h) => /^(deal )?value/i.test(h));
  expect(vi).toBeGreaterThan(-1);
  expect(body.length).toBe(tileCount);
  const sum = body.reduce((s, r) => s + Number(r[vi] || 0), 0);
  expect(inr(sum)).toBe(tileValue);
});

test("a filtered deals export matches the filtered table", async ({ page }) => {
  await login(page, "salesHead");
  await go(page, "/deals?stage=NEGOTIATION&pageSize=200");
  const total = Number((await page.getByText(/\d+ deals · ₹/).innerText()).split(" ")[0]);
  const names = await page.locator("table tbody").getByRole("link").allInnerTexts();
  const { header, body } = await csv(page, "/api/v1/exports/deals?stage=NEGOTIATION");
  expect(body.length).toBe(total);
  const ni = header.indexOf("Deal");
  const exported = new Set(body.map((r) => r[ni]));
  for (const n of names) expect(exported.has(n.split("\n")[0]!)).toBe(true);
  const si = header.indexOf("Stage");
  expect(body.every((r) => r[si] === "Negotiation")).toBe(true);
});

test("a filtered accounts export matches the screen", async ({ page }) => {
  await login(page, "rep");
  await go(page, "/accounts?q=Ltd&pageSize=200");
  const total = Number((await page.getByText(/\d+ records?/).innerText()).replace(/\D/g, ""));
  const names = (await page.locator("table tbody").getByRole("link").allInnerTexts()).map((n) => n.split("\n")[0]!.replace(/\s*\(deleted\)$/, ""));
  const { header, body } = await csv(page, "/api/v1/exports/accounts?q=Ltd");
  expect(body.length).toBe(total);
  const ni = header.indexOf("Account");
  expect(new Set(body.map((r) => r[ni]))).toEqual(new Set(names));
});

test("a sales head reviews the pipeline and marks it reviewed", async ({ page }) => {
  await login(page, "salesHead");
  await go(page, "/reviews?scope=team&since=14d");
  await expect(page.getByText("Deals in scope")).toBeVisible();
  await expect(page.locator("section[aria-label='People']").getByText(/deals · since/).first()).toBeVisible();
  const note = `Push proposals before quarter end (${Date.now()})`;
  await page.fill("#review-notes", note);
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText("Review recorded")).toBeVisible();
  await go(page, "/reviews/history");
  await expect(page.getByText(note)).toBeVisible();
});
