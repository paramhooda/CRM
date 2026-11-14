import { test, expect } from "@playwright/test";
import { go, createDeal, login, pickSelect, signedIn } from "./helpers";

test("a deal goes on hold, resumes, and closes as lost with a reason", async ({ page }) => {
  await login(page, "rep");
  const deal = await createDeal(page);
  await go(page, `/deals/${deal.id}`);

  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Put on hold" }).click();
  await page.fill("#mv-reason", "Budget frozen until next quarter");
  await page.getByRole("dialog").getByRole("button", { name: "Put on hold" }).click();
  await expect(page.getByText("Hold", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Budget frozen until next quarter")).toBeVisible();

  // The panel says so too, and support roles would see "sales to resume the deal"
  await expect(page.locator("[data-slot=next-headline]")).toHaveText("Your next step: resume the deal");
  await page.getByRole("region", { name: "What's next" }).getByRole("button", { name: "Resume in Qualified" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Resume in Qualified" }).click();
  await expect(page.getByText("Moved to Qualified")).toBeVisible();

  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Close as lost" }).click();
  // The reason is required
  await page.getByRole("dialog").getByRole("button", { name: "Close as lost" }).click();
  await expect(page.getByText("Pick a reason.")).toBeVisible();
  await pickSelect(page, "Reason", "Price");
  await page.fill("#mv-notes", "Competitor undercut by 8%");
  await page.getByRole("dialog").getByRole("button", { name: "Close as lost" }).click();
  await expect(page.getByText("Closed-Lost", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Price · Competitor undercut by 8%")).toBeVisible();
  // Lost is recorded in the stage history and in the audit trail
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.locator("section[aria-label='Stage history']").getByText("Closed-Lost", { exact: true }).first()).toBeVisible();
  await expect(page.locator("section[aria-label='Changes']").getByText("Loss reason").first()).toBeVisible();
});

test("a deal is dropped with a reason; the owner reopens it, another rep never sees it", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  const deal = await createDeal(rep.page);
  await go(rep.page, `/deals/${deal.id}`);
  await rep.page.getByRole("button", { name: "More", exact: true }).click();
  await rep.page.getByRole("menuitem", { name: "Drop" }).click();
  await pickSelect(rep.page, "Reason", /Customer dropped|No decision/);
  await rep.page.getByRole("dialog").getByRole("button", { name: "Drop" }).click();
  await expect(rep.page.getByText("Dropped", { exact: true }).first()).toBeVisible();
  const other = await signedIn(browser, "rep2");
  await go(other.page, `/deals/${deal.id}`);
  await expect(other.page.getByText("Nothing here")).toBeVisible();
  await other.context.close();

  await rep.page.getByRole("button", { name: "More", exact: true }).click();
  await rep.page.getByRole("menuitem", { name: /Reopen in Qualified/ }).click();
  await rep.page.fill("#mv-reason", "Customer came back with budget");
  await rep.page.getByRole("dialog").getByRole("button", { name: /Reopen in Qualified/ }).click();
  await expect(rep.page.getByText("Qualified", { exact: true }).first()).toBeVisible();
  await rep.context.close();
});
