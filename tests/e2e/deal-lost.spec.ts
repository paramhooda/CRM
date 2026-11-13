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

  await page.getByRole("button", { name: "Resume in Qualified" }).click();
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

test("a deal is dropped with a reason and only a manager can reopen it", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  const deal = await createDeal(rep.page);
  await go(rep.page, `/deals/${deal.id}`);
  await rep.page.getByRole("button", { name: "More", exact: true }).click();
  await rep.page.getByRole("menuitem", { name: "Drop" }).click();
  await pickSelect(rep.page, "Reason", /Customer dropped|No decision/);
  await rep.page.getByRole("dialog").getByRole("button", { name: "Drop" }).click();
  await expect(rep.page.getByText("Dropped", { exact: true }).first()).toBeVisible();
  await rep.page.getByRole("button", { name: "More", exact: true }).click();
  await expect(rep.page.getByRole("menuitem", { name: /Reopen/ })).toHaveAttribute("aria-disabled", "true");
  await expect(rep.page.getByText("Only a manager can reopen a closed deal.")).toBeVisible();
  await rep.page.keyboard.press("Escape");
  await rep.context.close();

  const head = await signedIn(browser, "salesHead");
  await go(head.page, `/deals/${deal.id}`);
  await head.page.getByRole("button", { name: "More", exact: true }).click();
  await head.page.getByRole("menuitem", { name: /Reopen in Qualified/ }).click();
  await head.page.fill("#mv-reason", "Customer came back with budget");
  await head.page.getByRole("dialog").getByRole("button", { name: /Reopen in Qualified/ }).click();
  await expect(head.page.getByText("Qualified", { exact: true }).first()).toBeVisible();
  await head.context.close();
});
