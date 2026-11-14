import { test, expect } from "@playwright/test";
import { go, login, pickSelect, uid } from "./helpers";

test("a lead is captured, worked and converted into an account, contact and deal", async ({ page }) => {
  await login(page, "rep");
  const company = `Horizon Foods ${uid()}`;
  await go(page, "/leads/new");
  await page.fill("#companyName", company);
  await page.fill("#contactName", "Anil Kapoor");
  await page.fill("#contactEmail", `anil.${uid()}@horizon.example`);
  await pickSelect(page, "Lead source", "Inbound");
  await pickSelect(page, "Business unit of interest", "Cloud");
  await page.fill("#estimatedValue", "2500000");
  await page.getByRole("button", { name: "Capture lead" }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]+$/);
  await expect(page.locator("main").getByText("New", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mark contacted" }).click();
  await expect(page.locator("main").getByText("Contacted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark qualified" }).click();
  await expect(page.locator("main").getByText("Qualified", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Convert to deal" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#accountName")).toHaveValue(company);
  await page.fill("#dealName", `${company} cloud migration`);
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect(page).toHaveURL(/\/deals\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: new RegExp(`${company} cloud migration`) })).toBeVisible();
  await expect(page.getByRole("link", { name: company }).first()).toBeVisible();
  await expect(page.getByText("Anil Kapoor").first()).toBeVisible();

  // A lead converts once
  await page.goBack();
  await expect(page.locator("main").getByText("Converted", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Convert to deal" })).toHaveCount(0);
});

test("disqualifying a lead needs a reason and keeps it on record", async ({ page }) => {
  await login(page, "rep");
  await go(page, "/leads/new");
  await page.fill("#companyName", `Dead End ${uid()}`);
  await page.fill("#contactName", "Nobody Home");
  await pickSelect(page, "Lead source", "Event");
  await page.getByRole("button", { name: "Capture lead" }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Disqualify" }).click();
  await page.getByRole("button", { name: "Disqualify" }).click();
  await expect(page.getByText(/Give a reason/)).toBeVisible();
  await page.fill("#reason", "No budget this year");
  await page.getByRole("button", { name: "Disqualify" }).click();
  await expect(page.getByText("Disqualified", { exact: true })).toBeVisible();
  await expect(page.getByText("Reason: No budget this year")).toBeVisible();
});
