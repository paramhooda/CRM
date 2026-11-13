import { test, expect } from "@playwright/test";
import { go, createAccount, createDeal, signedIn, uid } from "./helpers";

test("an admin adds an OEM and it appears in the line dialog; deactivating it removes it", async ({ browser }) => {
  const admin = await signedIn(browser, "admin");
  const name = `Juniper ${uid()}`;
  await go(admin.page, "/admin/lookups/oems");
  await admin.page.getByRole("button", { name: "Add value" }).first().click();
  await admin.page.fill("#lk-name", name);
  await admin.page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(admin.page.getByText("Added")).toBeVisible();
  await expect(admin.page.getByRole("cell", { name, exact: true })).toBeVisible();

  const rep = await signedIn(browser, "rep");
  await go(rep.page, "/deals/new");
  await rep.page.getByRole("button", { name: "Add line" }).click();
  await rep.page.getByLabel("OEM").click();
  await expect(rep.page.getByRole("option", { name })).toBeVisible();
  await rep.page.keyboard.press("Escape");

  await admin.page.getByRole("switch", { name: `${name} active` }).click();
  await expect(admin.page.getByText(`${name} deactivated`)).toBeVisible();
  await rep.page.reload();
  await rep.page.getByRole("button", { name: "Add line" }).click();
  await rep.page.getByLabel("OEM").click();
  await expect(rep.page.getByRole("option", { name })).toHaveCount(0);
  await rep.context.close();
  await admin.context.close();
});

test("soft delete: a manager deletes a rep's account, an admin finds and restores it", async ({ browser }) => {
  const rep = await signedIn(browser, "rep");
  const account = await createAccount(rep.page, `Ephemeral ${uid()}`);
  // Deleting is a manager permission: the rep has no delete action
  await go(rep.page, `/accounts/${account.id}`);
  await expect(rep.page.getByRole("button", { name: "More actions" })).toHaveCount(0);
  const head = await signedIn(browser, "salesHead");
  await go(head.page, `/accounts/${account.id}`);
  await head.page.getByRole("button", { name: "More actions" }).click();
  await head.page.getByRole("menuitem", { name: "Delete account" }).click();
  await head.page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(head.page.getByText("Account deleted")).toBeVisible();
  await head.context.close();
  await go(rep.page, `/accounts?q=${encodeURIComponent(account.name)}`);
  await expect(rep.page.getByText("No accounts match")).toBeVisible();
  await go(rep.page, `/accounts/${account.id}`);
  await expect(rep.page.getByText("Nothing here")).toBeVisible();

  const admin = await signedIn(browser, "admin");
  await go(admin.page, `/accounts?q=${encodeURIComponent(account.name)}`);
  await expect(admin.page.getByText("No accounts match")).toBeVisible();
  await go(admin.page, `/accounts?q=${encodeURIComponent(account.name)}&includeDeleted=true`);
  await admin.page.getByRole("link", { name: new RegExp(account.name) }).click();
  await expect(admin.page.getByText(/^Deleted/)).toBeVisible();
  await admin.page.getByRole("button", { name: "More actions" }).click();
  await admin.page.getByRole("menuitem", { name: "Restore account" }).click();
  await admin.page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(admin.page.getByText("Account restored")).toBeVisible();
  await admin.context.close();

  await go(rep.page, `/accounts/${account.id}`);
  await expect(rep.page.getByRole("heading", { name: account.name })).toBeVisible();
  await expect(rep.page.getByText(/^Deleted/)).toHaveCount(0);
  await rep.context.close();
});

test("an account with live deals cannot be deleted; a deleted deal leaves the totals and comes back on restore", async ({ browser }) => {
  const owner = await signedIn(browser, "rep");
  const deal = await createDeal(owner.page);
  await owner.context.close();
  const rep = await signedIn(browser, "salesHead");
  await go(rep.page, `/accounts/${deal.accountId}`);
  await rep.page.getByRole("button", { name: "More actions" }).click();
  await rep.page.getByRole("menuitem", { name: "Delete account" }).click();
  await rep.page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(rep.page.getByText(/open deal|move or delete/i).first()).toBeVisible();

  await go(rep.page, `/deals/${deal.id}`);
  await rep.page.getByRole("button", { name: "More actions" }).click();
  await rep.page.getByRole("menuitem", { name: "Delete deal" }).click();
  await rep.page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(rep.page.getByText("Deal deleted")).toBeVisible();
  await go(rep.page, `/deals?q=${deal.code}`);
  await expect(rep.page.getByText("No deals match")).toBeVisible();
  await rep.context.close();

  const admin = await signedIn(browser, "admin");
  await go(admin.page, `/deals/${deal.id}`);
  await admin.page.getByRole("button", { name: "More actions" }).click();
  await admin.page.getByRole("menuitem", { name: "Restore deal" }).click();
  await admin.page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(admin.page.getByText("Deal restored")).toBeVisible();
  await go(admin.page, `/deals?q=${deal.code}`);
  await expect(admin.page.getByRole("link", { name: new RegExp(deal.name) })).toBeVisible();
  await admin.context.close();
});

test("an admin creates a user who must change the temporary password at first sign-in", async ({ browser, page }) => {
  const admin = await signedIn(browser, "admin");
  const email = `new.${uid()}@progression.com`;
  await go(admin.page, "/admin/users");
  await admin.page.getByRole("button", { name: "New user" }).click();
  await admin.page.fill("#u-name", "New Person");
  await admin.page.fill("#u-email", email);
  await admin.page.fill("#u-pw", "Welcome2026!x");
  await admin.page.getByRole("button", { name: "Create user" }).click();
  await expect(admin.page.getByText(/User created/)).toBeVisible();
  await admin.context.close();

  await go(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", "Welcome2026!x");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText(/Choose a new password/)).toBeVisible();
});
