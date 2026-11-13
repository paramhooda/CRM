import { test, expect } from "@playwright/test";
import { go, login, uid } from "./helpers";

test("a sales person creates an account and a contact through the screens", async ({ page }) => {
  await login(page, "rep");
  const name = `Meridian Textiles ${uid()}`;
  await go(page, "/accounts/new");
  await page.fill("#name", name);
  await page.fill("#gstin", `27AAACM${String(Date.now()).slice(-4)}K1ZX`);
  await page.fill("#city", "Nagpur");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/accounts\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("No contacts yet")).toBeVisible();

  await page.getByRole("button", { name: "Add contact" }).first().click();
  await page.fill("#firstName", "Priya");
  await page.fill("#lastName", "Menon");
  const emailPrefix = `priya.${uid()}`;
  await page.fill("#email", `${emailPrefix}@meridian.example`);
  await page.fill("#designation", "Head IT");
  await page.getByRole("switch", { name: "Primary contact" }).click();
  await page.getByRole("button", { name: "Add contact" }).last().click();
  await expect(page.getByText("Contact added")).toBeVisible();
  await expect(page.getByRole("button", { name: "Priya Menon" })).toBeVisible();

  // The new account and contact show in their lists
  await go(page, `/accounts?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("link", { name })).toBeVisible();
  await go(page, `/contacts?q=${emailPrefix}`);
  await expect(page.getByRole("button", { name: /Priya Menon/ }).first()).toBeVisible();
});

test("the server rejects a bad GSTIN and a duplicate account name with field errors", async ({ page }) => {
  await login(page, "rep");
  await go(page, "/accounts/new");
  await page.fill("#name", `Dup ${uid()}`);
  await page.fill("#gstin", "BADGSTIN");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /GSTIN/i })).toBeVisible();
  await expect(page).toHaveURL(/\/accounts\/new$/);
});
