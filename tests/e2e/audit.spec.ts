import { test, expect } from "@playwright/test";
import { go, createDeal, login, pickSelect, uid } from "./helpers";

test("editing a deal's name, forecast and a line price shows old and new values in the history", async ({ page }) => {
  await login(page, "rep");
  const deal = await createDeal(page, { name: `Audit deal ${uid()}` });
  const newName = `${deal.name} renamed`;

  await go(page, `/deals/${deal.id}/edit`);
  await page.fill("#name", newName);
  await pickSelect(page, "Forecast", "Commit");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Deal saved")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/deals/${deal.id}$`));

  await go(page, `/deals/${deal.id}?tab=lines`);
  await page.getByRole("button", { name: "Edit line 1" }).click();
  await page.fill("#line-unitSalesPrice", "550000");
  await page.getByRole("button", { name: "Save line" }).click();
  await expect(page.getByText("Line saved")).toBeVisible();
  await expect(page.getByText("Value ₹11 L")).toBeVisible();

  await page.getByRole("tab", { name: "History" }).click();
  const changes = page.locator("section[aria-label='Changes']");
  const row = (field: string) => changes.getByRole("row").filter({ hasText: field });
  await expect(row("Name").first()).toContainText(deal.name);
  await expect(row("Name").first()).toContainText(newName);
  await expect(row("Forecast").first()).toContainText("PIPELINE");
  await expect(row("Forecast").first()).toContainText("COMMIT");
  await expect(row("Unit sales price").first()).toContainText("500000");
  await expect(row("Unit sales price").first()).toContainText("550000");
  await expect(row("Deal value").first()).toContainText("1000000");
  await expect(row("Deal value").first()).toContainText("1100000");
  await expect(row("Expected GM %").first()).toBeVisible();

  // The admin audit log shows the same change
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, "admin");
  await go(page, "/admin/audit?entity_type=deal");
  await expect(page.getByRole("row").filter({ hasText: "Deal value" }).first()).toContainText("1100000");
});

test("a stale save is refused when someone else changed the deal first", async ({ page }) => {
  await login(page, "rep");
  const deal = await createDeal(page);
  await go(page, `/deals/${deal.id}/edit`);
  // Someone else (the same person in another tab, here via the API) changes the deal meanwhile
  await page.request.fetch(`/api/v1/deals/${deal.id}`, { method: "PATCH", headers: { "x-requested-with": "fetch", "content-type": "application/json" }, data: JSON.stringify({ version: deal.version, nextStep: "Call the CIO" }) });
  await page.fill("#name", `${deal.name} again`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Someone else changed/ })).toBeVisible();
});
